import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Common assertion helpers for E2E tests
 */

export async function assertVisible(locator: Locator, message?: string) {
  await expect(locator, message).toBeVisible()
}

export async function assertHidden(locator: Locator, message?: string) {
  await expect(locator, message).toBeHidden()
}

export async function assertText(locator: Locator, text: string | RegExp, message?: string) {
  await expect(locator, message).toHaveText(text)
}

export async function assertContainsText(locator: Locator, text: string | RegExp, message?: string) {
  await expect(locator, message).toContainText(text)
}

export async function assertURL(page: Page, url: string | RegExp, message?: string) {
  await expect(page, message).toHaveURL(url)
}

export async function assertCount(locator: Locator, count: number, message?: string) {
  await expect(locator, message).toHaveCount(count)
}

/**
 * Wait for element to be visible
 */
export async function waitForElement(locator: Locator, timeout?: number) {
  await locator.waitFor({ state: 'visible', timeout })
}

/**
 * Wait for navigation to complete
 */
export async function waitForNavigation(page: Page, url: string | RegExp, timeout?: number) {
  await page.waitForURL(url, { timeout, waitUntil: 'domcontentloaded' })
}

/**
 * Wait for page to be loaded
 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('domcontentloaded')
  await waitForLoadingComplete(page)
}

/**
 * Retry an action until it succeeds or times out
 */
export async function retryAction<T>(
  action: () => Promise<T>,
  options: {
    maxAttempts?: number
    delayMs?: number
    errorMessage?: string
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, errorMessage = 'Action failed after retries' } = options
  
  let lastError: Error | undefined
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action()
    } catch (error) {
      lastError = error as Error
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }
  
  throw new Error(`${errorMessage}: ${lastError?.message}`)
}

/**
 * Check if element exists without throwing
 */
export async function elementExists(locator: Locator): Promise<boolean> {
  try {
    await locator.waitFor({ state: 'attached', timeout: 1000 })
    return true
  } catch {
    return false
  }
}

/**
 * Safe click that waits for element to be ready
 */
export async function safeClick(locator: Locator) {
  await locator.waitFor({ state: 'visible' })
  await locator.click()
}

/**
 * Fill input with clearing first
 */
export async function fillInput(locator: Locator, value: string) {
  await locator.clear()
  await locator.fill(value)
}

/**
 * Wait for loading spinner to disappear
 */
export async function waitForLoadingComplete(page: Page, selector: string = '[class*="spinner"], [class*="animate-spin"]') {
  const spinner = page.locator(selector).first()
  if (await elementExists(spinner)) {
    await spinner.waitFor({ state: 'hidden', timeout: 30000 })
  }
}

/**
 * Take a screenshot with a descriptive name
 */
export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true })
}
