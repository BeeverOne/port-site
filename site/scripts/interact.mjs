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
check(await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden'), 'page scroll is owned by the island scroller', 'body still scrolls');

/* FR-10/FR-22: cards localized from the island, with the stagger class */
const card = await page.evaluate(() => {
  const c = document.querySelector('.card[data-id="project-2"]');
  return { h3: c.querySelector('h3').textContent, t: c.querySelector('.t').textContent, tags: c.querySelectorAll('.tags span').length, stagger: c.classList.contains('stagger') };
});
check(card.h3 === 'Short project headline' && card.t === 'Project 2 title' && card.tags === 2 && card.stagger, 'cards localized and carry .stagger (FR-10, CR-17)', `unexpected card: ${JSON.stringify(card)}`);

/* FR-02: enter works scrolls the island to the works section and the transition follows */
await page.click('#enterWorks');
await page.waitForTimeout(1800);
check(await atBottom(), 'enter works scrolled the island to the bottom', 'scroller not at bottom');
check(await page.evaluate(() => document.body.classList.contains('mode-works')), 'scroll-driven transition reached works mode (FR-02)', 'mode-works never set');
check(await page.evaluate(() => document.querySelector('#runway').offsetHeight > 0), 'runway spacer sized by layout()', 'runway has no height');
const trackScrollable = await page.evaluate(() => { const t = document.querySelector('#track'); return t.scrollWidth > t.clientWidth; });
check(trackScrollable, 'works track overflows horizontally (FR-04/FR-06)', 'track not scrollable');
check(await page.evaluate(() => location.hash === '#/works'), 'works overview URL derived from scroll position (FR-16, CR-06)', `hash is ${await page.evaluate(() => location.hash)}`);

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
await page.click('.btn-contact');
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

await browser.close();
if (server) {
  try { process.kill(-server.pid); } catch { /* already gone */ }
}
console.log(fail === 0 ? '\nPASS — interaction flows work in the built site' : `\nFAIL — ${fail} problem(s)`);
process.exit(fail === 0 ? 0 : 1);
