import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Device Registration User Flow
 * 
 * Tests the complete user journey through the device pairing wizard:
 * - Multi-step form navigation (get-started → choose-pet → name-pet → connect-device)
 * - Form validation at each step
 * - Successful device registration with API integration
 * - Error handling and user feedback
 * - Authentication requirements
 */

// Test configuration
const BASE_URL = 'http://localhost:3457'
const CONNECT_PET_URL = `${BASE_URL}/connect-pet`

test.describe('Device Registration E2E Flow', () => {
  
  // ==========================================================================
  // Setup and Teardown
  // ==========================================================================

  test.beforeEach(async ({ page }) => {
    // Set up page with authenticated session
    // NOTE: In a real implementation, you would:
    // 1. Create test user via Supabase
    // 2. Set authentication cookies
    // 3. Or use Playwright's authentication state persistence
    // For now, we're documenting the expected behavior
  })

  // ==========================================================================
  // Page Load and Initial State Tests
  // ==========================================================================

  test.describe('Page Load', () => {
    test('should load connect-pet page successfully', async ({ page }) => {
      await page.goto(CONNECT_PET_URL)
      await expect(page).toHaveURL(CONNECT_PET_URL)
      
      // Verify main heading is visible
      await expect(page.locator('h1')).toContainText('Satoshi Pet')
    })

    test('should display get-started step on initial load', async ({ page }) => {
      await page.goto(CONNECT_PET_URL)
      
      // Verify welcome message
      await expect(page.locator('text=Make Bitcoin physical and fun')).toBeVisible()
      
      // Verify feature list
      await expect(page.locator('text=Your pet reacts when you earn or spend sats')).toBeVisible()
      await expect(page.locator('text=Kids learn Bitcoin concepts through play')).toBeVisible()
      
      // Verify Get Started button
      const getStartedButton = page.locator('button:has-text("Get Started")')
      await expect(getStartedButton).toBeVisible()
      await expect(getStartedButton).toBeEnabled()
    })

    test('should show back button', async ({ page }) => {
      await page.goto(CONNECT_PET_URL)
      
      // Back button is the first button with ArrowLeft icon
      const backButton = page.locator('button').first()
      await expect(backButton).toBeVisible()
    })
  })

  // ==========================================================================
  // Step Navigation Tests
  // ==========================================================================

  test.describe('Multi-Step Navigation', () => {
    test('should navigate from get-started to choose-pet step', async ({ page }) => {
      await page.goto(CONNECT_PET_URL)
      
      await page.click('button:has-text("Get Started")')
      
      await expect(page.locator('h1')).toContainText('Choose Your Pet')
      await expect(page.locator('text=Pick the companion that will make Bitcoin tangible')).toBeVisible()
    })

    test('should navigate through all steps successfully', async ({ page }) => {
      await page.goto(CONNECT_PET_URL)
      
      // Step 1: Get Started
      await page.click('button:has-text("Get Started")')
      await expect(page.locator('h1')).toContainText('Choose Your Pet')
      
      // Step 2: Choose Pet
      await page.click('button:has-text("Continue")') // Cat is selected by default
      await expect(page.locator('h1')).toContainText('Name Your Pet')
      
      // Step 3: Name Pet
      await page.fill('input[placeholder*="pet\'s name"]', 'Fluffy')
      await page.click('button:has-text("Continue")')
      await expect(page.locator('h1')).toContainText('Connect Device')
    })

    test('should allow navigating back through steps', async ({ page }) => {
      await page.goto(CONNECT_PET_URL)
      
      // Navigate forward to step 3
      await page.click('button:has-text("Get Started")')
      await page.click('button:has-text("Continue")')
      await page.fill('input[placeholder*="pet\'s name"]', 'Test')
      await page.click('button:has-text("Continue")')
      
      // Navigate back
      const backButton = page.locator('button').first() // Back button is first button
      await backButton.click()
      await expect(page.locator('h1')).toContainText('Name Your Pet')
      
      await backButton.click()
      await expect(page.locator('h1')).toContainText('Choose Your Pet')
      
      await backButton.click()
      await expect(page.locator('h1')).toContainText('Satoshi Pet')
    })
  })

  // ==========================================================================
  // Pet Selection Tests
  // ==========================================================================

  test.describe('Pet Type Selection', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(CONNECT_PET_URL)
      await page.click('button:has-text("Get Started")')
    })

    test('should display all 5 pet type options', async ({ page }) => {
      // Verify all pet icons are rendered (5 buttons in grid)
      const petButtons = page.locator('button[class*="border-2"]')
      await expect(petButtons).toHaveCount(5)
    })

    test('should select cat by default', async ({ page }) => {
      // Cat should be selected (has different border color)
      const catButton = page.locator('button[class*="border-2"]').first()
      await expect(catButton).toHaveClass(/border-purple-500/)
    })

    test('should allow changing pet selection', async ({ page }) => {
      const petButtons = page.locator('button[class*="border-2"]')
      
      // Click second pet (dog)
      await petButtons.nth(1).click()
      
      // Verify it's now selected
      await expect(petButtons.nth(1)).toHaveClass(/border-purple-500/)
    })

    test('should proceed with selected pet type', async ({ page }) => {
      const petButtons = page.locator('button[class*="border-2"]')
      
      // Select dog
      await petButtons.nth(1).click()
      await page.click('button:has-text("Continue")')
      
      // Verify pet icon is shown on name step
      await expect(page.locator('h1')).toContainText('Name Your Pet')
      // Dog icon should be visible
    })
  })

  // ==========================================================================
  // Pet Name Input Tests
  // ==========================================================================

  test.describe('Pet Name Input', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(CONNECT_PET_URL)
      await page.click('button:has-text("Get Started")')
      await page.click('button:has-text("Continue")')
    })

    test('should disable Continue button when pet name is empty', async ({ page }) => {
      const continueButton = page.locator('button:has-text("Continue")')
      await expect(continueButton).toBeDisabled()
    })

    test('should enable Continue button when pet name is entered', async ({ page }) => {
      await page.fill('input[placeholder*="pet\'s name"]', 'Fluffy')
      
      const continueButton = page.locator('button:has-text("Continue")')
      await expect(continueButton).toBeEnabled()
    })

    test('should display entered pet name in real-time', async ({ page }) => {
      const nameInput = page.locator('input[placeholder*="pet\'s name"]')
      await nameInput.fill('Mittens')
      
      // Pet name should appear above the input
      await expect(page.locator('text=Mittens')).toBeVisible()
    })

    test('should accept various pet name formats', async ({ page }) => {
      const testNames = [
        'Fluffy',
        'Mr. Whiskers',
        'Spot123',
        'ニャンコ', // Japanese characters
        'José', // Accented characters
      ]

      for (const name of testNames) {
        await page.fill('input[placeholder*="pet\'s name"]', name)
        const continueButton = page.locator('button:has-text("Continue")')
        await expect(continueButton).toBeEnabled()
        await page.fill('input[placeholder*="pet\'s name"]', '') // Clear for next test
      }
    })

    test('should trim whitespace from pet name validation', async ({ page }) => {
      await page.fill('input[placeholder*="pet\'s name"]', '   ')
      
      // Continue button should remain disabled for whitespace-only input
      const continueButton = page.locator('button:has-text("Continue")')
      await expect(continueButton).toBeDisabled()
    })
  })

  // ==========================================================================
  // Device Code Entry Tests
  // ==========================================================================

  test.describe('Device Code Entry', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(CONNECT_PET_URL)
      await page.click('button:has-text("Get Started")')
      await page.click('button:has-text("Continue")')
      await page.fill('input[placeholder*="pet\'s name"]', 'TestPet')
      await page.click('button:has-text("Continue")')
    })

    test('should show Pair My Pet and Order Pet options initially', async ({ page }) => {
      await expect(page.locator('button:has-text("Pair My Pet")')).toBeVisible()
      await expect(page.locator('button:has-text("Order Pet")')).toBeVisible()
    })

    test('should show pairing code input when clicking Pair My Pet', async ({ page }) => {
      await page.click('button:has-text("Pair My Pet")')
      
      await expect(page.locator('input[placeholder*="pairing code"]')).toBeVisible()
      await expect(page.locator('text=Back to Options')).toBeVisible()
    })

    test('should disable Connect button when code is less than 6 characters', async ({ page }) => {
      await page.click('button:has-text("Pair My Pet")')
      
      const codeInput = page.locator('input[placeholder*="pairing code"]')
      await codeInput.fill('ABC12')
      
      const connectButton = page.locator('button:has-text("Connect")')
      await expect(connectButton).toBeDisabled()
    })

    test('should enable Connect button when code is exactly 6 characters', async ({ page }) => {
      await page.click('button:has-text("Pair My Pet")')
      
      const codeInput = page.locator('input[placeholder*="pairing code"]')
      await codeInput.fill('ABC123')
      
      const connectButton = page.locator('button:has-text("Connect")')
      await expect(connectButton).toBeEnabled()
    })

    test('should convert device code to uppercase automatically', async ({ page }) => {
      await page.click('button:has-text("Pair My Pet")')
      
      const codeInput = page.locator('input[placeholder*="pairing code"]')
      await codeInput.fill('abc123')
      
      await expect(codeInput).toHaveValue('ABC123')
    })

    test('should limit device code input to 6 characters', async ({ page }) => {
      await page.click('button:has-text("Pair My Pet")')
      
      const codeInput = page.locator('input[placeholder*="pairing code"]')
      await codeInput.fill('ABCDEFGHIJ') // Try to enter 10 characters
      
      await expect(codeInput).toHaveValue(/^.{1,6}$/) // Should only contain up to 6 chars
    })

    test('should navigate back to options when clicking Back to Options', async ({ page }) => {
      await page.click('button:has-text("Pair My Pet")')
      await expect(page.locator('input[placeholder*="pairing code"]')).toBeVisible()
      
      await page.click('text=Back to Options')
      
      await expect(page.locator('button:has-text("Pair My Pet")')).toBeVisible()
      await expect(page.locator('input[placeholder*="pairing code"]')).not.toBeVisible()
    })
  })

  // ==========================================================================
  // Complete Registration Flow Tests (Mocked API)
  // ==========================================================================

  test.describe('Complete Registration Flow', () => {
    test.skip('should complete successful device registration', async ({ page }) => {
      // SKIPPED: This test requires authenticated session which is not yet set up in E2E tests
      // TODO: Implement authentication setup in beforeEach to enable this test
      // See note in test.beforeEach about setting up Supabase test user and auth cookies
      
      // Mock successful API response
      await page.route('**/api/device/register', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'TestPet has been connected successfully!',
            deviceId: 'device-123',
          }),
        })
      })

      await page.goto(CONNECT_PET_URL)
      
      // Complete wizard
      await page.click('button:has-text("Get Started")')
      await page.click('button:has-text("Continue")')
      await page.fill('input[placeholder*="pet\'s name"]', 'TestPet')
      await page.click('button:has-text("Continue")')
      await page.click('button:has-text("Pair My Pet")')
      await page.fill('input[placeholder*="pairing code"]', 'ABC123')
      await page.click('button:has-text("Connect")')
      
      // Verify success toast appears - use first() to avoid strict mode violations
      await expect(page.locator('[role="status"]').filter({ hasText: 'Pet Connected' }).first()).toBeVisible({ timeout: 5000 })
      
      // Verify navigation to profile page (requires auth)
      await page.waitForURL('**/profile', { timeout: 5000 })
      expect(page.url()).toContain('/profile')
    })

    test('should display error message for authentication failure', async ({ page }) => {
      // Mock 401 authentication error
      await page.route('**/api/device/register', (route) => {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Unauthorized',
          }),
        })
      })

      await page.goto(CONNECT_PET_URL)
      
      // Complete wizard
      await page.click('button:has-text("Get Started")')
      await page.click('button:has-text("Continue")')
      await page.fill('input[placeholder*="pet\'s name"]', 'TestPet')
      await page.click('button:has-text("Continue")')
      await page.click('button:has-text("Pair My Pet")')
      await page.fill('input[placeholder*="pairing code"]', 'ABC123')
      await page.click('button:has-text("Connect")')
      
      // Verify error toast appears - use first() to avoid strict mode violations
      await expect(page.locator('[role="status"]').filter({ hasText: 'Connection Failed' }).first()).toBeVisible({ timeout: 3000 })
      await expect(page.locator('[role="status"]').filter({ hasText: 'Unauthorized' }).first()).toBeVisible({ timeout: 3000 })
    })

    test('should display error message for validation failure', async ({ page }) => {
      // Mock 400 validation error
      await page.route('**/api/device/register', (route) => {
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Invalid pet type',
          }),
        })
      })

      await page.goto(CONNECT_PET_URL)
      
      // Complete wizard
      await page.click('button:has-text("Get Started")')
      await page.click('button:has-text("Continue")')
      await page.fill('input[placeholder*="pet\'s name"]', 'TestPet')
      await page.click('button:has-text("Continue")')
      await page.click('button:has-text("Pair My Pet")')
      await page.fill('input[placeholder*="pairing code"]', 'ABC123')
      await page.click('button:has-text("Connect")')
      
      // Verify error toast appears - use first() to avoid strict mode violations
      await expect(page.locator('[role="status"]').filter({ hasText: 'Connection Failed' }).first()).toBeVisible({ timeout: 3000 })
      await expect(page.locator('[role="status"]').filter({ hasText: 'Invalid pet type' }).first()).toBeVisible({ timeout: 3000 })
    })

    test('should display error message for device conflict', async ({ page }) => {
      // Mock 409 conflict error
      await page.route('**/api/device/register', (route) => {
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'This device (Spot) is already connected to another user.',
          }),
        })
      })

      await page.goto(CONNECT_PET_URL)
      
      // Complete wizard
      await page.click('button:has-text("Get Started")')
      await page.click('button:has-text("Continue")')
      await page.fill('input[placeholder*="pet\'s name"]', 'TestPet')
      await page.click('button:has-text("Continue")')
      await page.click('button:has-text("Pair My Pet")')
      await page.fill('input[placeholder*="pairing code"]', 'ABC123')
      await page.click('button:has-text("Connect")')
      
      // Verify error toast appears - use first() to avoid strict mode violations  
      await expect(page.locator('[role="status"]').filter({ hasText: 'already connected to another user' }).first()).toBeVisible({ timeout: 3000 })
    })

    test('should show loading state during API call', async ({ page }) => {
      // Mock slow API response
      await page.route('**/api/device/register', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 2000))
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Connected',
            deviceId: 'device-123',
          }),
        })
      })

      await page.goto(CONNECT_PET_URL)
      
      // Complete wizard
      await page.click('button:has-text("Get Started")')
      await page.click('button:has-text("Continue")')
      await page.fill('input[placeholder*="pet\'s name"]', 'TestPet')
      await page.click('button:has-text("Continue")')
      await page.click('button:has-text("Pair My Pet")')
      await page.fill('input[placeholder*="pairing code"]', 'ABC123')
      await page.click('button:has-text("Connect")')
      
      // Verify loading state
      await expect(page.locator('text=Connecting TestPet')).toBeVisible()
    })
  })

  // ==========================================================================
  // Alternative Flow Tests
  // ==========================================================================

  test.describe('Alternative Flows', () => {
    test('should navigate to pet-store when clicking Order Pet button', async ({ page }) => {
      await page.goto(CONNECT_PET_URL)
      
      // Navigate to device connection step
      await page.click('button:has-text("Get Started")')
      await page.click('button:has-text("Continue")')
      await page.fill('input[placeholder*="pet\'s name"]', 'TestPet')
      await page.click('button:has-text("Continue")')
      
      // Click Order Pet button
      await page.click('button:has-text("Order Pet")')
      
      // Should navigate to pet-store page
      await page.waitForURL('**/pet-store', { timeout: 3000 })
      expect(page.url()).toContain('/pet-store')
    })
  })
})