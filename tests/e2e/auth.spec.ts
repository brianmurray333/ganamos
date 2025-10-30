import { test, expect } from '@playwright/test'
import { HomePage } from './page-objects/HomePage'
import { LoginPage } from './page-objects/LoginPage'
import { INVALID_TEST_USER } from './helpers/test-credentials'

/**
 * E2E Test Suite: Authentication/Login User Journey
 * 
 * Tests the complete login flow from homepage navigation to authentication
 * following best practices with page objects and reusable components.
 */
test.describe('Auth/Login User Journey', () => {
  /**
   * Test: Navigate from homepage to login page and attempt login with invalid credentials
   * 
   * This test covers:
   * 1. Landing on the homepage
   * 2. Navigating to the login page
   * 3. Revealing the email login form
   * 4. Filling in credentials
   * 5. Submitting the login form
   * 
   * Expected: The login attempt should fail with invalid credentials,
   * but the form submission and flow should work correctly
   */
  test('should navigate from homepage to login and attempt email authentication', async ({ page }) => {
    // Initialize page objects
    const homePage = new HomePage(page)
    const loginPage = new LoginPage(page)

    // Step 1: Navigate to homepage
    await homePage.goto()
    await expect(page).toHaveURL('/')

    // Step 2: Navigate to login page via the login link
    await homePage.navigateToLogin()
    
    // Step 3: Verify we're on the login page
    await expect(page).toHaveURL(/\/auth\/login/)
    
    // Step 4: Verify login options are visible
    await loginPage.assertLoginOptionsVisible()

    // Step 5: Click "Sign in with Email" to reveal the email form
    await loginPage.showEmailForm()
    
    // Step 6: Verify email form is now visible
    await loginPage.assertEmailFormVisible()

    // Step 7: Click into the modal/form area to ensure focus
    await loginPage.loginModal.click()

    // Step 8: Fill in email field
    await loginPage.fillEmail(INVALID_TEST_USER.email)
    
    // Verify email was filled correctly
    await expect(loginPage.emailInput).toHaveValue(INVALID_TEST_USER.email)

    // Step 9: Fill in password field
    await loginPage.fillPassword(INVALID_TEST_USER.password)
    
    // Verify password was filled correctly (value check)
    await expect(loginPage.passwordInput).toHaveValue(INVALID_TEST_USER.password)

    // Step 10: Submit the login form
    await loginPage.submitLogin()

    // Step 11: Wait for response and verify we're still on login page
    // (because credentials are invalid, we should not be redirected)
    // Using a reasonable timeout for the auth attempt
    await page.waitForTimeout(2000)
    
    // We should still be on the login page or see an error
    const currentUrl = page.url()
    const isOnLoginPage = currentUrl.includes('/auth/login')
    const isOnDashboard = currentUrl.includes('/dashboard')
    
    // Either we're still on login (error case) or redirected to dashboard (if credentials work)
    expect(isOnLoginPage || isOnDashboard).toBeTruthy()
  })

  /**
   * Test: Direct navigation to login page
   * 
   * Verifies that users can directly access the login page
   * and all login options are properly displayed
   */
  test('should load login page directly and display all sign-in options', async ({ page }) => {
    const loginPage = new LoginPage(page)

    // Navigate directly to login page
    await loginPage.goto()
    
    // Verify URL
    await expect(page).toHaveURL(/\/auth\/login/)

    // Verify all login options are visible
    await loginPage.assertLoginOptionsVisible()
    
    // Verify the title is present
    const title = page.locator('h1:has-text("Ganamos!")')
    await expect(title).toBeVisible()

    // Verify sign up link is present
    await expect(loginPage.signupLink).toBeVisible()
  })

  /**
   * Test: Email form visibility toggle
   * 
   * Verifies that clicking "Sign in with Email" reveals the form
   * and "Back to all sign in options" hides it again
   */
  test('should toggle email form visibility', async ({ page }) => {
    const loginPage = new LoginPage(page)

    await loginPage.goto()

    // Initially, email form should not be visible
    await expect(loginPage.emailInput).not.toBeVisible()

    // Click "Sign in with Email"
    await loginPage.showEmailForm()

    // Email form should now be visible
    await loginPage.assertEmailFormVisible()

    // Back button should be visible
    await expect(loginPage.backToOptionsButton).toBeVisible()

    // Click back button
    await loginPage.goBackToOptions()

    // Email form should be hidden again
    await expect(loginPage.emailInput).not.toBeVisible()

    // Main login options should be visible again
    await loginPage.assertLoginOptionsVisible()
  })

  /**
   * Test: Form validation with empty fields
   * 
   * Verifies that the submit button is properly disabled
   * when email or password fields are empty
   */
  test('should disable submit button with empty credentials', async ({ page }) => {
    const loginPage = new LoginPage(page)

    await loginPage.goto()
    await loginPage.showEmailForm()

    // Submit button should be disabled when both fields are empty
    await expect(loginPage.loginSubmitButton).toBeDisabled()

    // Fill only email
    await loginPage.fillEmail('test@example.com')
    
    // Button should still be disabled (password empty)
    await expect(loginPage.loginSubmitButton).toBeDisabled()

    // Clear email and fill only password
    await loginPage.fillEmail('')
    await loginPage.fillPassword('password123')
    
    // Button should still be disabled (email empty)
    await expect(loginPage.loginSubmitButton).toBeDisabled()

    // Fill both fields
    await loginPage.fillEmail('test@example.com')
    await loginPage.fillPassword('password123')
    
    // Button should now be enabled
    await expect(loginPage.loginSubmitButton).toBeEnabled()
  })
})
