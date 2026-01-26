import type { Page, Locator } from '@playwright/test'
import { selectors } from '../selectors'
import { assertVisible, safeClick, waitForPageLoad } from '../helpers/common.helper'

/**
 * Page Object for Dashboard Page
 */
export class DashboardPage {
  readonly page: Page
  
  // Navigation links
  readonly walletLink: Locator
  readonly profileLink: Locator
  readonly mapLink: Locator
  
  // Content
  readonly postCard: Locator
  readonly userAvatar: Locator
  readonly filterButton: Locator

  constructor(page: Page) {
    this.page = page
    
    this.walletLink = page.locator(selectors.dashboard.walletLink)
    this.profileLink = page.locator(selectors.dashboard.profileLink)
    this.mapLink = page.locator(selectors.dashboard.mapLink)
    
    this.postCard = page.locator(selectors.dashboard.postCard)
    this.userAvatar = page.locator(selectors.dashboard.userAvatar)
    this.filterButton = page.locator(selectors.dashboard.filterButton)
  }

  /**
   * Navigate to the dashboard page
   */
  async goto() {
    await this.page.goto('/dashboard')
    await waitForPageLoad(this.page)
  }

  /**
   * Wait for the page to be fully loaded
   */
  async waitForLoad() {
    // Wait for navigation to be visible (wallet or profile link)
    await this.walletLink.first().waitFor({ state: 'visible', timeout: 10000 })
  }

  /**
   * Navigate to wallet page
   */
  async goToWallet() {
    await safeClick(this.walletLink.first())
    await this.page.waitForURL(/\/wallet/, { waitUntil: 'domcontentloaded' })
  }

  /**
   * Navigate to profile page
   */
  async goToProfile() {
    await safeClick(this.profileLink.first())
    await this.page.waitForURL(/\/profile/, { waitUntil: 'domcontentloaded' })
  }

  /**
   * Navigate to map page
   */
  async goToMap() {
    await safeClick(this.mapLink.first())
    await this.page.waitForURL(/\/map/, { waitUntil: 'domcontentloaded' })
  }

  /**
   * Get the count of post cards displayed
   */
  async getPostCount(): Promise<number> {
    return await this.postCard.count()
  }

  /**
   * Verify the dashboard page is displayed
   */
  async verifyPage() {
    // Verify we're on the dashboard
    await this.page.waitForURL(/\/dashboard/)
    // Wait for content to load
    await this.waitForLoad()
  }
}
