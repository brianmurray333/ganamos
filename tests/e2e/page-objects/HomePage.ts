import { Page, expect } from '@playwright/test'

export class HomePage {
  constructor(private readonly page: Page) {}

  /**
   * Navigate to the homepage
   */
  async goto() {
    await this.page.goto('/')
    // Wait for navigation to complete
    await this.page.waitForLoadState('domcontentloaded')
  }

  /**
   * Click the "Earn Bitcoin" button to navigate to the map page
   */
  async navigateToMap() {
    const mapLink = this.page.getByTestId('navigate-to-map')
    await expect(mapLink).toBeVisible({ timeout: 15000 })
    await mapLink.click()
  }

  /**
   * Verify the homepage has loaded successfully
   */
  async verifyPageLoaded() {
    // Wait for the page to be loaded by checking for a key element
    // The button might take time to appear due to auth loading
    await this.page.waitForLoadState('networkidle')
    
    // Verify the Earn Bitcoin button is present
    await expect(this.page.getByTestId('navigate-to-map')).toBeVisible({ timeout: 15000 })
  }
}
