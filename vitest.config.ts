import { defineConfig } from 'vitest/config';

// Unit and simulation tests only; browser tests live in e2e/ and run under Playwright.
export default defineConfig({
  root: '.',
  test: { include: ['test/**/*.test.ts'] },
});
