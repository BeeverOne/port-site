/* End-to-end suite of the built site (ADR-0011, QS-05): every flow runs in Chromium (installed Chrome),
   WebKit (Safari's engine) and Firefox. Ported from scripts/interact.mjs, one test per block; each
   former check is a soft assertion, so one failure does not hide the rest of the block.
   Turnstile is stubbed on every page and /api/contact is answered per test, so the suite is offline
   and sends no mail; the endpoint itself is covered by tests/contact.test.js.
   Run after a build: npm run build && npm run test:e2e (playwright.config.mjs serves the output). */
import { test, expect } from '@playwright/test';

const SITE = 'http://localhost:4322/';
test.describe.configure({ timeout: 120_000 });

/* A stand-in for Cloudflare Turnstile that passes and hands out a fixed token: the suite stays offline,
   and the result does not depend on which site key the build carries (a real key is refused on
   localhost with error 110200). Routes registered later on a page take priority. */
const TURNSTILE_STUB = `window.turnstile = {
  render: (el, o) => { window.__tsRender = { sitekey: o.sitekey, language: o.language }; return 'w1'; },
  getResponse: () => 'test-token', reset: () => { window.__tsResets = (window.__tsResets || 0) + 1; } };
window.onTurnstileLoad && window.onTurnstileLoad();`;
async function openPage(browser, options = {}) {
  const page = await browser.newPage(options);
  await page.route('https://challenges.cloudflare.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB }));
  return page;
}
/* The original suite's check(): the pass text is kept for readers, the fail text is what the report shows. */
// eslint-disable-next-line no-unused-vars
const check = (cond, pass, failMsg) => expect.soft(Boolean(cond), failMsg).toBe(true);
const bad = (msg) => expect.soft(false, msg).toBe(true);

test('main flow: loader, transition, works track, detail, reverse, language, theme, contact (FR-02 to FR-29)', async ({ browser, browserName }) => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
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
    check(await page.evaluate(() => document.querySelector('#works').inert === true && document.querySelector('#intro').inert === false), 'works is inert while the intro shows (CR-15)', 'works focusable during intro');
    check(await page.evaluate(() => getComputedStyle(document.querySelector('.btn-contact'), '::before').animationDuration === '7s'), 'scan cycle is 7s with hover neutralised (CR-12)', 'scan duration not 7s');

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
    check(await page.evaluate(() => document.querySelector('#intro').inert === true && document.querySelector('#works').inert === false), 'off-stage half is inert in works mode (CR-15)', 'inert not split at the mode-works boundary');
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
    await page.focus('#bar');
    await page.keyboard.press('End');
    await page.waitForTimeout(700);
    check(await page.evaluate(() => { const t = document.querySelector('#track'); return t.scrollLeft >= t.scrollWidth - t.clientWidth - 2; }), 'End key jumps the slider to the last card (CR-04)', 'End did not reach the last card');
    const vt = await page.evaluate(() => document.querySelector('#bar').getAttribute('aria-valuetext'));
    check(typeof vt === 'string' && vt.endsWith('5') && vt.toLowerCase().startsWith('project'), `aria-valuetext speaks the position ("${vt}") (CR-11)`, `aria-valuetext wrong: "${vt}"`);
    await page.keyboard.press('Home');
    await page.waitForTimeout(700);
    check(await page.evaluate(() => document.querySelector('#track').scrollLeft <= 2), 'Home key returns the slider to the first card (CR-04)', 'Home did not return to the first card');
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
});

test('mobile footer: collapsed by default, one tap reveals the links (CR-25, FR-12)', async ({ browser, browserName }) => {
    const mob = await openPage(browser, { viewport: { width: 360, height: 780 } });
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
});

test('a nudge after a reverse re-triggers the transition (CR-22)', async ({ browser, browserName }) => {
    for (const vp of [{ width: 1280, height: 777 }, { width: 1440, height: 900 }]) {
      const pg = await openPage(browser, { viewport: vp });
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
});

test('real paths in two languages (FT-15, FT-20, FT-21, ADR-0006, ADR-0012)', async ({ browser, browserName }) => {

      const at = async (url, options = {}, before) => {
        const pg = await openPage(browser, { viewport: { width: 1280, height: 800 }, ...options });
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

      pg = await at('/works', { locale: 'en-US' }, () => { if (window === window.top) localStorage.setItem('lang', 'de'); });   // init scripts also run in the sandboxed preview iframe, which has no storage
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

});

test('CMS blocks and media items (FT-17, FT-21, FT-50 to FT-52, NFT-05)', async ({ browser, browserName }) => {

      /* the detail view is its own scroll container: media below its fold arm only when scrolled near */
      const scrollDetail = async (page) => {
        for (let i = 0; i < 6; i++) { await page.evaluate(() => { const d = document.querySelector('#detail'); d.scrollTop += d.clientHeight * 0.8; }); await page.waitForTimeout(250); }
      };
      const mediaUrl = (u) => /\/_astro\/.*\.(webp|png|jpe?g|avif)|\/media\/|\/previews\//.test(u);
      let pg = await openPage(browser, { viewport: { width: 1280, height: 800 } });
      pg.on('pageerror', (e) => bad(`page error (blocks): ${e.message}`));
      const early = [];
      pg.on('request', (r) => { if (mediaUrl(r.url())) early.push(r.url()); });
      await pg.goto(SITE);
      await pg.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 8000 });
      check(early.length === 0, 'no works media requested before the intro is ready (NFT-05)', `works media loaded early: ${early.join(', ')}`);
      const thumbs = await pg.evaluate(() => [...document.querySelectorAll('.card .thumb')].map((t) => Math.round(t.getBoundingClientRect().height)));
      check(new Set(thumbs).size === 1, `image and placeholder thumbnails share one height (${thumbs.join('/')} px) (FR-10)`, `thumbnail heights differ: ${thumbs.join('/')}`);
      await pg.close();

      pg = await openPage(browser, { viewport: { width: 1280, height: 800 } });
      pg.on('pageerror', (e) => bad(`page error (blocks): ${e.message}`));
      await pg.goto(SITE + 'works/project-1');
      await pg.waitForTimeout(4000);
      await scrollDetail(pg);
      await pg.waitForTimeout(800);
      const blocks = await pg.evaluate(() => {
        const set = document.querySelector('.detail-blocks:not([hidden])');
        return set && {
          project: set.dataset.project, lang: set.dataset.lang,
          kinds: [...set.children].map((c) => c.classList.contains('block-text') ? 'text' : c.querySelector('img') ? 'image' : c.querySelector('video') ? 'video' : c.querySelector('iframe') ? 'preview' : '?'),
          states: [...set.querySelectorAll('[data-media]')].map((m) => m.dataset.state),
          sandbox: set.querySelector('iframe')?.getAttribute('sandbox'),
          otherSetsMediaArmed: [...document.querySelectorAll('.detail-blocks[hidden] [data-media][data-state]')].length,
        };
      });
      check(blocks && blocks.project === 'project-1' && blocks.kinds.join() === 'text,image,video,preview' && blocks.states.every((s) => s === 'loaded'),
        `project blocks show in CMS order and load (${blocks?.kinds.join(', ')}; ${blocks?.states.join(', ')}) (FR-17)`, `blocks wrong: ${JSON.stringify(blocks)}`);
      check(blocks?.sandbox === 'allow-scripts' && blocks.otherSetsMediaArmed === 0,
        'preview iframe is sandboxed without allow-same-origin; hidden blocks load nothing (ADR-0008, NFR-05)', `sandbox/hidden: ${JSON.stringify(blocks)}`);
      const frame = pg.frameLocator('.detail-blocks:not([hidden]) iframe');
      await frame.locator('#size').fill('50');
      const dot = await frame.locator('#dot').evaluate((d) => d.style.width);
      check(dot === '50px', `interactive preview responds to input (dot ${dot}) (FR-17)`, `preview did not respond (dot ${dot})`);
      await pg.click('[data-lang="de"]');
      await pg.waitForTimeout(400);
      const de = await pg.evaluate(() => { const s = document.querySelector('.detail-blocks:not([hidden])'); return s && { lang: s.dataset.lang, text: s.querySelector('.block-text p').textContent.slice(0, 20) }; });
      check(de?.lang === 'de' && de.text.startsWith('Platzhalter'), `language switch swaps the open project's blocks (${de?.text}) (FR-21)`, `blocks after switch: ${JSON.stringify(de)}`);
      await pg.close();

      /* FT-50: delayed media show the loader at the final size, and nothing moves when they arrive */
      pg = await openPage(browser, { viewport: { width: 1280, height: 800 } });
      // delay only the first request per file: WebKit fetches video as several byte ranges in a row,
      // and delaying each one would stall the video three times over
      const delayed = new Set();
      await pg.route(/\/_astro\/.*\.webp|\/media\//, async (route) => {
        const url = route.request().url();
        if (!delayed.has(url)) { delayed.add(url); await new Promise((r) => setTimeout(r, 7000)); }
        await route.continue();
      });
      await pg.goto(SITE + 'works/project-1');
      await pg.waitForTimeout(3400);
      await scrollDetail(pg);
      const during = await pg.evaluate(() => [...document.querySelectorAll('.detail-blocks:not([hidden]) [data-media]')].map((m) => ({
        state: m.dataset.state, h: Math.round(m.getBoundingClientRect().height), loader: getComputedStyle(m.querySelector('.media-loader')).display,
        anim: getComputedStyle(m.querySelector('.mfill')).animationName })));
      await pg.waitForTimeout(7000);
      const after = await pg.evaluate(() => [...document.querySelectorAll('.detail-blocks:not([hidden]) [data-media]')].map((m) => ({
        state: m.dataset.state, h: Math.round(m.getBoundingClientRect().height) })));
      check(during.slice(0, 2).every((m) => m.state === 'loading' && m.loader === 'flex' && m.anim === 'rise') && after.every((m) => m.state === 'loaded')
          && during.every((m, i) => m.h === after[i].h && m.h > 0),
        `media loaders show at the final size and nothing shifts (${during.map((m) => m.h).join('/')} px) (FR-50, NFR-03)`, `media loading: ${JSON.stringify({ during, after })}`);
      await pg.close();

      /* FT-51: an error shows the message and retry at once; a stalled item after 15 s; retry reloads */
      pg = await openPage(browser, { viewport: { width: 1280, height: 800 } });
      let blockImg = true, holdPreview = true;
      await pg.route(/\/_astro\/.*\.webp/, (route) => (blockImg && route.request().url().includes('image') ? route.abort() : route.continue()));
      await pg.route(/\/previews\//, async (route) => { if (holdPreview) return; await route.continue(); });   // held: never answers
      await pg.goto(SITE + 'works/project-1');
      await pg.waitForTimeout(4000);
      await scrollDetail(pg);
      await pg.waitForTimeout(500);
      const state = () => pg.evaluate(() => [...document.querySelectorAll('.detail-blocks:not([hidden]) [data-media]')].map((m) => m.dataset.state));
      let s1 = await state();
      check(s1[0] === 'failed', `a media error shows the message and retry (${s1.join(', ')}) (FR-51)`, `after an image error: ${s1.join(', ')}`);
      blockImg = false;
      await pg.click('.detail-blocks:not([hidden]) [data-state="failed"] .media-retry');
      await pg.waitForTimeout(1500);
      s1 = await state();
      check(s1[0] === 'loaded', 'retry starts a new load and the item shows (FR-51)', `after retry: ${s1.join(', ')}`);
      await pg.waitForTimeout(12000);   // the preview has been held for over 15 s now
      const s2 = await state();
      holdPreview = false;
      await pg.unroute(/\/previews\//);
      await pg.click('.detail-blocks:not([hidden]) [data-state="failed"] .media-retry').catch(() => {});
      await pg.waitForTimeout(1500);
      const s3 = await state();
      check(s2[2] === 'failed' && s3[2] === 'loaded', `a stalled item fails after 15 s and retries (${s2[2]} -> ${s3[2]}) (FR-51)`, `timeout path: ${JSON.stringify({ s2, s3 })}`);
      await pg.close();

      /* FT-52: reduced motion shows a static full mark */
      pg = await openPage(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
      await pg.route(/\/_astro\/.*\.webp|\/media\//, async (route) => { await new Promise((r) => setTimeout(r, 2500)); await route.continue(); });
      await pg.goto(SITE + 'works/project-1');
      await pg.waitForTimeout(2500);
      const rm = await pg.evaluate(() => { const f = document.querySelector('.detail-blocks:not([hidden]) .mfill'); const c = getComputedStyle(f); return { anim: c.animationName, clip: c.clipPath }; });
      check(rm.anim === 'none', `media loader is static under reduced motion (${rm.anim}) (FR-52)`, `media loader animates under reduced motion: ${JSON.stringify(rm)}`);
      await pg.close();

});

test('contact form against the endpoint contract (FT-32 to FT-36)', async ({ browser, browserName }) => {

      const pg = await openPage(browser, { viewport: { width: 1280, height: 800 } });
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

});

test('legal pages follow the language (FR-44, FR-45, ADR-0012)', async ({ browser, browserName }) => {

      const pg = await openPage(browser, { viewport: { width: 1280, height: 800 } });
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

});

test('settle pause holds at the first card (CR-26)', async ({ browser, browserName }) => {

      const pg = await openPage(browser, { viewport: { width: 1440, height: 900 } });
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

});

test('keyboard focus crosses the inert boundary; no scan under reduced motion (CR-15, CR-12)', async ({ browser, browserName }) => {

      const pg = await openPage(browser, { viewport: { width: 1280, height: 800 } });
      pg.on('pageerror', (e) => bad(`page error (focus): ${e.message}`));
      await pg.goto(SITE);
      await pg.waitForTimeout(3500);
      const focused = () => pg.evaluate(() => { const a = document.activeElement; return a === document.body ? 'body' : (a.id ? '#' + a.id : '.' + a.classList[0]); });
      await pg.focus('#enterWorks');
      await pg.keyboard.press('Enter');
      await pg.waitForTimeout(4000);
      const forward = await focused();
      check(forward === '.card', `keyboard focus moves to the current card on arrival (${forward}) (CR-15)`, `focus after the forward transition: ${forward}`);
      await pg.keyboard.press('ArrowUp');   // focus is on the first card: plays the reverse
      await pg.waitForTimeout(3000);
      const back = await focused();
      check(back === '#enterWorks', `keyboard focus returns to the enter arrow after the reverse (${back}) (CR-15)`, `focus after the reverse: ${back}`);
      await pg.close();

      const rm = await openPage(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
      await rm.goto(SITE);
      await rm.waitForTimeout(1500);
      const scan = await rm.evaluate(() => getComputedStyle(document.querySelector('.btn-contact'), '::before').animationName);
      check(scan === 'none', 'no scan animation under reduced motion (FR-52, CR-12)', `scan still animates under reduced motion (${scan})`);
      await rm.close();

});

test('a touch flick carries into the transition (CR-22, NFR-04)', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'needs the Chrome DevTools Protocol touch fling and isMobile (not in Firefox)');

      const pg = await openPage(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
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

});

test('one canvas draw per frame; scroll keys suppressed during the transition (NFR-04, CR-22)', async ({ browser, browserName }) => {

      const pg = await openPage(browser, { viewport: { width: 1440, height: 900 } });
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

});
