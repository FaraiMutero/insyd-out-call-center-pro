import { defineConfig, devices } from '@playwright/test';

/**
 * Drop this kit into any client app repo. Point BASE_URL at the app under test.
 * Per-app config lives in qa.config.json — this file stays identical across apps.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'qa-report/results.json' }],
    ['html', { outputFolder: 'qa-report/html', open: 'never' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Auto-start the app if not already running
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
