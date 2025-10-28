import { test, expect } from '@playwright/test'

test.describe('Device Registration E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Navigate to login and authenticate
    // Note: This assumes you have a test user or mock authentication
    // Adjust based on your actual authentication flow
    await page.goto('/auth/login')
    
    // TODO: Add actual login flow here
    // For now, we'll skip to the connect-pet page
    // In a real scenario, you'd need to:
    // 1. Fill in login credentials
    // 2. Submit the form
    // 3. Wait for redirect to profile/dashboard
  })

  test('should display connect pet page with form elements', async ({ page }) => {
    // Navigate to connect pet page
    await page.goto('/connect-pet')

    // Assert: Page loads with expected elements
    await expect(page.locator('h1, h2').filter({ hasText: /connect|pet|device/i })).toBeVisible()
    await expect(page.locator('input[name="petName"], input[placeholder*="name" i]')).toBeVisible()
    await expect(page.locator('input[name="deviceCode"], input[placeholder*="code" i]')).toBeVisible()
    await expect(page.locator('button[type="submit"], button:has-text("Connect"), button:has-text("Pair")')).toBeVisible()
  })

  test('should show validation error for missing fields', async ({ page }) => {
    await page.goto('/connect-pet')

    // Try to submit without filling any fields
    await page.locator('button[type="submit"], button:has-text("Connect"), button:has-text("Pair")').first().click()

    // Assert: Validation errors appear
    await expect(page.locator('text=/required|enter|provide/i')).toBeVisible({ timeout: 3000 })
  })

  test('should allow user to select pet type', async ({ page }) => {
    await page.goto('/connect-pet')

    // Select a pet type (assuming radio buttons or dropdown)
    const petTypeSelectors = [
      'input[value="cat"]',
      'button:has-text("Cat")',
      'div:has-text("Cat")',
    ]

    for (const selector of petTypeSelectors) {
      const element = page.locator(selector).first()
      if (await element.count() > 0) {
        await element.click()
        break
      }
    }

    // Verify selection (implementation depends on UI)
    await expect(page.locator('[data-selected="true"], .selected, [aria-checked="true"]')).toBeVisible({ timeout: 2000 })
  })

  test('should successfully register a new device', async ({ page }) => {
    // Mock the API response for successful registration
    await page.route('**/api/device/register', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Fluffy has been connected successfully!',
          device: {
            id: 'test-device-id',
            user_id: 'test-user-id',
            pairing_code: 'TEST123',
            pet_name: 'Fluffy',
            pet_type: 'cat',
            status: 'paired',
            last_seen_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        }),
      })
    })

    await page.goto('/connect-pet')

    // Fill in the form
    await page.fill('input[name="petName"], input[placeholder*="name" i]', 'Fluffy')
    await page.fill('input[name="deviceCode"], input[placeholder*="code" i]', 'TEST123')

    // Select pet type (cat)
    const catSelectors = [
      'input[value="cat"]',
      'button:has-text("Cat")',
      'div[data-pet-type="cat"]',
    ]

    for (const selector of catSelectors) {
      const element = page.locator(selector).first()
      if (await element.count() > 0) {
        await element.click()
        break
      }
    }

    // Submit the form
    await page.locator('button[type="submit"], button:has-text("Connect"), button:has-text("Pair")').first().click()

    // Assert: Success message appears
    await expect(page.locator('text=/connected successfully|successfully connected/i')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=/fluffy/i')).toBeVisible()
  })

  test('should show error for duplicate device code', async ({ page }) => {
    // Mock the API response for duplicate device
    await page.route('**/api/device/register', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'This device (ExistingPet) is already connected to another user',
        }),
      })
    })

    await page.goto('/connect-pet')

    // Fill in the form with duplicate code
    await page.fill('input[name="petName"], input[placeholder*="name" i]', 'MyPet')
    await page.fill('input[name="deviceCode"], input[placeholder*="code" i]', 'DUPLICATE')

    // Submit the form
    await page.locator('button[type="submit"], button:has-text("Connect"), button:has-text("Pair")').first().click()

    // Assert: Error message appears
    await expect(page.locator('text=/already connected|another user|duplicate/i')).toBeVisible({ timeout: 5000 })
  })

  test('should show error for invalid pet type', async ({ page }) => {
    // Mock the API response for invalid pet type
    await page.route('**/api/device/register', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Invalid pet type',
        }),
      })
    })

    await page.goto('/connect-pet')

    // Fill in the form
    await page.fill('input[name="petName"], input[placeholder*="name" i]', 'MyPet')
    await page.fill('input[name="deviceCode"], input[placeholder*="code" i]', 'TEST123')

    // Submit without selecting a valid pet type
    await page.locator('button[type="submit"], button:has-text("Connect"), button:has-text("Pair")').first().click()

    // Assert: Error message appears
    await expect(page.locator('text=/invalid|pet type|required/i')).toBeVisible({ timeout: 5000 })
  })

  test('should convert device code to uppercase', async ({ page }) => {
    // Mock the API response
    await page.route('**/api/device/register', async (route) => {
      const request = route.request()
      const postData = request.postDataJSON()
      
      // Verify the device code was sent in uppercase
      expect(postData.deviceCode).toBe('ABC123')
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'TestPet has been connected successfully!',
          device: {
            id: 'test-device-id',
            pairing_code: 'ABC123',
            pet_name: 'TestPet',
            pet_type: 'cat',
            status: 'paired',
          },
        }),
      })
    })

    await page.goto('/connect-pet')

    // Fill in form with lowercase device code
    await page.fill('input[name="petName"], input[placeholder*="name" i]', 'TestPet')
    await page.fill('input[name="deviceCode"], input[placeholder*="code" i]', 'abc123')

    // Submit
    await page.locator('button[type="submit"], button:has-text("Connect"), button:has-text("Pair")').first().click()

    // Wait for success
    await expect(page.locator('text=/connected successfully/i')).toBeVisible({ timeout: 5000 })
  })

  test('should handle network errors gracefully', async ({ page }) => {
    // Mock network failure
    await page.route('**/api/device/register', async (route) => {
      await route.abort('failed')
    })

    await page.goto('/connect-pet')

    // Fill in the form
    await page.fill('input[name="petName"], input[placeholder*="name" i]', 'TestPet')
    await page.fill('input[name="deviceCode"], input[placeholder*="code" i]', 'TEST123')

    // Submit
    await page.locator('button[type="submit"], button:has-text("Connect"), button:has-text("Pair")').first().click()

    // Assert: Error message appears
    await expect(page.locator('text=/error|failed|try again/i')).toBeVisible({ timeout: 5000 })
  })

  test('should navigate to settings after successful registration', async ({ page }) => {
    // Mock successful registration
    await page.route('**/api/device/register', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Fluffy has been connected successfully!',
          device: {
            id: 'test-device-id',
            pairing_code: 'TEST123',
            pet_name: 'Fluffy',
            pet_type: 'cat',
            status: 'paired',
          },
        }),
      })
    })

    await page.goto('/connect-pet')

    // Fill and submit form
    await page.fill('input[name="petName"], input[placeholder*="name" i]', 'Fluffy')
    await page.fill('input[name="deviceCode"], input[placeholder*="code" i]', 'TEST123')
    await page.locator('button[type="submit"], button:has-text("Connect"), button:has-text("Pair")').first().click()

    // Wait for success message
    await expect(page.locator('text=/connected successfully/i')).toBeVisible({ timeout: 5000 })

    // May redirect to profile or pet settings
    // Adjust based on actual app behavior
    await page.waitForTimeout(1000)
    expect(page.url()).toMatch(/\/(profile|pet-settings|dashboard)/)
  })

  test('should allow re-pairing an existing device', async ({ page }) => {
    // Mock re-pairing response
    await page.route('**/api/device/register', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'UpdatedPet has been reconnected!',
          device: {
            id: 'existing-device-id',
            pairing_code: 'EXISTING',
            pet_name: 'UpdatedPet',
            pet_type: 'dog',
            status: 'paired',
          },
        }),
      })
    })

    await page.goto('/connect-pet')

    // Fill in form with existing device code but new pet info
    await page.fill('input[name="petName"], input[placeholder*="name" i]', 'UpdatedPet')
    await page.fill('input[name="deviceCode"], input[placeholder*="code" i]', 'EXISTING')

    // Submit
    await page.locator('button[type="submit"], button:has-text("Connect"), button:has-text("Pair")').first().click()

    // Assert: Reconnect message appears
    await expect(page.locator('text=/reconnected|re-paired|updated/i')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=/updatedpet/i')).toBeVisible()
  })
})