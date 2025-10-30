import { test, expect } from '@playwright/test'
import { HomePage } from './page-objects/HomePage'
import { MapPage } from './page-objects/MapPage'

test.describe('User Journey: Homepage to Map', () => {
  // Clear auth state before each test to ensure consistent behavior
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies()
    // Clear localStorage by navigating to the site first
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
  })

  test('should navigate from homepage to map and interact with map interface', async ({ page }) => {
    // Initialize page objects
    const homePage = new HomePage(page)
    const mapPage = new MapPage(page)

    // Step 1: Navigate to homepage
    await homePage.goto()
    
    // Step 2: Click on "Earn Bitcoin" to navigate to map
    // Wait a bit for the auth check to complete and landing page to show
    await page.waitForTimeout(4000)
    await homePage.navigateToMap()

    // Step 3: Wait for map page to load
    await mapPage.waitForPageLoad()

    // Step 4: Wait for map to fully initialize (Google Maps loads async)
    await mapPage.waitForMapMarkers()

    // Step 5: Verify we're on the map page
    await expect(page).toHaveURL(/\/map/)
    
    // Step 6: Verify page has loaded by checking for common elements
    const isVisible = await mapPage.isMapOrLoadingVisible()
    expect(isVisible).toBeTruthy()
  })

  test('should load map page directly without authentication', async ({ page }) => {
    const mapPage = new MapPage(page)

    // Navigate directly to map page
    await page.goto('/map')
    
    // Wait for map to load
    await mapPage.waitForPageLoad()
    
    // Wait for map initialization
    await mapPage.waitForMapMarkers()
    
    // Verify we're on map page
    await expect(page).toHaveURL(/\/map/)
    
    // Verify page has loaded
    const isVisible = await mapPage.isMapOrLoadingVisible()
    expect(isVisible).toBeTruthy()
  })
})
