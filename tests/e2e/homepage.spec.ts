import { test, expect } from '@playwright/test'

test.describe('Homepage', () => {
  test('should load the homepage successfully', async ({ page }) => {
    await page.goto('/')
    
    // Check that the page loads without errors
    await expect(page).toHaveURL('http://localhost:3457/')
    
    // Verify the page has loaded by checking for the main content area
    const main = page.locator('main')
    await expect(main).toBeVisible()
  })
})