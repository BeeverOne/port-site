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
  const child = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { stdio: 'ignore', detached: true });
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
check(await page.evaluate(() => location.hash === '#/works'), 'works overview URL derived from scroll position (FR-16, CR-06)', `hash is ${await page.evaluate(() => location.hash)}`);

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
check(await page.evaluate(() => location.hash) === '#/works/project-1', 'URL changed to the project URL (FR-14)', `hash is ${await page.evaluate(() => location.hash)}`);
const detailTitle = await page.evaluate(() => document.querySelector('#detailTitle').textContent);
check(detailTitle === 'Short project headline', `detail filled from project data ("${detailTitle}")`, `detail title wrong: "${detailTitle}"`);

/* FR-16: Escape closes and returns to the works overview URL */
await page.keyboard.press('Escape');
await page.waitForTimeout(900);
check(await page.evaluate(() => !document.querySelector('#detail').classList.contains('open')), 'Escape closed the detail view (FR-16)', 'detail still open');
check(await page.evaluate(() => location.hash) === '#/works', 'URL returned to the works overview (FR-16)', `hash is ${await page.evaluate(() => location.hash)}`);

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

await browser.close();
if (server) {
  try { process.kill(-server.pid); } catch { /* already gone */ }
}
console.log(fail === 0 ? '\nPASS — interaction flows work in the built site' : `\nFAIL — ${fail} problem(s)`);
process.exit(fail === 0 ? 0 : 1);
