import type { Page, Locator } from '@playwright/test'
import { selectors } from '../selectors'
import { assertVisible, safeClick, waitForPageLoad, waitForElement, elementExists } from '../helpers/common.helper'

/**
 * Page Object for Deposit Page
 */
export class DepositPage {
  readonly page: Page
  
  // Header
  readonly title: Locator
  readonly backButton: Locator
  readonly closeButton: Locator
  
  // QR Code
  readonly qrCode: Locator
  readonly qrContainer: Locator
  
  // Invoice
  readonly invoiceTextarea: Locator
  readonly copyButton: Locator
  readonly copiedIcon: Locator
  
  // Amount
  readonly amountButton: Locator
  
  // Success state
  readonly successContainer: Locator
  readonly successCheckmark: Locator
  readonly successMessage: Locator
  readonly redirectMessage: Locator

  constructor(page: Page) {
    this.page = page
    
    this.title = page.locator(selectors.deposit.title)
    this.backButton = page.locator(selectors.deposit.backButton)
    this.closeButton = page.locator(selectors.deposit.closeButton)
    
    this.qrCode = page.locator(selectors.deposit.qrCode)
    this.qrContainer = page.locator(selectors.deposit.qrContainer)
    
    this.invoiceTextarea = page.locator(selectors.deposit.invoiceTextarea)
    this.copyButton = page.locator(selectors.deposit.copyButton)
    this.copiedIcon = page.locator(selectors.deposit.copiedIcon)
    
    this.amountButton = page.locator(selectors.deposit.amountButton)
    
    this.successContainer = page.locator(selectors.deposit.successContainer)
    this.successCheckmark = page.locator(selectors.deposit.successCheckmark)
    this.successMessage = page.locator(selectors.deposit.successMessage)
    this.redirectMessage = page.locator(selectors.deposit.redirectMessage)
  }

  /**
   * Navigate to the deposit page
   */
  async goto() {
    await this.page.goto('/wallet/deposit')
    await waitForPageLoad(this.page)
  }

  /**
   * Wait for the page to be fully loaded
   * The deposit page auto-generates an invoice on load
   */
  async waitForLoad() {
    await this.page.waitForURL(/\/wallet\/deposit/)
    // Wait for title to be visible
    await waitForElement(this.title)
  }

  /**
   * Wait for invoice to be generated
   * The page auto-generates an invoice, so we need to wait for it
   */
  async waitForInvoice(timeout: number = 10000) {
    await waitForElement(this.invoiceTextarea, timeout)
    // Also wait for QR code
    await waitForElement(this.qrCode.first(), timeout)
  }

  /**
   * Get the invoice text
   */
  async getInvoice(): Promise<string> {
    const invoice = await this.invoiceTextarea.textContent()
    return invoice || ''
  }

  /**
   * Copy the invoice to clipboard
   */
  async copyInvoice() {
    await safeClick(this.copyButton)
    // Wait for copied icon to appear
    await waitForElement(this.copiedIcon)
  }

  /**
   * Click the amount button to set/change amount
   */
  async clickAmountButton() {
    await safeClick(this.amountButton)
  }

  /**
   * Simulate a payment being received
   * This triggers the success state
   * Note: In the real app, this would be done via the LND/payment system
   */
  async simulatePayment() {
    // The deposit page has auto-checking for payment status
    // We can trigger the simulation by calling the mock function if available
    // Or we can directly interact with the DB to mark payment as received
    
    // For now, we'll use the browser console to trigger simulation
    await this.page.evaluate(() => {
      // Try to find and click a simulate button if it exists (for dev mode)
      const simulateBtn = document.querySelector('button:has-text("Simulate")') as HTMLButtonElement
      if (simulateBtn) {
        simulateBtn.click()
      }
    })
  }

  /**
   * Wait for payment success to be displayed
   */
  async waitForSuccess(timeout: number = 30000) {
    await waitForElement(this.successContainer, timeout)
    await waitForElement(this.successCheckmark, timeout)
  }

  /**
   * Verify success state is displayed
   */
  async verifySuccess() {
    await assertVisible(this.successContainer, 'Success container should be visible')
    await assertVisible(this.successCheckmark, 'Success checkmark should be visible')
    await assertVisible(this.successMessage, 'Success message should be visible')
  }

  /**
   * Check if QR code is displayed
   */
  async isQRCodeDisplayed(): Promise<boolean> {
    return await elementExists(this.qrCode.first())
  }

  /**
   * Check if invoice is displayed
   */
  async isInvoiceDisplayed(): Promise<boolean> {
    return await elementExists(this.invoiceTextarea)
  }

  /**
   * Go back to wallet page
   */
  async goBack() {
    await safeClick(this.backButton)
    await this.page.waitForURL(/\/wallet/, { waitUntil: 'domcontentloaded' })
  }

  /**
   * Close deposit page (go to wallet)
   */
  async close() {
    await safeClick(this.closeButton)
    await this.page.waitForURL(/\/wallet/, { waitUntil: 'domcontentloaded' })
  }

  /**
   * Verify the deposit page is displayed
   */
  async verifyPage() {
    await this.page.waitForURL(/\/wallet\/deposit/)
    await assertVisible(this.title, 'Deposit title should be visible')
  }

  /**
   * Complete the full deposit flow with auto-generated invoice
   */
  async completeDepositFlow() {
    // Wait for invoice to be auto-generated
    await this.waitForInvoice()
    
    // Verify invoice and QR are displayed
    const hasInvoice = await this.isInvoiceDisplayed()
    const hasQR = await this.isQRCodeDisplayed()
    
    if (!hasInvoice || !hasQR) {
      throw new Error('Invoice or QR code not generated')
    }
    
    // In a real scenario, payment would be made externally
    // For testing, we'll simulate it
    await this.simulatePayment()
    
    // Wait for success
    await this.waitForSuccess()
  }
}
