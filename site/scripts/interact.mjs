/* Interaction smoke test of the built site: the flows the v2 port touches.
   Starts its own preview server if one is not already listening. */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire('/opt/homebrew/lib/node_modules/@playwright/cli/');
const { chromium } = require('playwright');

const PORT = 4322;
const SITE = `http://localhost:${PORT}/`;

async function ensureServer() {
  const up = async () => {
    try {
      const res = await fetch(SITE);
      return res.ok;
    } catch {
      return false;
    }
  };
  if (await up()) return null;
  // the Vercel adapter has no `astro preview`; serve the deployed static output directly
  const child = spawn('node', ['scripts/serve-static.mjs', String(PORT)], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    if (await up()) return child;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}
const server = await ensureServer();

let fail = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++; };
function check(cond, pass, failMsg) { if (cond) ok(pass); else bad(failMsg); }

const browser = await chromium.launch({ channel: 'chrome' });

/* Every page gets a stand-in for Cloudflare Turnstile that passes and hands out a fixed token: the
   suite stays offline, and the result does not depend on which site key the build carries (a real
   key is refused on localhost with error 110200). Routes registered later on a page take priority,
   so the contact block below can still count and inspect these requests. */
const TURNSTILE_STUB = `window.turnstile = {
  render: (el, o) => { window.__tsRender = { sitekey: o.sitekey, language: o.language }; return 'w1'; },
  getResponse: () => 'test-token', reset: () => { window.__tsResets = (window.__tsResets || 0) + 1; } };
window.onTurnstileLoad && window.onTurnstileLoad();`;
const newPage = browser.newPage.bind(browser);
browser.newPage = async (options) => {
  const page = await newPage(options);
  await page.route('https://challenges.cloudflare.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB }));
  return page;
};
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => bad(`page error: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') bad(`console error: ${m.text()}`); });

const atBottom = () => page.evaluate(() => {
  const s = document.querySelector('#scroller');
  return s.scrollTop >= s.scrollHeight - s.clientHeight - 2;
});
const scrollTop = () => page.evaluate(() => document.querySelector('#scroller').scrollTop);

await page.goto(SITE);
await page.waitForTimeout(3500); // loader (1200ms) + fonts

/* FR-47: loader ends, intro ready, v-stack fill mark present */
check(await page.evaluate(() => document.body.classList.contains('ready')), 'page loader ended, intro ready (FR-47)', 'loader never ended');
check(await page.evaluate(() => !!document.querySelector('.lmark .fillmark')), 'loader is the v-stack fill mark (FR-47, CR-07)', 'fillmark missing');
check(await page.evaluate(() => getComputedStyle(document.querySelector('.enter svg')).animationName === 'enterNudge'), 'enter arrow nudges on a loop: more to see below (owner direction)', 'enter arrow has no nudge animation');
check(await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden'), 'page scroll is owned by the island scroller', 'body still scrolls');

/* FR-10/FR-22: cards localized from the island, with the stagger class */
const card = await page.evaluate(() => {
  const c = document.querySelector('.card[data-id="project-2"]');
  return { h3: c.querySelector('h3').textContent, t: c.querySelector('.t').textContent, tags: c.querySelectorAll('.tags span').length, stagger: c.classList.contains('stagger') };
});
check(card.h3 === 'Short project headline' && card.t === 'Project 2 title' && card.tags === 2 && card.stagger, 'cards localized and carry .stagger (FR-10, CR-17)', `unexpected card: ${JSON.stringify(card)}`);

/* FR-02: enter works scrolls the island to the works section and the transition follows */
await page.click('#enterWorks');
await page.waitForTimeout(900);
const auto1 = await scrollTop();
await page.waitForTimeout(300);
const auto2 = await scrollTop();
check(auto2 > auto1, `the transition drives the view on its own clock (${auto1} -> ${auto2})`, `no auto-advance during the transition (${auto1} -> ${auto2})`);
await page.waitForTimeout(1600);   // rest of the transition + the flow-in lock
check(await atBottom(), 'enter works scrolled the island to the bottom', 'scroller not at bottom');
check(await page.evaluate(() => document.body.classList.contains('mode-works')), 'scroll-driven transition reached works mode (FR-02)', 'mode-works never set');
check(await page.evaluate(() => document.querySelector('#works').classList.contains('flow')), 'flow-in triggered at the end of the transition (owner direction)', 'works never got .flow');
check(await page.evaluate(() => getComputedStyle(document.querySelector('.works-footer')).opacity === '1'), 'flow-in settled: last item fully in (owner direction)', 'last flow item not settled');
check(await page.evaluate(() => getComputedStyle(document.querySelector('#works')).backgroundColor === 'rgba(0, 0, 0, 0)'), 'works paints no own background: the canvas is the single background (F2)', 'works still paints a background');
check(await page.evaluate(() => {
  const z = (sel) => getComputedStyle(document.querySelector(sel)).zIndex;
  return z('#grain') === '2' && z('.island > .plus-field') === '3' && z('.scroller') === '4';
}), 'plus-field paints above the canvas and below the content: cross grid visible in works (CR-23 fix)', 'stacking order hides the cross grid');
check(await page.evaluate(() => location.pathname === '/works'), 'works overview URL derived from scroll position (FR-16, CR-06)', `path is ${await page.evaluate(() => location.pathname)}`);

/* Suspension: while the flow-in is active, input cannot steer the works section */
await page.evaluate(() => { const s = document.querySelector('#scroller'); const rs = document.querySelector('#outro').offsetTop - 24; const R = (s.scrollHeight - s.clientHeight) - rs; s.scrollTop = rs + 0.5 * R; });
await page.waitForTimeout(200);
await page.evaluate(() => { const s = document.querySelector('#scroller'); const rs = document.querySelector('#outro').offsetTop - 24; const R = (s.scrollHeight - s.clientHeight) - rs; s.scrollTop = rs + 0.9 * R; });
await page.waitForTimeout(150);
if (await page.evaluate(() => document.querySelector('#works').classList.contains('flow'))) {
  await page.mouse.move(720, 500);
  await page.mouse.wheel(0, 400);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const steered = await page.evaluate(() => document.querySelector('#track').scrollLeft);
  check(steered === 0, `input cannot steer works while the flow-in is active (track ${steered})`, `track moved during the lock (${steered})`);
  await page.waitForTimeout(1400);
} else {
  check(false, 'flow-in active at p=0.9 for the suspension test', 'flow not active at p=0.9');
}
check(await page.evaluate(() => document.querySelector('#runway').offsetHeight > 0), 'runway spacer sized by layout()', 'runway has no height');
const trackScrollable = await page.evaluate(() => { const t = document.querySelector('#track'); return t.scrollWidth > t.clientWidth; });
check(trackScrollable, 'works track overflows horizontally (FR-04/FR-06)', 'track not scrollable');

/* Settle pause: wheel momentum arriving at works is absorbed before the jack takes over */
await page.mouse.move(720, 500);
await page.evaluate(() => { const s = document.querySelector('#scroller'); s.scrollTop = s.scrollHeight - s.clientHeight - 40; });
await page.waitForTimeout(150);
await page.mouse.wheel(0, 120);   // arrives at the bottom and opens the settle window
await page.waitForTimeout(80);
await page.mouse.wheel(0, 120);   // inside the window: absorbed
await page.waitForTimeout(60);
const paused = await page.evaluate(() => document.querySelector('#track').scrollLeft);
check(paused === 0, `settle pause absorbed wheel momentum on arrival (${paused})`, `jack started during the pause (${paused})`);
await page.waitForTimeout(1200);   // outlast the flow-in scroll lock
await page.mouse.wheel(0, 300);   // window closed: the jack takes over
await page.waitForTimeout(600);
const resumed = await page.evaluate(() => document.querySelector('#track').scrollLeft);
check(resumed > 0, `jack resumed after the pause (${resumed})`, 'jack did not resume after the pause');
await page.evaluate(() => { document.querySelector('#track').scrollLeft = 0; });
await page.waitForTimeout(400);

/* Hover scales the whole card from one origin, so the composition holds (F4) */
const cardRects = () => page.evaluate(() => {
  const c = document.querySelector('.card[data-id="project-2"]');
  const w = (sel) => c.querySelector(sel).getBoundingClientRect().width;
  return { thumb: w('.thumb'), meta: w('.meta'), tags: w('.tags') };
});
await page.mouse.move(720, 120);   // off the cards, or the baseline is already hovered
await page.waitForTimeout(400);
const hb = await cardRects();
await page.hover('.card[data-id="project-2"]');
await page.waitForTimeout(400);
const ha = await cardRects();
const ratios = [ha.thumb / hb.thumb, ha.meta / hb.meta, ha.tags / hb.tags];
check(Math.max(...ratios) - Math.min(...ratios) < 0.01 && ratios[0] > 1.02 && ratios[0] < 1.04, `hover scales the card as one unit (${ratios.map((r) => r.toFixed(3)).join(', ')}) (F4)`, `hover scales children unevenly (${ratios.map((r) => r.toFixed(3)).join(', ')})`);
await page.mouse.move(720, 120);
await page.waitForTimeout(300);

/* FR-06: at the bottom, vertical wheel moves the track sideways */
await page.mouse.move(720, 500);
const before = await page.evaluate(() => document.querySelector('#track').scrollLeft);
await page.mouse.wheel(0, 400);
await page.waitForTimeout(600);
const after = await page.evaluate(() => document.querySelector('#track').scrollLeft);
check(after > before, `scroll-jack moved track sideways (${before} -> ${after}) (FR-06)`, `wheel did not move track (${before} -> ${after})`);

/* FR-08: arrow keys step cards */
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(700);
const backLeft = await page.evaluate(() => document.querySelector('#track').scrollLeft);
check(backLeft <= before, `ArrowLeft stepped back to first card (scrollLeft ${backLeft}) (FR-08)`, `ArrowLeft did not return to first card (${backLeft})`);

/* CR-04: the indicator bar is a draggable slider */
const barBox = await page.locator('#bar').boundingBox();
await page.mouse.move(barBox.x + barBox.width * 0.9, barBox.y + barBox.height / 2);
await page.mouse.down();
await page.mouse.move(barBox.x + barBox.width * 0.95, barBox.y + barBox.height / 2, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(400);
const dragged = await page.evaluate(() => document.querySelector('#track').scrollLeft);
check(dragged > backLeft, `dragging the slider moved the track (${backLeft} -> ${dragged}) (FR-05, CR-04)`, `bar drag did not move track (${dragged})`);
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(600);

/* FR-13/FR-14: card click opens detail in place with its own URL */
await page.click('.card[data-id="project-1"]');
await page.waitForTimeout(900);
check(await page.evaluate(() => document.querySelector('#detail').classList.contains('open')), 'detail view opened in place (FR-13)', 'detail did not open');
check(await page.evaluate(() => location.pathname) === '/works/project-1', 'URL changed to the project URL (FR-14)', `path is ${await page.evaluate(() => location.pathname)}`);
const detailTitle = await page.evaluate(() => document.querySelector('#detailTitle').textContent);
check(detailTitle === 'Short project headline', `detail filled from project data ("${detailTitle}")`, `detail title wrong: "${detailTitle}"`);

/* FR-16: Escape closes and returns to the works overview URL */
await page.keyboard.press('Escape');
await page.waitForTimeout(900);
check(await page.evaluate(() => !document.querySelector('#detail').classList.contains('open')), 'Escape closed the detail view (FR-16)', 'detail still open');
check(await page.evaluate(() => location.pathname) === '/works', 'URL returned to the works overview (FR-16)', `path is ${await page.evaluate(() => location.pathname)}`);

/* FR-03: backward input at the first card scrolls back up through the transition */
const topBefore = await scrollTop();
await page.mouse.wheel(0, -600);
await page.waitForTimeout(400);
await page.mouse.wheel(0, -900);
await page.waitForTimeout(1200);
const topAfter = await scrollTop();
check(topAfter < topBefore, `wheel up scrolled the island back up (${topBefore} -> ${topAfter}) (FR-03)`, `wheel up did not scroll (${topBefore} -> ${topAfter})`);
await page.mouse.wheel(0, -2000);
await page.waitForTimeout(1200);
check(await page.evaluate(() => !document.body.classList.contains('mode-works')), 'reverse transition returned to intro mode (FR-03)', 'still in works mode');
check(await page.evaluate(() => !document.querySelector('#works').classList.contains('flow')), 'flow-in released on the way back up (owner direction)', '.flow still set after leaving works');

/* Nudge regression: scrollHeight must stay put while the flow-in plays (F3) */
const shBefore = await page.evaluate(() => document.querySelector('#scroller').scrollHeight);
await page.click('#enterWorks');
await page.waitForTimeout(1200);
const shDuring = await page.evaluate(() => document.querySelector('#scroller').scrollHeight);
check(shBefore === shDuring, `scrollHeight stable across the flow-in (${shBefore}) (F3)`, `scrollHeight moved during the flow-in (${shBefore} -> ${shDuring})`);
await page.waitForTimeout(1600);

/* FR-21: language toggle localizes interface and cards */
await page.click('[data-lang="de"]');
await page.waitForTimeout(400);
const de = await page.evaluate(() => ({ lang: document.documentElement.lang, about: document.querySelector('[data-i18n="about"]').textContent, runway: document.querySelector('#runway').offsetHeight }));
check(de.lang === 'de' && de.about === '[ über mich ]', `language toggle switched interface copy (${de.about}) (FR-21)`, `de toggle wrong: ${JSON.stringify(de)}`);
check(de.runway > 0, 'runway re-measured after language switch (layout via applyLang)', 'runway collapsed after lang switch');
await page.click('[data-lang="en"]');
await page.waitForTimeout(300);

/* FR-24: theme toggle */
await page.click('#themeBtn');
await page.waitForTimeout(300);
check(await page.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'theme toggle set dark mode (FR-24)', 'theme not dark');
await page.click('#themeBtn');

/* FR-26/FR-28/FR-29: contact overlay + validation */
await page.locator('[data-open-contact]:visible').first().click();
await page.waitForTimeout(400);
check(await page.evaluate(() => document.querySelector('#contact').open), 'contact overlay opened (FR-26)', 'contact did not open');
await page.click('#sendBtn');
await page.waitForTimeout(300);
const invalid = await page.evaluate(() => ['f-name', 'f-email', 'f-message'].map((id) => document.getElementById(id).dataset.invalid));
check(invalid.every((v) => v === 'true'), 'empty submit flags all three fields (FR-28/FR-29)', `invalid flags: ${JSON.stringify(invalid)}`);
const errMsg = await page.evaluate(() => document.querySelector('#e-name').textContent);
check(errMsg === 'Enter your name.', `inline error shown ("${errMsg}") (FR-29)`, `error text wrong: "${errMsg}"`);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check(await page.evaluate(() => !document.querySelector('#contact').open), 'Escape closed the contact overlay (FR-27)', 'contact still open');

/* Mobile footer: collapsed by default, one tap reveals the links (CR-25, FR-12) */
const mob = await browser.newPage({ viewport: { width: 360, height: 780 } });
mob.on('pageerror', (e) => bad(`mobile page error: ${e.message}`));
await mob.goto(SITE);
await mob.waitForTimeout(3500);
await mob.click('#enterWorks');
await mob.waitForTimeout(3000);
const moreH = () => mob.evaluate(() => document.querySelector('.wf-more-inner').getBoundingClientRect().height);
const chev = () => mob.evaluate(() => getComputedStyle(document.querySelector('.wf-toggle svg')).transform);
const ariaExp = () => mob.evaluate(() => document.querySelector('#wfToggle').getAttribute('aria-expanded'));
check(await moreH() < 2, 'mobile footer starts collapsed by default (CR-25)', 'footer not collapsed at start');
check(await ariaExp() === 'false', 'aria-expanded false while collapsed', 'aria-expanded not false at start');
const chevClosed = await chev();
await mob.click('#wfToggle');
await mob.waitForTimeout(500);
check(await moreH() > 20, 'one tap on the chevron reveals links and copyright (FR-12, CR-25)', 'more-block not visible after expand');
check(await ariaExp() === 'true', 'aria-expanded true while expanded', 'aria-expanded not true when expanded');
const al = await mob.evaluate(() => {
  const x = (sel) => +document.querySelector(sel).getBoundingClientRect().x.toFixed(1);
  return { btn: x('.works-footer .btn'), nav: x('.works-footer nav'), copy: x('.works-footer .copyright') };
});
check(Math.abs(al.btn - al.nav) < 1 && Math.abs(al.btn - al.copy) < 1, `links and copyright left-aligned with Contact (nav ${al.nav}, copy ${al.copy} vs btn ${al.btn})`, `footer block not left-aligned (nav ${al.nav}, copy ${al.copy} vs btn ${al.btn})`);
const chevOpen = await chev();
check(chevOpen !== chevClosed && chevClosed !== 'none', `chevron animates between states (${chevClosed} -> ${chevOpen})`, 'chevron did not rotate between states');
await mob.click('#wfToggle');
await mob.waitForTimeout(500);
check(await moreH() < 2, 'chevron collapses the footer again', 'more-block still visible after second collapse');
const sym = await mob.evaluate(() => {
  const f = document.querySelector('.works-footer').getBoundingClientRect();
  const b = document.querySelector('.works-footer .btn').getBoundingClientRect();
  return { top: +(b.top - f.top).toFixed(1), bottom: +(f.bottom - b.bottom).toFixed(1) };
});
check(Math.abs(sym.top - sym.bottom) < 1.5, `collapsed footer wraps snugly around the row (top ${sym.top} / bottom ${sym.bottom})`, `collapsed footer padding asymmetric (top ${sym.top} / bottom ${sym.bottom})`);
await mob.close();

/* CR-22 regression: after a reverse, one small nudge down must re-trigger the clock-driven
   transition. The reverse leaves scrollTop at the rounded trigger position, which on some
   viewports is just above it (failed at 1280x777 before the fix, passed at 1440x900). */
for (const vp of [{ width: 1280, height: 777 }, { width: 1440, height: 900 }]) {
  const pg = await browser.newPage({ viewport: vp });
  pg.on('pageerror', (e) => bad(`page error (${vp.width}x${vp.height}): ${e.message}`));
  await pg.goto(SITE);
  await pg.waitForTimeout(3500);
  await pg.mouse.move(vp.width / 2, vp.height / 2);
  const pst = () => pg.evaluate(() => document.querySelector('#scroller').scrollTop);
  const inWorks = () => pg.evaluate(() => document.body.classList.contains('mode-works'));
  await pg.click('#enterWorks');
  await pg.waitForTimeout(3500);
  await pg.mouse.wheel(0, -200);            // reverse at the first card
  await pg.waitForTimeout(2600);
  const back = !(await inWorks());
  await pg.mouse.wheel(0, 120);             // one small nudge down
  await pg.waitForTimeout(250);
  const s1 = await pst();
  await pg.waitForTimeout(700);
  const s2 = await pst();
  await pg.waitForTimeout(2500);
  check(back && s2 > s1 + 5 && (await inWorks()),
    `nudge after a reverse re-triggers the transition at ${vp.width}x${vp.height} (${s1} -> ${s2}) (FR-02, CR-22)`,
    `no re-trigger after a reverse at ${vp.width}x${vp.height} (back ${back}, ${s1} -> ${s2}, works ${await inWorks()})`);
  await pg.close();
}

/* PSP 4.2, ADR-0006 and ADR-0012: real paths in two languages. FT-20 (language from the URL,
   then the saved choice, then the browser), FT-21 (toggle switches the address in place),
   FT-15 (direct project URLs), plus the conversion of old #/works links. */
{
  const at = async (url, options = {}, before) => {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 800 }, ...options });
    pg.on('pageerror', (e) => bad(`page error (routes ${url}): ${e.message}`));
    if (before) await pg.addInitScript(before);
    await pg.goto(SITE + url.replace(/^\//, ''));
    await pg.waitForTimeout(3500);
    return pg;
  };
  const view = (pg) => pg.evaluate(() => ({
    path: location.pathname, hash: location.hash, lang: document.documentElement.lang,
    trigger: document.querySelector('[data-i18n="trigger"]').textContent,
    detail: document.querySelector('#detail').classList.contains('open') ? document.querySelector('#detailTitle').textContent : null,
  }));
  const DE_TRIGGER = 'Hier sind einige meiner Arbeiten';

  let pg = await at('/', { locale: 'de-DE' });
  let v = await view(pg);
  check(v.path === '/de/' && v.lang === 'de' && v.trigger === DE_TRIGGER, `German browser at / switches to /de/ in German (FR-20)`, `German browser at /: ${JSON.stringify(v)}`);
  await pg.close();

  pg = await at('/', { locale: 'fr-FR' });
  v = await view(pg);
  check(v.path === '/' && v.lang === 'en', 'French browser at / stays English at / (FR-20)', `French browser at /: ${JSON.stringify(v)}`);
  await pg.close();

  pg = await at('/de/', { locale: 'en-US' });
  v = await view(pg);
  check(v.path === '/de/' && v.lang === 'de' && v.trigger === DE_TRIGGER, 'a /de/ URL shows German with an English browser (FR-20)', `/de/ with English browser: ${JSON.stringify(v)}`);
  await pg.close();

  pg = await at('/works', { locale: 'en-US' }, () => localStorage.setItem('lang', 'de'));
  v = await view(pg);
  check(v.path === '/de/works' && v.lang === 'de', 'a saved German choice moves /works to /de/works (FR-20)', `saved de at /works: ${JSON.stringify(v)}`);
  await pg.close();

  pg = await at('/works/project-2', { locale: 'en-US' });
  v = await view(pg);
  const p2 = v.detail;
  check(v.path === '/works/project-2' && !!p2, `direct project URL opens that project's detail view (${p2}) (FR-15)`, `direct /works/project-2: ${JSON.stringify(v)}`);
  const navs = [];   // document requests only: replaceState also fires framenavigated
  pg.on('request', (r) => { if (r.resourceType() === 'document') navs.push(r.url()); });
  await pg.click('[data-lang="de"]');
  await pg.waitForTimeout(400);
  v = await view(pg);
  check(v.path === '/de/works/project-2' && v.lang === 'de' && v.detail !== null && navs.length === 0,
    'toggle moves the address to /de/works/project-2 in place, detail stays open, no new document (FR-21)', `toggle on a project: ${JSON.stringify({ v, navs })}`);
  await pg.close();

  pg = await at('/#/works/project-1', { locale: 'en-US' });
  v = await view(pg);
  check(v.path === '/works/project-1' && v.hash === '' && !!v.detail, 'an old #/works link becomes its real path and opens the project', `legacy hash: ${JSON.stringify(v)}`);
  await pg.close();

  pg = await at('/de/works', { locale: 'en-US' });
  const cardHref = await pg.evaluate(() => document.querySelector('.card').getAttribute('href'));
  await pg.click('.card');
  await pg.waitForTimeout(700);
  const opened = await view(pg);
  await pg.goBack();
  await pg.waitForTimeout(900);
  v = await view(pg);
  check(cardHref.startsWith('/de/works/') && opened.path === cardHref && v.path === '/de/works' && v.detail === null,
    `German card opens ${cardHref}; Back returns to /de/works (FR-14, FR-16)`, `German card/back: ${JSON.stringify({ cardHref, opened, v })}`);
  await pg.close();
}

/* PSP 5.2 contact flow (FT-32 to FT-36, browser side). Cloudflare's script is replaced by a stub
   that passes and hands out a fixed token, and /api/contact is answered per case, so the run needs
   no network and sends no mail; the endpoint itself is covered by tests/contact.test.js. */
{
  const pg = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  pg.on('pageerror', (e) => bad(`page error (contact): ${e.message}`));
  const cloudflare = [];
  await pg.route('https://challenges.cloudflare.com/**', (route) => {
    cloudflare.push(route.request().url());
    route.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB });
  });
  let reply = { status: 200, body: { ok: true } };
  const posted = [];
  await pg.route('**/api/contact', (route) => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch { bad('the contact form posted a body that is not JSON'); }
    posted.push(body);
    route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) });
  });
  await pg.goto(SITE);
  await pg.waitForTimeout(3500);
  check(cloudflare.length === 0, 'no Cloudflare request before the contact overlay opens (privacy)', `Cloudflare contacted before the form opened (${cloudflare.length})`);
  await pg.click('.site-header [data-open-contact]');
  await pg.waitForFunction(() => window.__tsRender, null, { timeout: 3000 }).catch(() => {});
  const render = await pg.evaluate(() => window.__tsRender || null);
  check(cloudflare.length === 1 && render && render.sitekey && render.language === 'en',
    'Turnstile loads on first open and renders with the site key (FR-32)', `Turnstile not rendered: ${JSON.stringify({ requests: cloudflare.length, render })}`);
  const fill = async () => {
    await pg.fill('#name', 'Ada Lovelace');
    await pg.fill('#email', 'ada@example.com');
    await pg.fill('#message', 'Hello from the e2e run.');
  };
  const send = async () => { await pg.click('#sendBtn'); await pg.waitForTimeout(300); };
  const state = () => pg.evaluate(() => ({
    status: document.querySelector('#status').textContent, ok: document.querySelector('#status').classList.contains('ok'),
    name: document.querySelector('#name').value, message: document.querySelector('#message').value,
    emailErr: document.querySelector('#e-email').textContent, resets: window.__tsResets || 0,
  }));

  await fill(); reply = { status: 502, body: { error: 'delivery' } }; await send();
  let st = await state();
  check(st.status.startsWith('The message could not be sent') && st.name === 'Ada Lovelace' && st.message.length > 0,
    'delivery failure shows the error and keeps the text (FR-36)', `502 handling wrong: ${JSON.stringify(st)}`);

  reply = { status: 403, body: { error: 'verification' } }; await send();
  st = await state();
  check(st.status.startsWith('The spam check') && st.name === 'Ada Lovelace', 'failed verification asks to retry and keeps the text (FR-32)', `403 handling wrong: ${JSON.stringify(st)}`);

  reply = { status: 400, body: { error: 'invalid', fields: ['email'] } }; await send();
  st = await state();
  check(st.emailErr === 'Enter a valid email address.', 'server field check marks the named field (FR-29)', `400 handling wrong: ${JSON.stringify(st)}`);

  reply = { status: 200, body: { ok: true } }; await send();
  st = await state();
  const last = posted[posted.length - 1] || {};
  check(st.ok && st.status === 'Thank you. Your message is on its way.' && st.name === '' && st.message === ''
      && last.token === 'test-token' && last.name === 'Ada Lovelace' && last.lang === 'en' && st.resets >= 4,
    'successful send confirms on screen, clears the form and posts the token (FR-34, FR-35)', `200 handling wrong: ${JSON.stringify({ st, last })}`);
  await pg.close();
}

/* FR-44, FR-45, ADR-0012: the footer's legal links follow the active language, and the legal
   pages scroll, switch language by link and remember the choice for the main page (FR-21). */
{
  const pg = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  pg.on('pageerror', (e) => bad(`page error (legal): ${e.message}`));
  await pg.goto(SITE);
  await pg.waitForTimeout(3500);
  const hrefs = () => pg.evaluate(() => ({
    imp: document.querySelector('[data-legal="impressum"]').getAttribute('href'),
    pri: document.querySelector('[data-legal="privacy"]').getAttribute('href'),
  }));
  const en = await hrefs();
  await pg.click('[data-lang="de"]');
  const de = await hrefs();
  check(en.imp === '/impressum' && en.pri === '/privacy' && de.imp === '/de/impressum' && de.pri === '/de/datenschutz',
    `footer legal links follow the language (${en.imp}, ${en.pri} -> ${de.imp}, ${de.pri}) (FR-44, FR-45)`,
    `legal links do not follow the language: ${JSON.stringify({ en, de })}`);
  await pg.goto(SITE + 'de/datenschutz');
  const legal = await pg.evaluate(() => {
    const before = window.scrollY; window.scrollTo(0, 400);
    return { lang: document.documentElement.lang, h1: document.querySelector('h1').textContent, scrolled: window.scrollY > before };
  });
  check(legal.lang === 'de' && legal.h1.startsWith('Datenschutz') && legal.scrolled,
    'German privacy page renders in German and scrolls (FR-45)', `legal page wrong: ${JSON.stringify(legal)}`);
  await pg.click('.lang a[data-set-lang="en"]');
  await pg.waitForLoadState();
  const after = await pg.evaluate(() => ({ path: location.pathname, stored: localStorage.getItem('lang'), lang: document.documentElement.lang }));
  check(after.path === '/privacy' && after.stored === 'en' && after.lang === 'en',
    'legal EN/DE switch opens the counterpart page and saves the choice (FR-21, ADR-0012)', `legal switch wrong: ${JSON.stringify(after)}`);
  await pg.close();
}

/* Settle pause at the first card: momentum that jacks the track back to card 1 must not roll
   straight into the reverse transition (the reverse branch used to run before the settle check). */
{
  const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await pg.goto(SITE);
  await pg.waitForTimeout(3500);
  await pg.mouse.move(720, 450);
  await pg.click('#enterWorks');
  await pg.waitForTimeout(3500);
  await pg.mouse.wheel(0, 400);             // jack right
  await pg.waitForTimeout(900);
  await pg.mouse.wheel(0, -600);            // jack back to the first card
  await pg.waitForFunction(() => document.querySelector('#track').scrollLeft <= 2, null, { timeout: 3000, polling: 'raf' });
  const st0 = await pg.evaluate(() => document.querySelector('#scroller').scrollTop);
  await pg.mouse.wheel(0, -120);            // momentum tail inside the 250 ms window
  await pg.waitForTimeout(120);
  const st1 = await pg.evaluate(() => document.querySelector('#scroller').scrollTop);
  check(Math.abs(st1 - st0) <= 2, `settle pause holds at the first card (${st0} -> ${st1})`, `momentum rolled into the reverse transition (${st0} -> ${st1})`);
  await pg.waitForTimeout(400);
  await pg.mouse.wheel(0, -120);            // window closed: a deliberate wheel up reverses
  await pg.waitForTimeout(500);
  const st2 = await pg.evaluate(() => document.querySelector('#scroller').scrollTop);
  check(st2 < st1 - 5, `wheel up after the pause starts the reverse (${st1} -> ${st2}) (FR-03)`, `no reverse after the pause (${st1} -> ${st2})`);
  await pg.close();
}

/* Mobile regression (CR-22, NFR-04): a touch flick that crosses the trigger line must carry
   straight into the transition. Before the fix, the browser's fling momentum fought the clock (the
   view jerked backwards) and the clock restarted from standstill (a dead spot of -8 px per 100 ms). */
{
  const pg = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await pg.goto(SITE);
  await pg.waitForTimeout(3500);
  await pg.evaluate(() => {
    window.__log = []; const s = document.querySelector('#scroller'); const t0 = performance.now();
    const tick = () => { window.__log.push([performance.now() - t0, s.scrollTop]); if (performance.now() - t0 < 3500) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const cdp = await pg.context().newCDPSession(pg);
  await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 600, yDistance: -900, speed: 3000, gestureSourceType: 'touch', preventFling: false });
  await pg.waitForTimeout(3600);
  const { log, max } = await pg.evaluate(() => { const s = document.querySelector('#scroller'); return { log: window.__log, max: s.scrollHeight - s.clientHeight }; });
  let reversals = 0, minWin = Infinity;
  for (let i = 2; i < log.length; i++) {
    const d1 = log[i - 1][1] - log[i - 2][1], d2 = log[i][1] - log[i - 1][1];
    if (d1 > 1 && d2 < -1) reversals++;
  }
  const end = log.findIndex((r) => r[1] >= max * 0.95);
  for (let i = 0; i < end; i++) {
    const j = log.findIndex((r) => r[0] >= log[i][0] + 100);
    if (j < 0 || j > end) break;
    minWin = Math.min(minWin, log[j][1] - log[i][1]);
  }
  check(end > 0 && reversals === 0 && minWin > 5,
    `touch flick carries into the transition without a pull-back or dead spot (least ${Math.round(minWin)} px per 100 ms) (CR-22)`,
    `mobile flick glitch: ${JSON.stringify({ reached: end > 0, reversals, leastPer100ms: Math.round(minWin) })}`);
  await pg.close();
}

/* NFR-04: while the transition runs, the canvas is cleared once per frame, not twice
   (animTick renders; the scroll event its scrollTop write fires must not render again). */
{
  const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await pg.addInitScript(() => {
    window.__clears = 0; window.__frames = 0;
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...a) { window.__clears++; return clear.apply(this, a); };
    const tick = () => { window.__frames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await pg.goto(SITE);
  await pg.waitForTimeout(3500);
  await pg.click('#enterWorks');
  await pg.waitForTimeout(400);             // the transition is under way
  await pg.evaluate(() => { window.__clears = 0; window.__frames = 0; });
  await pg.waitForTimeout(800);
  const { clears, frames } = await pg.evaluate(() => ({ clears: window.__clears, frames: window.__frames }));
  const ratio = clears / Math.max(1, frames);
  check(frames > 10 && ratio <= 1.1, `one canvas draw per frame during the transition (${clears} clears / ${frames} frames) (NFR-04)`,
    `canvas drawn ${ratio.toFixed(2)}x per frame during the transition (${clears} clears / ${frames} frames)`);

  /* Keys cannot scroll the island while the transition plays: scroll keys are prevented. */
  await pg.waitForTimeout(3000);
  await pg.mouse.move(720, 450);
  await pg.mouse.wheel(0, -200);            // start the reverse
  await pg.waitForTimeout(300);
  await pg.evaluate(() => {
    window.__prevented = null;
    window.addEventListener('keydown', (e) => { window.__prevented = e.defaultPrevented; }, { once: true });
    document.querySelector('#scroller').focus({ preventScroll: true });
  });
  await pg.keyboard.press('PageDown');
  check(await pg.evaluate(() => window.__prevented === true), 'scroll keys are suppressed while the transition plays (CR-22)',
    'PageDown was not prevented during the transition');
  await pg.close();
}

await browser.close();
if (server) {
  try { process.kill(-server.pid); } catch { /* already gone */ }
}
console.log(fail === 0 ? '\nPASS — interaction flows work in the built site' : `\nFAIL — ${fail} problem(s)`);
process.exit(fail === 0 ? 0 : 1);
