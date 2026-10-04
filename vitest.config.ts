import { defineConfig } from 'vitest/config';

// Unit and simulation tests only; browser tests live in e2e/ and run under Playwright.
// Year-long checks (*.slow.test.ts) run in the nightly slow-checks workflow: npm run test:slow.
export default defineConfig({
  root: '.',
  test: { include: ['test/**/*.test.ts'], exclude: ['test/**/*.slow.test.ts'] },
});
