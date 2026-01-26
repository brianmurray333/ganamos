import type { Page, Locator } from '@playwright/test'
import { selectors } from '../selectors'
import { assertVisible, safeClick, waitForPageLoad, assertContainsText } from '../helpers/common.helper'

/**
 * Page Object for Wallet Page
 */
export class WalletPage {
  readonly page: Page
  
  // Action buttons
  readonly depositButton: Locator
  readonly withdrawButton: Locator
  
  // Balance
  readonly balanceDisplay: Locator
  
  // Transaction history
  readonly transactionList: Locator
  readonly transactionItem: Locator
  readonly transactionStatus: Locator
  
  // Navigation
  readonly backButton: Locator
  readonly closeButton: Locator

  constructor(page: Page) {
    this.page = page
    
    this.depositButton = page.locator(selectors.wallet.depositButton)
    this.withdrawButton = page.locator(selectors.wallet.withdrawButton)
    
    this.balanceDisplay = page.locator(selectors.wallet.balanceDisplay)
    
    this.transactionList = page.locator(selectors.wallet.transactionList)
    this.transactionItem = page.locator(selectors.wallet.transactionItem)
    this.transactionStatus = page.locator(selectors.wallet.transactionStatus)
    
    this.backButton = page.locator(selectors.wallet.backButton)
    this.closeButton = page.locator(selectors.wallet.closeButton)
  }

  /**
   * Navigate to the wallet page
   */
  async goto() {
    await this.page.goto('/wallet')
    await waitForPageLoad(this.page)
  }

  /**
   * Wait for the page to be fully loaded
   */
  async waitForLoad() {
    await this.page.waitForURL(/\/wallet/)
    // Wait for deposit button to be visible
    await this.depositButton.first().waitFor({ state: 'visible', timeout: 10000 })
  }

  /**
   * Navigate to deposit page
   */
  async goToDeposit() {
    await safeClick(this.depositButton.first())
    await this.page.waitForURL(/\/wallet\/deposit/, { waitUntil: 'domcontentloaded' })
  }

  /**
   * Navigate to withdraw page
   */
  async goToWithdraw() {
    await safeClick(this.withdrawButton.first())
    await this.page.waitForURL(/\/wallet\/withdraw/, { waitUntil: 'domcontentloaded' })
  }

  /**
   * Get current balance as text
   */
  async getBalance(): Promise<string> {
    const balance = await this.balanceDisplay.first().textContent()
    return balance || ''
  }

  /**
   * Get count of transactions
   */
  async getTransactionCount(): Promise<number> {
    return await this.transactionItem.count()
  }

  /**
   * Get the status of the most recent transaction
   */
  async getMostRecentTransactionStatus(): Promise<string> {
    const status = await this.transactionStatus.first().textContent()
    return status?.trim() || ''
  }

  /**
   * Wait for a transaction with specific status to appear
   */
  async waitForTransactionStatus(status: string, timeout: number = 10000) {
    await this.page.waitForSelector(
      `${selectors.wallet.transactionStatus}:has-text("${status}")`,
      { timeout }
    )
  }

  /**
   * Verify a transaction exists with the given status
   */
  async verifyTransactionStatus(status: string) {
    const statusElement = this.page.locator(selectors.wallet.transactionStatus, {
      hasText: status
    }).first()
    await assertContainsText(statusElement, status)
  }

  /**
   * Go back to previous page
   */
  async goBack() {
    await safeClick(this.backButton)
  }

  /**
   * Close wallet page (navigate away)
   */
  async close() {
    await safeClick(this.closeButton)
  }

  /**
   * Verify the wallet page is displayed
   */
  async verifyPage() {
    await this.page.waitForURL(/\/wallet/)
    await assertVisible(this.depositButton.first(), 'Deposit button should be visible')
  }
}
