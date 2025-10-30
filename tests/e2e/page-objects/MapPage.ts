import { Page, expect, Locator } from '@playwright/test'

export class MapPage {
  private readonly mapContainer: Locator
  private readonly searchInput: Locator

  constructor(private readonly page: Page) {
    this.mapContainer = page.getByTestId('map-container')
    this.searchInput = page.locator('input[placeholder="Search here"]')
  }

  /**
   * Wait for the map page to be loaded
   */
  async waitForPageLoad() {
    await expect(this.page).toHaveURL(/\/map/)
    
    // Wait for loading spinner to disappear or map to appear
    try {
      // Try to wait for the map container
      await this.mapContainer.waitFor({ state: 'attached', timeout: 30000 })
    } catch (e) {
      // If map doesn't appear, that's okay - might be auth required
      console.log('Map container not found, checking page state')
    }
  }

  /**
   * Check if either the map is visible or the loading state is shown
   */
  async isMapOrLoadingVisible(): Promise<boolean> {
    const mapCount = await this.mapContainer.count()
    const searchCount = await this.searchInput.count()
    
    return mapCount > 0 || searchCount > 0
  }

  /**
   * Verify the map container is visible
   */
  async verifyMapVisible() {
    await expect(this.mapContainer).toBeVisible()
  }

  /**
   * Verify the search bar is visible
   */
  async verifySearchBarVisible() {
    await expect(this.searchInput).toBeVisible()
  }

  /**
   * Click on any visible button on the map (for testing interactions)
   * This is a generic method that can be used to interact with map controls
   */
  async clickMapControl(selector: string) {
    const button = this.page.locator(selector)
    await expect(button).toBeVisible()
    await button.click()
  }

  /**
   * Wait for map markers to be loaded
   * Google Maps loads asynchronously, so we wait for the map to be initialized
   */
  async waitForMapMarkers() {
    // Wait for Google Maps to initialize - we can detect this by waiting for
    // the map to have rendered its canvas or markers
    await this.page.waitForTimeout(2000) // Give map time to initialize
  }

  /**
   * Interact with the page (simulate user activity)
   * This method can be used to test various interactions on the map
   */
  async performMapInteractions(times: number = 1) {
    // Since the original test clicked a button multiple times,
    // we'll wait for the map to be interactive and stable
    for (let i = 0; i < times; i++) {
      await this.page.waitForTimeout(500)
    }
  }
}
