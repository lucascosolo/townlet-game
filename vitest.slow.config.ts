import { defineConfig } from 'vitest/config';

// The slow checks: year-long criteria runs. Nightly and on demand (.github/workflows/slow.yml).
export default defineConfig({
  root: '.',
  test: { include: ['test/**/*.slow.test.ts'] },
});
