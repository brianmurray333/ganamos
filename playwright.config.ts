import { defineConfig, devices } from '@playwright/test'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Disable parallel execution for better test isolation
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Run tests serially to avoid auth state conflicts
  use: {
    baseURL: 'http://localhost:3457',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // In CI, only run chromium to avoid parallel execution issues
  // Use mobile viewport to match original test expectations (bottom nav visible)
  // Locally, run all browsers including mobile
  projects: process.env.CI
    ? [
        {
          name: 'chromium',
          use: { ...devices['iPhone 12'] },
        },
      ]
    : [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
        {
          name: 'firefox',
          use: { ...devices['Desktop Firefox'] },
        },
        {
          name: 'webkit',
          use: { ...devices['Desktop Safari'] },
        },
        {
          name: 'Mobile Chrome',
          use: { ...devices['Pixel 5'] },
        },
        {
          name: 'Mobile Safari',
          use: { ...devices['iPhone 12'] },
        },
      ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3457',
        reuseExistingServer: true,
        timeout: 120 * 1000,
      },
})
