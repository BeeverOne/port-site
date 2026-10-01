/* Unit tests only (tests/*.test.js); tests/e2e belongs to Playwright Test (playwright.config.mjs). */
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/*.test.js'] } });
