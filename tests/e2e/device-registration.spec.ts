import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Device Registration Flow
 * Tests the complete user journey through the 4-step wizard:
 * 1. Get Started (intro screen)
 * 2. Choose Pet (select pet type)
 * 3. Name Pet (enter pet name)
 * 4. Connect Device (enter pairing code or order)
 */

test.describe('Device Registration E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the connect-pet page
    await page.goto('/connect-pet')
  })

  test('should complete full device registration flow successfully', async ({ page }) => {
    // Step 1: Get Started screen should be visible
    await expect(page.getByText('Satoshi Pet')).toBeVisible()
    await expect(page.getByText('Make Bitcoin physical and fun')).toBeVisible()
    
    // Click Get Started button
    await page.getByRole('button', { name: 'Get Started' }).click()

    // Step 2: Choose Pet screen
    await expect(page.getByText('Choose Your Pet')).toBeVisible()
    
    // Select a pet type (cat by default, try selecting dog)
    const dogButton = page.locator('button').filter({ has: page.locator('svg[class*="lucide-dog"]') })
    await dogButton.click()
    
    // Verify dog is selected (button should have highlighted styling)
    await expect(dogButton).toHaveClass(/border-purple-500/)
    
    // Click Continue
    await page.getByRole('button', { name: 'Continue' }).click()

    // Step 3: Name Pet screen
    await expect(page.getByText('Name Your Pet')).toBeVisible()
    
    // Enter pet name
    const petNameInput = page.getByPlaceholder("Enter your pet's name...")
    await petNameInput.fill('Buddy')
    
    // Verify name appears in preview
    await expect(page.getByText('Buddy', { exact: true })).toBeVisible()
    
    // Click Continue
    await page.getByRole('button', { name: 'Continue' }).click()

    // Step 4: Connect Device screen
    await expect(page.getByText('Connect Device')).toBeVisible()
    await expect(page.getByText('Ready to connect')).toBeVisible()
    
    // Click "Pair My Pet" button
    await page.getByRole('button', { name: /Pair My Pet/i }).click()
    
    // Device code entry should appear
    await expect(page.getByPlaceholder('Enter pairing code')).toBeVisible()
    
    // Enter device code
    const deviceCodeInput = page.getByPlaceholder('Enter pairing code')
    await deviceCodeInput.fill('ABC123')
    
    // Verify code is uppercase
    await expect(deviceCodeInput).toHaveValue('ABC123')
    
    // Click Connect button
    await page.getByRole('button', { name: /Connect Buddy/i }).click()
    
    // Wait for loading state
    await expect(page.getByText(/Connecting Buddy.../i)).toBeVisible()
    
    // Note: In a real E2E test with a test database, we would verify:
    // - Success toast appears
    // - Redirect to /profile occurs
    // - Device appears in profile's device list
    // For now, this tests the UI flow completion
  })

  test('should allow navigation back through wizard steps', async ({ page }) => {
    // Start at Get Started
    await expect(page.getByText('Satoshi Pet')).toBeVisible()
    
    // Go to Choose Pet
    await page.getByRole('button', { name: 'Get Started' }).click()
    await expect(page.getByText('Choose Your Pet')).toBeVisible()
    
    // Click back button (floating back button in top-left)
    await page.getByRole('button').first().click() // First button is the back button
    
    // Should return to Get Started
    await expect(page.getByText('Make Bitcoin physical and fun')).toBeVisible()
  })

  test('should validate pet name is required before proceeding', async ({ page }) => {
    // Navigate to Name Pet step
    await page.getByRole('button', { name: 'Get Started' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    
    // Continue button should be disabled when name is empty
    const continueButton = page.getByRole('button', { name: 'Continue' })
    await expect(continueButton).toBeDisabled()
    
    // Enter name
    await page.getByPlaceholder("Enter your pet's name...").fill('T')
    
    // Button should now be enabled
    await expect(continueButton).toBeEnabled()
  })

  test('should validate device code length', async ({ page }) => {
    // Navigate to Connect Device step
    await page.getByRole('button', { name: 'Get Started' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByPlaceholder("Enter your pet's name...").fill('TestPet')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: /Pair My Pet/i }).click()
    
    // Enter partial code
    const deviceCodeInput = page.getByPlaceholder('Enter pairing code')
    await deviceCodeInput.fill('ABC12') // Only 5 characters
    
    // Connect button should be disabled
    const connectButton = page.getByRole('button', { name: /Connect TestPet/i })
    await expect(connectButton).toBeDisabled()
    
    // Complete the code
    await deviceCodeInput.fill('ABC123') // 6 characters
    
    // Button should now be enabled
    await expect(connectButton).toBeEnabled()
  })

  test('should display all pet type options', async ({ page }) => {
    // Navigate to Choose Pet step
    await page.getByRole('button', { name: 'Get Started' }).click()
    
    // Verify all 5 pet types are available
    const petTypes = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle']
    
    for (const petType of petTypes) {
      const petButton = page.locator('button').filter({ 
        has: page.locator(`svg[class*="lucide-${petType}"]`) 
      })
      await expect(petButton).toBeVisible()
    }
  })

  test('should show order pet option', async ({ page }) => {
    // Navigate to Connect Device step
    await page.getByRole('button', { name: 'Get Started' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByPlaceholder("Enter your pet's name...").fill('TestPet')
    await page.getByRole('button', { name: 'Continue' }).click()
    
    // Verify "Order Pet - $49" button is visible
    await expect(page.getByRole('button', { name: /Order Pet - \$49/i })).toBeVisible()
  })

  test('should toggle between code entry and order options', async ({ page }) => {
    // Navigate to Connect Device step
    await page.getByRole('button', { name: 'Get Started' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByPlaceholder("Enter your pet's name...").fill('TestPet')
    await page.getByRole('button', { name: 'Continue' }).click()
    
    // Initially should see both options
    await expect(page.getByRole('button', { name: /Pair My Pet/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Order Pet/i })).toBeVisible()
    
    // Click Pair My Pet
    await page.getByRole('button', { name: /Pair My Pet/i }).click()
    
    // Code entry should appear
    await expect(page.getByPlaceholder('Enter pairing code')).toBeVisible()
    
    // Back to Options link should be visible
    await expect(page.getByText('Back to Options')).toBeVisible()
    
    // Click back
    await page.getByText('Back to Options').click()
    
    // Should return to original options
    await expect(page.getByRole('button', { name: /Pair My Pet/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Order Pet/i })).toBeVisible()
  })

  test('should display connecting animation during submission', async ({ page }) => {
    // Navigate to Connect Device step and enter code
    await page.getByRole('button', { name: 'Get Started' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByPlaceholder("Enter your pet's name...").fill('AnimatedPet')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: /Pair My Pet/i }).click()
    await page.getByPlaceholder('Enter pairing code').fill('TEST12')
    
    // Click connect (will trigger loading state)
    await page.getByRole('button', { name: /Connect AnimatedPet/i }).click()
    
    // Verify loading text appears
    await expect(page.getByText(/Connecting AnimatedPet.../i)).toBeVisible()
    
    // Verify button is disabled during loading
    const connectButton = page.getByRole('button', { name: /Connecting AnimatedPet.../i })
    await expect(connectButton).toBeDisabled()
  })

  test('should preserve pet name and type through navigation', async ({ page }) => {
    // Select dog and name it
    await page.getByRole('button', { name: 'Get Started' }).click()
    
    const dogButton = page.locator('button').filter({ has: page.locator('svg[class*="lucide-dog"]') })
    await dogButton.click()
    await page.getByRole('button', { name: 'Continue' }).click()
    
    await page.getByPlaceholder("Enter your pet's name...").fill('Rover')
    await page.getByRole('button', { name: 'Continue' }).click()
    
    // Verify pet name is shown on Connect Device step
    await expect(page.getByText('Rover')).toBeVisible()
    
    // Go back
    await page.getByRole('button').first().click() // Back button
    
    // Verify name is still preserved
    await expect(page.getByPlaceholder("Enter your pet's name...")).toHaveValue('Rover')
  })

  test('should convert device code to uppercase as user types', async ({ page }) => {
    // Navigate to device code entry
    await page.getByRole('button', { name: 'Get Started' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByPlaceholder("Enter your pet's name...").fill('TestPet')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: /Pair My Pet/i }).click()
    
    // Type lowercase code
    const deviceCodeInput = page.getByPlaceholder('Enter pairing code')
    await deviceCodeInput.fill('abc123')
    
    // Verify it's converted to uppercase
    await expect(deviceCodeInput).toHaveValue('ABC123')
  })

  test('should limit device code to 6 characters', async ({ page }) => {
    // Navigate to device code entry
    await page.getByRole('button', { name: 'Get Started' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByPlaceholder("Enter your pet's name...").fill('TestPet')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: /Pair My Pet/i }).click()
    
    // Try to enter more than 6 characters
    const deviceCodeInput = page.getByPlaceholder('Enter pairing code')
    await deviceCodeInput.fill('ABCDEFGHIJ')
    
    // Should be truncated to 6
    await expect(deviceCodeInput).toHaveValue('ABCDEF')
  })

  test('should display feature highlights on get started screen', async ({ page }) => {
    // Verify all feature highlights are visible
    await expect(page.getByText('Your pet reacts when you earn or spend sats')).toBeVisible()
    await expect(page.getByText('Kids learn Bitcoin concepts through play')).toBeVisible()
    await expect(page.getByText('Carry Bitcoin everywhere as a physical reminder')).toBeVisible()
  })

  test('should show animated pet icon on get started screen', async ({ page }) => {
    // Verify the main pet icon (cat by default) is displayed
    const catIcon = page.locator('svg[class*="lucide-cat"]').first()
    await expect(catIcon).toBeVisible()
    
    // Verify Bitcoin symbols are part of the animation
    await expect(page.getByText('₿').first()).toBeVisible()
  })

  test('should update pet preview when selecting different types', async ({ page }) => {
    await page.getByRole('button', { name: 'Get Started' }).click()
    
    // Default should be cat
    const catIconLarge = page.locator('svg[class*="lucide-cat"]').first()
    await expect(catIconLarge).toBeVisible()
    
    // Select rabbit
    const rabbitButton = page.locator('button').filter({ has: page.locator('svg[class*="lucide-rabbit"]') })
    await rabbitButton.click()
    
    // Large preview should now show rabbit
    const rabbitIconLarge = page.locator('svg[class*="lucide-rabbit"]').first()
    await expect(rabbitIconLarge).toBeVisible()
  })

  test('should show sonar animation on connect device screen', async ({ page }) => {
    // Navigate to Connect Device step
    await page.getByRole('button', { name: 'Get Started' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByPlaceholder("Enter your pet's name...").fill('TestPet')
    await page.getByRole('button', { name: 'Continue' }).click()
    
    // Verify "Ready to connect" text with pulse animation
    await expect(page.getByText('Ready to connect')).toBeVisible()
    await expect(page.getByText('Ready to connect')).toHaveClass(/animate-pulse/)
  })
})

test.describe('Device Registration Mobile Viewport', () => {
  test.use({ viewport: { width: 375, height: 667 } }) // iPhone SE size

  test('should work correctly on mobile viewport', async ({ page }) => {
    await page.goto('/connect-pet')
    
    // Verify layout is responsive
    await expect(page.getByText('Satoshi Pet')).toBeVisible()
    
    // Complete flow on mobile
    await page.getByRole('button', { name: 'Get Started' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByPlaceholder("Enter your pet's name...").fill('MobilePet')
    await page.getByRole('button', { name: 'Continue' }).click()
    
    // Verify all buttons are accessible
    await expect(page.getByRole('button', { name: /Pair My Pet/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Order Pet/i })).toBeVisible()
  })
})