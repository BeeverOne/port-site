/* Playwright Test (ADR-0011, QS-05): the end-to-end suite in the three browser engines NFR-06 names.
   Chromium runs as the installed Google Chrome; WebKit (Safari's engine) and Firefox are Playwright's
   build (npx playwright install webkit); Firefox runs in CI only (see below). The suite tests the built output, served the way
   Vercel serves it, so build first: npm run build && npm run test:e2e.

   One worker: several flows measure animation timing (the 250 ms settle window, the 1.8 s transition
   clock), and parallel browsers starve each other's frames enough to make those checks flaky. */
import { defineConfig, devices } from '@playwright/test';

/* Firefox runs in CI only (.github/workflows/e2e.yml): on macOS 27 Firefox cannot be started from the
   command line at all ("Could not find profile folder", for any profile path and for both Playwright's
   build and the installed release), so locally the suite covers Chromium and WebKit.
   Set PW_FIREFOX=1 to try it on a machine where Firefox does start. */
const withFirefox = !!process.env.CI || process.env.PW_FIREFOX === '1';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  fullyParallel: false,
  // CI runners are slower and share CPU: one retry absorbs a timing-sensitive animation check that
  // misses its window; a real regression fails both attempts
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/serve-static.mjs 4322',
    url: 'http://localhost:4322/',
    // never reuse: a leftover server on 4322 would serve old code (it once hid a fix from WebKit)
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ...(withFirefox ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }] : []),
  ],
});
