import type { Page, Locator } from '@playwright/test'
import { selectors } from '../selectors'
import { assertVisible, safeClick, waitForPageLoad, waitForNavigation } from '../helpers/common.helper'

/**
 * Page Object for Authentication Page (Login/Register)
 */
export class AuthPage {
  readonly page: Page
  
  // Login buttons
  readonly googleSignInButton: Locator
  readonly emailSignInButton: Locator
  readonly phoneSignInButton: Locator
  readonly mockLoginButton: Locator
  
  // Email form
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  
  // Links
  readonly signUpLink: Locator
  readonly forgotPasswordLink: Locator

  constructor(page: Page) {
    this.page = page
    
    this.googleSignInButton = page.locator(selectors.auth.googleSignInButton)
    this.emailSignInButton = page.locator(selectors.auth.emailSignInButton)
    this.phoneSignInButton = page.locator(selectors.auth.phoneSignInButton)
    this.mockLoginButton = page.locator(selectors.auth.mockLoginButton)
    
    this.emailInput = page.locator(selectors.auth.emailInput)
    this.passwordInput = page.locator(selectors.auth.passwordInput)
    this.submitButton = page.locator(selectors.auth.submitButton)
    
    this.signUpLink = page.locator(selectors.auth.signUpLink)
    this.forgotPasswordLink = page.locator(selectors.auth.forgotPasswordLink)
  }

  /**
   * Navigate to the login page
   */
  async goto() {
    await this.page.goto('/auth/login')
    await waitForPageLoad(this.page)
  }

  /**
   * Wait for the page to be fully loaded
   */
  async waitForLoad() {
    await assertVisible(this.mockLoginButton, 'Mock login button should be visible')
  }

  /**
   * Sign in with Mock Login (development)
   * This is the recommended method for E2E tests
   */
  async signInWithMock() {
    await safeClick(this.mockLoginButton)

    // Wait for dashboard to be fully loaded using test-id (most reliable signal)
    // This ensures auth is complete AND the dashboard has rendered
    await Promise.race([
      this.page.waitForSelector('[data-testid="dashboard-loaded"]', {
        state: 'visible',
        timeout: 30000,
      }),
      this.page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard'), {
        timeout: 30000,
        waitUntil: 'domcontentloaded'
      })
    ])

    // Additional safety: Wait for dashboard content to be present
    // This ensures the page has actually loaded and auth is complete
    await this.page.locator(selectors.dashboard.walletLink).first().waitFor({ state: 'visible', timeout: 10000 })
  }

  /**
   * Sign in with email and password
   */
  async signInWithEmail(email: string, password: string) {
    // Click to show email form
    await safeClick(this.emailSignInButton)

    // Fill credentials
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)

    // Submit
    await safeClick(this.submitButton)

    // Wait for navigation
    await waitForNavigation(this.page, /\/dashboard/, 30000)
  }

  /**
   * Navigate to sign up page
   */
  async goToSignUp() {
    await safeClick(this.signUpLink)
    await this.page.waitForURL(/\/auth\/register/, { waitUntil: 'domcontentloaded' })
  }

  /**
   * Navigate to forgot password page
   */
  async goToForgotPassword() {
    // First show email form
    await safeClick(this.emailSignInButton)
    // Then click forgot password
    await safeClick(this.forgotPasswordLink)
    await this.page.waitForURL(/\/auth\/forgot-password/, { waitUntil: 'domcontentloaded' })
  }

  /**
   * Verify the login page is displayed
   */
  async verifyPage() {
    await assertVisible(this.mockLoginButton, 'Mock login button should be visible')
    await assertVisible(this.googleSignInButton, 'Google sign in button should be visible')
  }
}
