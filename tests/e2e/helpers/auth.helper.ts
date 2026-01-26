import type { Page } from '@playwright/test'
import { selectors } from '../selectors'
import { waitForNavigation, safeClick } from './common.helper'

/**
 * Authentication helper for E2E tests
 * Handles login/logout flows
 */

export class AuthHelper {
  constructor(private page: Page) {}

  /**
   * Sign in using the Mock Login button (development only)
   * This is the recommended approach for E2E tests in dev environment
   */
  async signInWithMock() {
    await this.page.goto('/auth/login')

    // Wait for the page to load
    await this.page.waitForLoadState('domcontentloaded')

    // Click the Mock Login button
    const mockLoginButton = this.page.locator(selectors.auth.mockLoginButton)
    await safeClick(mockLoginButton)

    // Mock login can take a few seconds as it creates user profile,
    // sets up subscriptions, etc. Wait with generous timeout.
    await this.page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard'), {
      timeout: 60000,
      waitUntil: 'domcontentloaded'
    })

    // Wait for dashboard content to be present (not just the URL)
    await this.page.locator(selectors.dashboard.walletLink).first().waitFor({ state: 'visible', timeout: 10000 })
  }

  /**
   * Sign in with email and password
   * Note: This requires an actual user account to exist
   */
  async signInWithEmail(email: string, password: string) {
    await this.page.goto('/auth/login')
    await this.page.waitForLoadState('domcontentloaded')

    // Click "Sign in with Email" button to show the form
    const emailButton = this.page.locator(selectors.auth.emailSignInButton)
    await safeClick(emailButton)

    // Fill in credentials
    await this.page.locator(selectors.auth.emailInput).fill(email)
    await this.page.locator(selectors.auth.passwordInput).fill(password)

    // Submit the form
    await this.page.locator(selectors.auth.submitButton).click()

    // Wait for redirect to dashboard
    await waitForNavigation(this.page, /\/dashboard/, 30000)
  }

  /**
   * Sign out from the application
   */
  async signOut() {
    // Navigate to profile page where sign out is available
    await this.page.goto('/profile')
    await this.page.waitForLoadState('domcontentloaded')

    // Find and click the sign out button
    const signOutButton = this.page.locator(selectors.profile.signOutButton)
    await safeClick(signOutButton)

    // Wait for redirect to home or login
    await this.page.waitForURL(/\/(auth\/login)?$/, { timeout: 10000, waitUntil: 'domcontentloaded' })
  }

  /**
   * Check if user is authenticated by checking if we can access dashboard
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      await this.page.goto('/dashboard')
      await this.page.waitForURL(/\/dashboard/, { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  /**
   * Ensure the user is authenticated, login with mock if not
   */
  async ensureAuthenticated() {
    const isAuth = await this.isAuthenticated()
    if (!isAuth) {
      await this.signInWithMock()
    }
  }
}

/**
 * Standalone helper to login with mock (for use in test setup)
 */
export async function loginWithMock(page: Page) {
  const auth = new AuthHelper(page)
  await auth.signInWithMock()
}

/**
 * Standalone helper to logout
 */
export async function logout(page: Page) {
  const auth = new AuthHelper(page)
  await auth.signOut()
}
