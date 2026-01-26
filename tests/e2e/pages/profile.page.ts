import type { Page, Locator } from '@playwright/test'
import { selectors } from '../selectors'
import { assertVisible, safeClick, waitForPageLoad, waitForElement } from '../helpers/common.helper'

/**
 * Page Object for Profile Page
 */
export class ProfilePage {
  readonly page: Page
  
  // User info
  readonly userName: Locator
  readonly userAvatar: Locator
  readonly balanceDisplay: Locator
  
  // Tabs
  readonly activityTab: Locator
  readonly postsTab: Locator
  
  // Navigation
  readonly walletLink: Locator
  readonly settingsButton: Locator
  readonly signOutButton: Locator

  constructor(page: Page) {
    this.page = page
    
    this.userName = page.locator(selectors.profile.userName)
    this.userAvatar = page.locator(selectors.profile.userAvatar)
    this.balanceDisplay = page.locator(selectors.profile.balanceDisplay)
    
    this.activityTab = page.locator(selectors.profile.activityTab)
    this.postsTab = page.locator(selectors.profile.postsTab)
    
    this.walletLink = page.locator(selectors.profile.walletLink)
    this.settingsButton = page.locator(selectors.profile.settingsButton)
    this.signOutButton = page.locator(selectors.profile.signOutButton)
  }

  /**
   * Navigate to the profile page
   */
  async goto() {
    await this.page.goto('/profile')
    await waitForPageLoad(this.page)
  }

  /**
   * Wait for the page to be fully loaded
   */
  async waitForLoad() {
    await this.page.waitForURL(/\/profile/)
    // Wait for page to be ready
    await this.page.waitForLoadState('domcontentloaded')
  }

  /**
   * Get the user's name
   */
  async getUserName(): Promise<string> {
    const name = await this.userName.first().textContent()
    return name?.trim() || ''
  }

  /**
   * Get the balance as text
   */
  async getBalance(): Promise<string> {
    const balance = await this.balanceDisplay.first().textContent()
    return balance?.trim() || ''
  }

  /**
   * Navigate to wallet page
   */
  async goToWallet() {
    await safeClick(this.walletLink.first())
    await this.page.waitForURL(/\/wallet/, { waitUntil: 'domcontentloaded' })
  }

  /**
   * Switch to Activity tab
   */
  async switchToActivityTab() {
    await safeClick(this.activityTab)
  }

  /**
   * Switch to Posts tab
   */
  async switchToPostsTab() {
    await safeClick(this.postsTab)
  }

  /**
   * Sign out from the application
   */
  async signOut() {
    await safeClick(this.signOutButton)
    await this.page.waitForURL(/\/(auth\/login)?$/, { timeout: 10000, waitUntil: 'domcontentloaded' })
  }

  /**
   * Verify profile page is displayed
   */
  async verifyPage() {
    await this.page.waitForURL(/\/profile/)
    await this.waitForLoad()
  }

  /**
   * Verify that balance is displayed and contains a number
   */
  async verifyBalanceDisplayed() {
    await assertVisible(this.balanceDisplay.first(), 'Balance should be visible')
    const balance = await this.getBalance()
    // Check that balance contains digits
    if (!/\d/.test(balance)) {
      throw new Error(`Balance does not contain numbers: ${balance}`)
    }
  }

  /**
   * Wait for balance to update (useful after deposit)
   */
  async waitForBalanceUpdate(previousBalance: string, timeout: number = 10000) {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      const currentBalance = await this.getBalance()
      if (currentBalance !== previousBalance) {
        return currentBalance
      }
      await this.page.waitForTimeout(500)
    }
    
    throw new Error(`Balance did not update within ${timeout}ms`)
  }

  /**
   * Verify user profile information is displayed
   */
  async verifyUserInfo() {
    await assertVisible(this.userName.first(), 'User name should be visible')
    await assertVisible(this.balanceDisplay.first(), 'Balance should be visible')
  }
}
