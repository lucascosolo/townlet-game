import { defineConfig } from '@playwright/test';

// End-to-end tests run the production build in headless Chromium. In this repo's cloud
// container Chromium is preinstalled at /opt/pw-browsers/chromium; elsewhere, set
// TOWNLET_CHROMIUM or run `npx playwright install chromium`.
const executablePath = process.env.TOWNLET_CHROMIUM ?? (process.env.PLAYWRIGHT_BROWSERS_PATH === '/opt/pw-browsers' ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 800 },
  },
  // Chromium runs everything; WebKit (Safari's engine) runs the device matrix, as emulation, not a
  // real iPhone (plan 2026-10-11).
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', launchOptions: { ...(executablePath ? { executablePath } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
    },
    { name: 'webkit', use: { browserName: 'webkit' }, testMatch: /devices\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
