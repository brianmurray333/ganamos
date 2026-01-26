import { test as base } from '@playwright/test'

/**
 * E2E Test Fixtures with proper test isolation
 *
 * This extends the base Playwright test to ensure each test starts fresh:
 * - Clears browser storage (localStorage, sessionStorage)
 * - Clears cookies
 * - Clears IndexedDB
 */

export const test = base.extend({
  page: async ({ page, context }, use) => {
    // Capture browser console logs for debugging
    page.on('console', (msg) => {
      // Log all browser console messages to test output
      // This helps debug auth and navigation issues
      const type = msg.type()
      const text = msg.text()
      console.log(`[BROWSER ${type.toUpperCase()}] ${text}`)
      
      // Also log location if available
      if (msg.location()) {
        const loc = msg.location()
        console.log(`  └─ ${loc.url}:${loc.lineNumber}:${loc.columnNumber}`)
      }
    })
    
    // Before each test: Clear all browser state for test isolation
    // This ensures each test starts with a clean slate

    // Clear cookies
    await context.clearCookies()

    // Clear permissions
    await context.clearPermissions()

    // Use the page in the test
    await use(page)

    // After each test: Clean up
    await context.clearCookies()

    // Clear storage after test by navigating to the app and clearing
    // We do this after the test because before the test, there's no page loaded yet
    try {
      await page.goto('/')
      await page.evaluate(() => {
        localStorage.clear()
        sessionStorage.clear()
        // Clear IndexedDB
        if (window.indexedDB && window.indexedDB.databases) {
          window.indexedDB.databases().then((databases) => {
            databases.forEach((db) => {
              if (db.name) {
                window.indexedDB.deleteDatabase(db.name)
              }
            })
          })
        }
      })
    } catch (e) {
      // Ignore errors if page is closed or navigation fails
    }
  },
})

export { expect } from '@playwright/test'
