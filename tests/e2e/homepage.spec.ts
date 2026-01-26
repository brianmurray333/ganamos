import { test, expect } from './fixtures'

test.describe('Homepage', () => {
  test('should load the homepage successfully', async ({ page }) => {
    await page.goto('/')
    
    // Check that the page loads without errors
    await expect(page).toHaveURL('http://localhost:3457/')
    
    // Verify the page has loaded by checking for common elements
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })
})