/* M-03, NFT-02: Interaction to Next Paint, measured with Google's web-vitals in Chrome with a 4x CPU
   slowdown, over a visitor path that covers the site's interactions: enter the works, step a card, open
   a project, use the contents rail, close, switch language and theme, open Contact, type, close.
   Each run is a fresh browser context; the result is the INP web-vitals reports for that run (with
   under 50 interactions, the slowest one) and the interaction it came from. The output is rows for
   measurements.md M-03 and the summary against the threshold: 75th percentile 200 ms or less.

   Usage: node scripts/inp.mjs [url] [runs]
     url   default https://reverb-one.space/ (the formal run measures production)
     runs  default 10 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const URL_ = process.argv[2] || 'https://reverb-one.space/';
const RUNS = Number(process.argv[3]) || 10;
const THRESHOLD = 200;
// the package's exports map hides dist/, so the browser build is read by path
const WEB_VITALS = readFileSync(new URL('../node_modules/web-vitals/dist/web-vitals.attribution.iife.js', import.meta.url), 'utf8');
const PROBE = `${WEB_VITALS}
webVitals.onINP((m) => { window.__inp = { value: Math.round(m.value), target: m.attribution.interactionTarget, type: m.attribution.interactionType }; }, { reportAllChanges: true });`;

const pause = (page, ms) => page.waitForTimeout(ms);

async function visit(page) {
  await page.goto(URL_);
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 20000 });
  await pause(page, 800);
  await page.click('#enterWorks');
  await page.waitForFunction(() => document.body.classList.contains('mode-works'), null, { timeout: 15000 });
  await pause(page, 2500);                                       // transition and flow-in settle
  await page.keyboard.press('ArrowRight');
  await pause(page, 900);
  await page.keyboard.press('ArrowLeft');
  await pause(page, 900);
  await page.click('.card >> nth=0');
  await page.waitForFunction(() => document.querySelector('#detail').classList.contains('open'));
  await pause(page, 1200);
  const rail = page.locator('#detailToc a').nth(1);
  if (await rail.isVisible()) { await rail.click(); await pause(page, 1200); }
  await page.click('#detailClose');
  await pause(page, 1200);
  await page.click('.lang button:not([aria-pressed="true"])');
  await pause(page, 900);
  await page.click('#themeBtn');
  await pause(page, 900);
  await page.click('.works-footer [data-open-contact]');
  await page.waitForSelector('#contact[open]');
  await pause(page, 900);
  await page.type('#name', 'INP run', { delay: 60 });
  await pause(page, 600);
  await page.keyboard.press('Escape');
  await pause(page, 900);
  return page.evaluate(() => window.__inp ?? null);
}

const browser = await chromium.launch({ channel: 'chrome' });
const rows = [];
for (let run = 1; run <= RUNS; run++) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(PROBE);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  try {
    const inp = await visit(page);
    rows.push(inp ? { run, ...inp } : { run, value: NaN, target: '(no interaction reported)', type: '' });
  } catch (err) {
    rows.push({ run, value: NaN, target: `(run failed: ${err.message.split('\n')[0]})`, type: '' });
  }
  console.error(`run ${run}/${RUNS}: ${rows.at(-1).value} ms`);
  await context.close();
}
await browser.close();

const ok = rows.map((r) => r.value).filter(Number.isFinite).sort((a, b) => a - b);
const p75 = ok.length ? ok[Math.ceil(ok.length * 0.75) - 1] : NaN;
const avg = ok.length ? Math.round(ok.reduce((s, v) => s + v, 0) / ok.length) : NaN;
console.log(`M-03 INP, ${URL_}, ${new Date().toISOString().slice(0, 10)}, Chrome with 4x CPU slowdown, ${RUNS} runs\n`);
console.log('| Run | Interaction with the highest INP | INP (ms) |');
console.log('| --- | --- | --- |');
for (const r of rows) console.log(`| ${r.run} | ${r.type ? `${r.type} on ${r.target}` : r.target} | ${Number.isFinite(r.value) ? r.value : '—'} |`);
console.log(`| **min / max / avg / p75** | | ${ok[0]} / ${ok.at(-1)} / ${avg} / ${p75} |`);
console.log(`\n${ok.length === RUNS && p75 <= THRESHOLD ? 'PASS' : 'FAIL'}: p75 ${p75} ms against ${THRESHOLD} ms (${ok.length} of ${RUNS} runs measured)`);
process.exit(ok.length === RUNS && p75 <= THRESHOLD ? 0 : 1);
