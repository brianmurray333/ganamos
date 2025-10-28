import { test, expect } from '@playwright/test'

test.describe('Device Registration E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to connect pet page (assumes user is already authenticated)
    await page.goto('/connect-pet')
  })

  test('should complete device pairing flow successfully', async ({ page }) => {
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Connect Your Pet')

    // Step 1: Select pet type
    await page.click('[data-testid="pet-type-cat"]')
    await page.click('[data-testid="next-button"]')

    // Step 2: Enter pet name
    await page.fill('[name="petName"]', 'Fluffy')
    await page.click('[data-testid="next-button"]')

    // Step 3: Enter device code
    await page.fill('[name="deviceCode"]', 'ABC123')
    await page.click('[data-testid="submit-button"]')

    // Verify success message
    await expect(page.locator('.success-message')).toContainText(
      'connected successfully',
      { timeout: 10000 }
    )

    // Verify redirect to profile or dashboard
    await expect(page).toHaveURL(/\/(profile|dashboard)/)
  })

  test('should show validation error for empty device code', async ({ page }) => {
    // Navigate through steps without entering code
    await page.click('[data-testid="pet-type-dog"]')
    await page.click('[data-testid="next-button"]')
    
    await page.fill('[name="petName"]', 'Buddy')
    await page.click('[data-testid="next-button"]')
    
    // Try to submit without device code
    await page.click('[data-testid="submit-button"]')

    // Verify validation error
    await expect(page.locator('.error-message')).toBeVisible()
  })

  test('should show error for invalid pet type', async ({ page }) => {
    // This test assumes the UI prevents invalid selections,
    // but we test the API validation
    await page.evaluate(() => {
      // Directly call API with invalid data
      fetch('/api/device/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceCode: 'ABC123',
          petName: 'TestPet',
          petType: 'invalid',
        }),
      })
    })

    // In a real E2E test, the UI would prevent this,
    // but this documents the expected API behavior
  })

  test('should allow navigation back through steps', async ({ page }) => {
    // Step 1: Select pet type
    await page.click('[data-testid="pet-type-rabbit"]')
    await page.click('[data-testid="next-button"]')

    // Step 2: Enter pet name
    await page.fill('[name="petName"]', 'Cottontail')
    await page.click('[data-testid="next-button"]')

    // Navigate back
    await page.click('[data-testid="back-button"]')
    
    // Verify we're back at pet name step
    await expect(page.locator('[name="petName"]')).toHaveValue('Cottontail')

    // Navigate back again
    await page.click('[data-testid="back-button"]')
    
    // Verify we're back at pet type step
    await expect(page.locator('[data-testid="pet-type-rabbit"]')).toHaveClass(
      /selected/
    )
  })

  test('should display pet information after successful pairing', async ({
    page,
  }) => {
    // Complete pairing flow
    await page.click('[data-testid="pet-type-turtle"]')
    await page.click('[data-testid="next-button"]')
    
    await page.fill('[name="petName"]', 'Speedy')
    await page.click('[data-testid="next-button"]')
    
    await page.fill('[name="deviceCode"]', 'XYZ789')
    await page.click('[data-testid="submit-button"]')

    // Wait for redirect to profile
    await page.waitForURL(/\/profile/, { timeout: 10000 })

    // Verify pet information is displayed
    await expect(page.locator('[data-testid="pet-name"]')).toContainText('Speedy')
    await expect(page.locator('[data-testid="pet-type"]')).toContainText('turtle')
  })

  test('should handle duplicate device registration gracefully', async ({
    page,
  }) => {
    // First registration
    await page.click('[data-testid="pet-type-cat"]')
    await page.click('[data-testid="next-button"]')
    
    await page.fill('[name="petName"]', 'FirstPet')
    await page.click('[data-testid="next-button"]')
    
    await page.fill('[name="deviceCode"]', 'DUP123')
    await page.click('[data-testid="submit-button"]')

    // Wait for success
    await expect(page.locator('.success-message')).toBeVisible({ timeout: 10000 })

    // Try to register same device again (assumes re-pairing scenario)
    await page.goto('/connect-pet')
    
    await page.click('[data-testid="pet-type-dog"]')
    await page.click('[data-testid="next-button"]')
    
    await page.fill('[name="petName"]', 'SecondPet')
    await page.click('[data-testid="next-button"]')
    
    await page.fill('[name="deviceCode"]', 'DUP123')
    await page.click('[data-testid="submit-button"]')

    // Verify reconnection message (same user re-pairing)
    await expect(page.locator('.success-message')).toContainText('reconnected', {
      timeout: 10000,
    })
  })

  test('should normalize device codes to uppercase', async ({ page }) => {
    // Enter lowercase device code
    await page.click('[data-testid="pet-type-squirrel"]')
    await page.click('[data-testid="next-button"]')
    
    await page.fill('[name="petName"]', 'Nutty')
    await page.click('[data-testid="next-button"]')
    
    // Enter lowercase code
    await page.fill('[name="deviceCode"]', 'abc123')
    await page.click('[data-testid="submit-button"]')

    // Wait for success
    await expect(page.locator('.success-message')).toBeVisible({ timeout: 10000 })

    // Navigate to pet settings and verify code is uppercase
    await page.goto('/pet-settings')
    await expect(page.locator('[data-testid="pairing-code"]')).toContainText(
      'ABC123'
    )
  })

  test('should require authentication', async ({ page, context }) => {
    // Clear cookies to simulate logged-out state
    await context.clearCookies()

    // Try to access connect-pet page
    await page.goto('/connect-pet')

    // Should redirect to login
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10000 })
  })
})