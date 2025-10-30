import { test, expect } from '@playwright/test'

/**
 * End-to-End Tests for Device Registration
 * Tests the complete user flow from the connect-pet wizard through API to success
 */

test.describe('Device Registration E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication - in real E2E you'd do actual login
    await page.addInitScript(() => {
      window.localStorage.setItem('auth-mock', 'authenticated')
    })
  })

  test('should complete full device registration flow with valid data', async ({ page }) => {
    await page.goto('/connect-pet')

    // Step 1: Get Started screen
    await expect(page.locator('h1')).toContainText('Satoshi Pet')
    await page.click('button:has-text("Get Started")')

    // Step 2: Choose Pet screen
    await expect(page.locator('h1')).toContainText('Choose Your Pet')
    
    // Select dog (second pet option)
    const petButtons = page.locator('button').filter({ has: page.locator('svg') })
    await petButtons.nth(1).click() // Dog is second in array
    
    await page.click('button:has-text("Continue")')

    // Step 3: Name Pet screen
    await expect(page.locator('h1')).toContainText('Name Your Pet')
    
    const petNameInput = page.locator('input[id="petName"]')
    await petNameInput.fill('Buddy')
    
    await page.click('button:has-text("Continue")')

    // Step 4: Connect Device screen
    await expect(page.locator('h1')).toContainText('Connect Device')
    await expect(page.locator('text=Buddy')).toBeVisible()
    await expect(page.locator('text=Ready to connect')).toBeVisible()

    // Click "Pair My Pet" button
    await page.click('button:has-text("Pair My Pet")')

    // Enter pairing code
    const deviceCodeInput = page.locator('input[id="deviceCode"]')
    await deviceCodeInput.fill('ABC123')

    // Mock successful API response
    await page.route('**/api/device/register', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Buddy has been connected successfully!',
          deviceId: 'test-device-id',
        }),
      })
    })

    // Click Connect button
    await page.click('button:has-text("Connect Buddy")')

    // Wait for success toast (using toast notification)
    await expect(page.locator('text=Pet Connected!')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Buddy has been connected successfully!')).toBeVisible()

    // Should redirect to profile page
    await expect(page).toHaveURL('/profile', { timeout: 5000 })
  })

  test('should show error when device code is already registered to another user', async ({ page }) => {
    await page.goto('/connect-pet')

    // Navigate to device connection step
    await page.click('button:has-text("Get Started")')
    await page.click('button:has-text("Continue")')
    
    await page.locator('input[id="petName"]').fill('Fluffy')
    await page.click('button:has-text("Continue")')
    
    await page.click('button:has-text("Pair My Pet")')

    // Mock 409 conflict response
    await page.route('**/api/device/register', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'This device (Mittens) is already connected to another user. Each pet can only be connected to one account.',
        }),
      })
    })

    await page.locator('input[id="deviceCode"]').fill('XYZ789')
    await page.click('button:has-text("Connect Fluffy")')

    // Wait for error toast
    await expect(page.locator('text=Connection Failed')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=already connected to another user')).toBeVisible()
  })

  test('should show error when authentication fails', async ({ page }) => {
    await page.goto('/connect-pet')

    // Navigate to device connection step
    await page.click('button:has-text("Get Started")')
    await page.click('button:has-text("Continue")')
    
    await page.locator('input[id="petName"]').fill('Shadow')
    await page.click('button:has-text("Continue")')
    
    await page.click('button:has-text("Pair My Pet")')

    // Mock 401 unauthorized response
    await page.route('**/api/device/register', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Unauthorized',
        }),
      })
    })

    await page.locator('input[id="deviceCode"]').fill('DEF456')
    await page.click('button:has-text("Connect Shadow")')

    // Wait for error toast
    await expect(page.locator('text=Connection Failed')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Unauthorized')).toBeVisible()
  })

  test('should disable connect button when code is incomplete', async ({ page }) => {
    await page.goto('/connect-pet')

    // Navigate to device connection step
    await page.click('button:has-text("Get Started")')
    await page.click('button:has-text("Continue")')
    
    await page.locator('input[id="petName"]').fill('Rex')
    await page.click('button:has-text("Continue")')
    
    await page.click('button:has-text("Pair My Pet")')

    // Enter incomplete code (less than 6 characters)
    await page.locator('input[id="deviceCode"]').fill('AB12')

    // Connect button should be disabled
    const connectButton = page.locator('button:has-text("Connect Rex")')
    await expect(connectButton).toBeDisabled()

    // Complete the code
    await page.locator('input[id="deviceCode"]').fill('AB1234')

    // Button should now be enabled
    await expect(connectButton).toBeEnabled()
  })

  test('should convert device code to uppercase automatically', async ({ page }) => {
    await page.goto('/connect-pet')

    // Navigate to device connection step
    await page.click('button:has-text("Get Started")')
    await page.click('button:has-text("Continue")')
    
    await page.locator('input[id="petName"]').fill('Max')
    await page.click('button:has-text("Continue")')
    
    await page.click('button:has-text("Pair My Pet")')

    const deviceCodeInput = page.locator('input[id="deviceCode"]')
    
    // Type lowercase
    await deviceCodeInput.fill('abc123')

    // Input should show uppercase
    await expect(deviceCodeInput).toHaveValue('ABC123')
  })

  test('should allow back navigation through wizard steps', async ({ page }) => {
    await page.goto('/connect-pet')

    // Step 1: Get Started
    await expect(page.locator('h1')).toContainText('Satoshi Pet')
    await page.click('button:has-text("Get Started")')

    // Step 2: Choose Pet
    await expect(page.locator('h1')).toContainText('Choose Your Pet')
    
    // Click back button
    const backButton = page.locator('button[aria-label]').first()
    await backButton.click()

    // Should return to get started
    await expect(page.locator('h1')).toContainText('Satoshi Pet')
    await expect(page.locator('button:has-text("Get Started")')).toBeVisible()
  })

  test('should show loading state during device registration', async ({ page }) => {
    await page.goto('/connect-pet')

    // Navigate to device connection step
    await page.click('button:has-text("Get Started")')
    await page.click('button:has-text("Continue")')
    
    await page.locator('input[id="petName"]').fill('Luna')
    await page.click('button:has-text("Continue")')
    
    await page.click('button:has-text("Pair My Pet")')

    // Mock slow API response
    await page.route('**/api/device/register', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Luna has been connected successfully!',
          deviceId: 'test-device-id',
        }),
      })
    })

    await page.locator('input[id="deviceCode"]').fill('GHI789')
    await page.click('button:has-text("Connect Luna")')

    // Should show connecting state
    await expect(page.locator('text=Connecting Luna...')).toBeVisible()
    
    // Button should be disabled during loading
    const connectButton = page.locator('button:has-text("Connecting Luna")')
    await expect(connectButton).toBeDisabled()
  })

  test('should allow navigation to pet store from connect device screen', async ({ page }) => {
    await page.goto('/connect-pet')

    // Navigate to device connection step
    await page.click('button:has-text("Get Started")')
    await page.click('button:has-text("Continue")')
    
    await page.locator('input[id="petName"]').fill('Charlie')
    await page.click('button:has-text("Continue")')

    // Click "Order Pet" button
    await page.click('button:has-text("Order Pet - $49")')

    // Should navigate to pet store
    await expect(page).toHaveURL('/pet-store', { timeout: 3000 })
  })

  test('should toggle between pairing options and code entry', async ({ page }) => {
    await page.goto('/connect-pet')

    // Navigate to device connection step
    await page.click('button:has-text("Get Started")')
    await page.click('button:has-text("Continue")')
    
    await page.locator('input[id="petName"]').fill('Bella')
    await page.click('button:has-text("Continue")')

    // Initially should show two buttons
    await expect(page.locator('button:has-text("Pair My Pet")')).toBeVisible()
    await expect(page.locator('button:has-text("Order Pet - $49")')).toBeVisible()

    // Click "Pair My Pet"
    await page.click('button:has-text("Pair My Pet")')

    // Should show code entry input
    await expect(page.locator('input[id="deviceCode"]')).toBeVisible()
    await expect(page.locator('text=Back to Options')).toBeVisible()

    // Click "Back to Options"
    await page.click('text=Back to Options')

    // Should show buttons again
    await expect(page.locator('button:has-text("Pair My Pet")')).toBeVisible()
    await expect(page.locator('button:has-text("Order Pet - $49")')).toBeVisible()
    await expect(page.locator('input[id="deviceCode"]')).not.toBeVisible()
  })
})

test.describe('Device Registration - Pet Selection', () => {
  test('should allow selection of each pet type', async ({ page }) => {
    await page.goto('/connect-pet')

    await page.click('button:has-text("Get Started")')
    
    const petTypes = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle']
    
    for (const petType of petTypes) {
      // Get all pet selection buttons
      const petButtons = page.locator('button').filter({ has: page.locator('svg') })
      
      // Click based on index
      const index = petTypes.indexOf(petType)
      await petButtons.nth(index).click()
      
      // Visual confirmation - selected pet should have purple border
      const selectedButton = petButtons.nth(index)
      await expect(selectedButton).toHaveClass(/border-purple-500/)
    }
  })

  test('should display selected pet icon in visual preview', async ({ page }) => {
    await page.goto('/connect-pet')

    await page.click('button:has-text("Get Started")')
    
    // Select dog
    const petButtons = page.locator('button').filter({ has: page.locator('svg') })
    await petButtons.nth(1).click()
    
    // Large preview circle should be visible
    const previewCircle = page.locator('.bg-gradient-to-br.from-purple-400.to-blue-500')
    await expect(previewCircle).toBeVisible()
  })
})

test.describe('Device Registration - Validation Messages', () => {
  test('should prevent navigation when pet name is empty', async ({ page }) => {
    await page.goto('/connect-pet')

    await page.click('button:has-text("Get Started")')
    await page.click('button:has-text("Continue")')
    
    // Leave pet name empty
    const continueButton = page.locator('button:has-text("Continue")')
    
    // Button should be disabled
    await expect(continueButton).toBeDisabled()
    
    // Enter name
    await page.locator('input[id="petName"]').fill('Rocky')
    
    // Button should be enabled
    await expect(continueButton).toBeEnabled()
  })

  test('should limit device code input to 6 characters', async ({ page }) => {
    await page.goto('/connect-pet')

    // Navigate to device connection step
    await page.click('button:has-text("Get Started")')
    await page.click('button:has-text("Continue")')
    
    await page.locator('input[id="petName"]').fill('Oscar')
    await page.click('button:has-text("Continue")')
    
    await page.click('button:has-text("Pair My Pet")')

    const deviceCodeInput = page.locator('input[id="deviceCode"]')
    
    // Try to enter more than 6 characters
    await deviceCodeInput.fill('ABCDEFGHIJ')
    
    // Should only accept first 6
    await expect(deviceCodeInput).toHaveValue('ABCDEF')
  })
})