import { Page, Locator } from '@playwright/test'

/**
 * Page Object for the Homepage/Landing Page
 * Handles navigation and interactions with the main landing page
 */
export class HomePage {
  readonly page: Page
  readonly loginLink: Locator
  readonly signupLink: Locator
  readonly earnBitcoinButton: Locator

  constructor(page: Page) {
    this.page = page
    // Using stable selectors - href attributes for links
    this.loginLink = page.locator('a[href="/auth/login"]')
    this.signupLink = page.locator('a[href="/auth/register"]')
    this.earnBitcoinButton = page.locator('a[href="/map"]')
  }

  /**
   * Navigate to the homepage
   */
  async goto() {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' })
    // The homepage has an auth timeout that shows a spinner for up to 3 seconds
    // Wait for either the login link to appear or a bit longer for the auth check
    try {
      await this.loginLink.waitFor({ state: 'visible', timeout: 5000 })
    } catch (e) {
      // If login link doesn't appear quickly, wait a bit more for auth timeout
      await this.page.waitForTimeout(3500)
      await this.loginLink.waitFor({ state: 'visible', timeout: 2000 })
    }
  }

  /**
   * Navigate to the login page by clicking the login link
   */
  async navigateToLogin() {
    await this.loginLink.click()
    // Wait for navigation to complete
    await this.page.waitForURL(/\/auth\/login/)
  }

  /**
   * Navigate to the signup page by clicking the signup link
   */
  async navigateToSignup() {
    await this.signupLink.click()
    await this.page.waitForURL(/\/auth\/register/)
  }

  /**
   * Navigate to the map page by clicking the earn bitcoin button
   */
  async navigateToMap() {
    await this.earnBitcoinButton.click()
    await this.page.waitForURL(/\/map/)
  }
}
