import { test, expect } from '@playwright/test'

test.describe('Homepage', () => {
  // TODO: Fix e2e test - page renders blank (no content visible)
  // Issue: The application requires proper environment setup (auth/env vars) for e2e tests
  // The page loads but shows completely blank/white screen
  // Need to configure proper test environment before re-enabling
  // See: test-results screenshots showing blank page
  test.skip('should load the homepage successfully', async ({ page }) => {
    await page.goto('/')
    
    // Check that the page loads without errors
    await expect(page).toHaveURL('http://localhost:3457/')
    
    // Verify the page has loaded by checking for the main content area
    const main = page.locator('main')
    await expect(main).toBeVisible()
  })
})