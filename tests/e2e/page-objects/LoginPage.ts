import { Page, Locator, expect } from '@playwright/test'

/**
 * Page Object for the Login Page
 * Handles all interactions with the authentication/login page
 */
export class LoginPage {
  readonly page: Page
  // Button selectors
  readonly googleSignInButton: Locator
  readonly emailSignInButton: Locator
  readonly phoneSignInButton: Locator
  readonly mockLoginButton: Locator
  
  // Form elements
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly loginSubmitButton: Locator
  readonly backToOptionsButton: Locator
  
  // Navigation links
  readonly forgotPasswordLink: Locator
  readonly signupLink: Locator
  readonly mapLink: Locator
  
  // Modal/Form container
  readonly loginModal: Locator
  readonly errorAlert: Locator

  constructor(page: Page) {
    this.page = page
    
    // Using stable selectors based on button text and structure
    this.googleSignInButton = page.locator('button:has-text("Sign in with Google")')
    this.emailSignInButton = page.locator('button:has-text("Sign in with Email")')
    this.phoneSignInButton = page.locator('button:has-text("Sign in with Phone")')
    this.mockLoginButton = page.locator('button:has-text("Mock Login (Test User)")')
    
    // Form inputs using ID selectors (most stable)
    this.emailInput = page.locator('#email')
    this.passwordInput = page.locator('#password')
    
    // Submit button - using specific selector for the login button
    this.loginSubmitButton = page.locator('button[type="submit"]:has-text("Log in")')
    
    // Back button
    this.backToOptionsButton = page.locator('button:has-text("Back to all sign in options")')
    
    // Links
    this.forgotPasswordLink = page.locator('a[href="/auth/forgot-password"]')
    this.signupLink = page.locator('a[href="/auth/register"]')
    this.mapLink = page.locator('a[href="/map"]')
    
    // Modal container
    this.loginModal = page.locator('div.backdrop-blur-sm.p-8.rounded-lg')
    
    // Error alerts
    this.errorAlert = page.locator('[role="alert"]')
  }

  /**
   * Navigate directly to the login page
   */
  async goto() {
    await this.page.goto('/auth/login')
  }

  /**
   * Click the "Sign in with Email" button to reveal the email form
   */
  async showEmailForm() {
    // Ensure the button is ready to be clicked
    await this.emailSignInButton.waitFor({ state: 'visible' })
    await this.emailSignInButton.click({ force: false })
    
    // Wait for React to update and show the form
    // The form appears conditionally based on showEmailForm state
    // Sometimes the click doesn't register, so we retry up to 3 times
    let attempts = 0
    const maxAttempts = 3
    
    while (attempts < maxAttempts) {
      try {
        await this.emailInput.waitFor({ state: 'visible', timeout: 3000 })
        return // Success!
      } catch (e) {
        attempts++
        if (attempts >= maxAttempts) {
          throw e // Give up after max attempts
        }
        console.log(`Email form did not appear on attempt ${attempts}, trying click again`)
        await this.page.waitForTimeout(300)
        await this.emailSignInButton.click()
      }
    }
  }

  /**
   * Fill in the email field
   */
  async fillEmail(email: string) {
    await this.emailInput.fill(email)
  }

  /**
   * Fill in the password field
   */
  async fillPassword(password: string) {
    await this.passwordInput.fill(password)
  }

  /**
   * Submit the login form
   */
  async submitLogin() {
    await this.loginSubmitButton.click()
  }

  /**
   * Complete login flow with email and password
   * This is the main helper method that combines all steps
   */
  async login(email: string, password: string) {
    // First, show the email form if not already visible
    const isEmailFormVisible = await this.emailInput.isVisible().catch(() => false)
    if (!isEmailFormVisible) {
      await this.showEmailForm()
    }
    
    // Fill in credentials
    await this.fillEmail(email)
    await this.passwordInput.click() // Click to ensure focus
    await this.fillPassword(password)
    
    // Submit the form
    await this.submitLogin()
  }

  /**
   * Perform Google sign-in (initiates OAuth flow)
   */
  async signInWithGoogle() {
    await this.googleSignInButton.click()
  }

  /**
   * Perform phone sign-in navigation
   */
  async signInWithPhone() {
    await this.phoneSignInButton.click()
    await this.page.waitForURL(/\/auth\/phone/)
  }

  /**
   * Use mock login (development only)
   */
  async useMockLogin() {
    await this.mockLoginButton.click()
  }

  /**
   * Assert that an error message is displayed
   */
  async assertErrorDisplayed() {
    await expect(this.errorAlert).toBeVisible()
  }

  /**
   * Assert successful navigation after login
   * @param expectedPath - The path to expect after successful login (default: /dashboard)
   */
  async assertSuccessfulLogin(expectedPath: string = '/dashboard') {
    await this.page.waitForURL(new RegExp(expectedPath))
    await expect(this.page).toHaveURL(new RegExp(expectedPath))
  }

  /**
   * Assert that the email form is visible
   */
  async assertEmailFormVisible() {
    await expect(this.emailInput).toBeVisible()
    await expect(this.passwordInput).toBeVisible()
    await expect(this.loginSubmitButton).toBeVisible()
  }

  /**
   * Assert that the main login options are visible
   */
  async assertLoginOptionsVisible() {
    await expect(this.googleSignInButton).toBeVisible()
    await expect(this.emailSignInButton).toBeVisible()
    await expect(this.phoneSignInButton).toBeVisible()
  }

  /**
   * Navigate back to all sign-in options
   */
  async goBackToOptions() {
    await this.backToOptionsButton.click()
    // Wait for the form to disappear
    await this.emailInput.waitFor({ state: 'hidden', timeout: 5000 })
  }
}
