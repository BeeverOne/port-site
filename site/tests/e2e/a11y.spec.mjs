/* Automated accessibility scan (NFT-08-1, QS-04): axe-core against WCAG 2.2 level A and AA on every page
   state, in light and dark mode, in English and German. Chromium only: axe's rules evaluate the DOM
   and computed styles the same way in every engine, so three engines would triple the time for the
   same findings. The keyboard and screen-reader passes (NFT-08-2, NFT-08-3) stay manual. */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SITE = 'http://localhost:4322/';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
test.describe.configure({ timeout: 120_000 });

const TURNSTILE_STUB = `window.turnstile = { render: () => 'w1', getResponse: () => '', reset: () => {} }; window.onTurnstileLoad && window.onTurnstileLoad();`;

/* Each state: how to reach it from a fresh page. The hidden half of the island is inert, which axe
   treats as not rendered, so each state is scanned as a visitor meets it. */
const STATES = [
  { name: 'intro', path: '' },
  { name: 'works', path: 'works' },
  { name: 'project detail', path: 'works/project-1', prep: async (p) => { await p.evaluate(() => { document.querySelector('#detail').scrollTop = 99999; }); await p.waitForTimeout(1500); } },
  { name: 'contact overlay', path: '', prep: async (p) => { await p.locator('[data-open-contact]:visible').first().click(); await p.waitForTimeout(500); } },
  { name: 'contact errors', path: '', prep: async (p) => { await p.locator('[data-open-contact]:visible').first().click(); await p.waitForTimeout(400); await p.click('#sendBtn'); await p.waitForTimeout(300); } },
  { name: 'impressum', path: 'impressum', legal: true },
  { name: 'privacy', path: 'privacy', legal: true },
];

/* WCAG 1.4.3 for the small grey text (--sub on --bg), measured from computed colours: each visible
   .label and .legal-sub against the background of the surface it sits on. */
async function checkLabels(page) {
  return page.evaluate(() => {
    const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && !/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent') return c;
      }
      return getComputedStyle(document.documentElement).getPropertyValue('--bg') ? null : 'rgb(255,255,255)';
    };
    const out = [];
    for (const el of document.querySelectorAll('.label, .legal-sub')) {
      if (!el.offsetParent || el.closest('[inert]')) continue;
      let bg = bgOf(el);
      if (!bg) continue;
      const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(rgb(bg))].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      if (ratio < 4.5) out.push(`${el.className || el.tagName}: ${ratio.toFixed(2)} (${getComputedStyle(el).color} on ${bg})`);
    }
    return out;
  });
}

for (const lang of ['en', 'de']) {
  for (const scheme of ['light', 'dark']) {
    for (const state of STATES) {
      test(`axe: ${state.name}, ${lang}, ${scheme}`, async ({ browser, browserName }) => {
        test.skip(browserName !== 'chromium', 'axe findings do not depend on the engine');
        // axe needs a page from an explicit context (it scans frames through it)
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme, locale: lang === 'de' ? 'de-DE' : 'en-US' });
        const page = await context.newPage();
        await page.route('https://challenges.cloudflare.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB }));
        let path = state.path;
        if (lang === 'de') path = state.path === 'privacy' ? 'de/datenschutz' : state.path === '' ? 'de/' : `de/${state.path}`;
        await page.goto(SITE + path);
        await page.waitForTimeout(state.legal ? 600 : 4500);   // loader, flow-in and media loaders settle
        if (state.prep) await state.prep(page);
        /* The plus-mark field is a solid layer in the 28 %-ink colour cut into crosses by a CSS mask. axe
           ignores masks, so it reads the whole island as tinted and flags the small grey [ about ] label
           (3.49:1 against the tint) although the rendered label sits on the plain island colour (6.2:1
           light, 7.6:1 dark). Verified 2026-10-02: with the field hidden the violation disappears and
           nothing else changes. The decorative field is hidden for the scan, and checkLabels() below
           measures the real contrast of the grey text instead, so a too-light label still fails. */
        await page.addStyleTag({ content: '.plus-field { display: none !important; }' });
        const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const low = await checkLabels(page);
        expect.soft(low, `grey label text below 4.5:1 on ${state.name} (${lang}, ${scheme})`).toEqual([]);
        const report = result.violations.map((v) => `${v.id} [${v.impact}] ${v.help} — ${v.nodes.length} node(s): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}${v.nodes[0]?.failureSummary ? ' :: ' + v.nodes[0].failureSummary.replace(/\s+/g, ' ').slice(0, 220) : ''}`);
        expect.soft(report, `WCAG 2.2 A/AA violations on ${state.name} (${lang}, ${scheme})`).toEqual([]);
        await context.close();
      });
    }
  }
}
