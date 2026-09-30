/* Interaction smoke test of the built site: the flows the port touched.
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

await page.goto(SITE);
await page.waitForTimeout(3500); // loader (1200ms) + fonts

/* FR-47: loader ends and the intro is ready */
check(await page.evaluate(() => document.body.classList.contains('ready')), 'page loader ended, intro ready (FR-47)', 'loader never ended');
check(await page.evaluate(() => !document.body.classList.contains('lock')), 'body unlocked after loader', 'body still locked');

/* FR-10/FR-22: cards localized from the island */
const cardText = await page.evaluate(() => {
  const c = document.querySelector('.card[data-id="project-2"]');
  return { h3: c.querySelector('h3').textContent, t: c.querySelector('.t').textContent, tags: c.querySelectorAll('.tags span').length };
});
check(cardText.h3 === 'Short project headline' && cardText.t === 'Project 2 title' && cardText.tags === 2, 'cards localized from content collection (FR-10)', `unexpected card text: ${JSON.stringify(cardText)}`);

/* FR-02: enter works plays the grain transition */
await page.click('#enterWorks');
await page.waitForTimeout(2400);
check(await page.evaluate(() => document.body.classList.contains('mode-works')), 'grain transition reached works mode (FR-02)', 'mode-works never set');
check(await page.evaluate(() => document.querySelector('#works').classList.contains('show')), 'works section shown', 'works not shown');
check(await page.evaluate(() => document.querySelector('#works').inert === false), 'works focusable after transition', 'works still inert');
const trackScrollable = await page.evaluate(() => { const t = document.querySelector('#track'); return t.scrollWidth > t.clientWidth; });
check(trackScrollable, 'works track overflows horizontally (FR-04/FR-06)', 'track not scrollable');

/* FR-06: vertical wheel moves the track sideways */
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

/* FR-03: backward input at the first card returns to the intro */
await page.mouse.wheel(0, -400);
await page.waitForTimeout(400);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(2400);
check(await page.evaluate(() => !document.body.classList.contains('mode-works')), 'reverse grain transition returned to intro (FR-03)', 'still in works mode');

/* FR-21: language toggle */
await page.click('[data-lang="de"]');
await page.waitForTimeout(300);
const de = await page.evaluate(() => ({ lang: document.documentElement.lang, about: document.querySelector('[data-i18n="about"]').textContent, h3: document.querySelector('.card h3').textContent }));
check(de.lang === 'de' && de.about === '[ über mich ]', `language toggle switched interface copy (${de.about}) (FR-21)`, `de toggle wrong: ${JSON.stringify(de)}`);
await page.click('[data-lang="en"]');

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
