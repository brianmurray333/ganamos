import type { Page, Locator } from '@playwright/test'
import { selectors } from '../selectors'
import { assertVisible, safeClick, waitForPageLoad } from '../helpers/common.helper'

/**
 * Page Object for Home Page (Landing Page)
 */
export class HomePage {
  readonly page: Page
  readonly loginLink: Locator
  readonly signUpLink: Locator
  readonly earnBitcoinButton: Locator

  constructor(page: Page) {
    this.page = page
    this.loginLink = page.locator(selectors.home.loginLink)
    this.signUpLink = page.locator(selectors.home.signUpLink)
    this.earnBitcoinButton = page.locator(selectors.home.earnBitcoinButton)
  }

  /**
   * Navigate to the home page
   */
  async goto() {
    await this.page.goto('/')
    await waitForPageLoad(this.page)
  }

  /**
   * Wait for the page to be fully loaded
   */
  async waitForLoad() {
    await assertVisible(this.loginLink, 'Login link should be visible')
  }

  /**
   * Navigate to login page
   */
  async goToLogin() {
    await safeClick(this.loginLink)
    await this.page.waitForURL(/\/auth\/login/, { waitUntil: 'domcontentloaded' })
  }

  /**
   * Navigate to sign up page
   */
  async goToSignUp() {
    await safeClick(this.signUpLink)
    await this.page.waitForURL(/\/auth\/register/, { waitUntil: 'domcontentloaded' })
  }

  /**
   * Navigate to map page
   */
  async goToMap() {
    await safeClick(this.earnBitcoinButton)
    await this.page.waitForURL(/\/map/, { waitUntil: 'domcontentloaded' })
  }

  /**
   * Verify the page is loaded correctly
   */
  async verifyPage() {
    await assertVisible(this.loginLink, 'Login link should be visible')
    await assertVisible(this.signUpLink, 'Sign up link should be visible')
  }
}
