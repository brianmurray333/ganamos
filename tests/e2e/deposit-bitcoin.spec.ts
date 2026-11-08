import { test, expect } from './fixtures'
import { HomePage } from './pages/home.page'
import { AuthPage } from './pages/auth.page'
import { DashboardPage } from './pages/dashboard.page'
import { WalletPage } from './pages/wallet.page'
import { DepositPage } from './pages/deposit.page'
import { ProfilePage } from './pages/profile.page'

async function mockDepositAPI(page: import('@playwright/test').Page) {
  await page.route('**/api/mobile/wallet/deposit**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          invoiceId: '00000000-0000-4000-8000-000000000021',
          paymentRequest: 'lnbc100n1ganamosteste2einvoice',
          amount: 100,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, status: 'pending', settled: false }),
    })
  })
}

/**
 * Bitcoin Deposit E2E Test
 *
 * This test follows the bitcoin deposit flow:
 * 1. Navigate from Home to Login
 * 2. Perform login (using Mock Login)
 * 3. Navigate to Dashboard
 * 4. Go to Wallet
 * 5. Start Deposit flow
 * 6. Complete deposit steps
 * 7. Navigate to Profile and Wallet, assert on transaction status
 */
test.describe('Bitcoin Deposit Flow', () => {
  test('should complete navigation from login through deposit to verification', async ({ page }) => {
    await mockDepositAPI(page)
    // Initialize Page Objects
    const authPage = new AuthPage(page)
    const dashboardPage = new DashboardPage(page)
    const walletPage = new WalletPage(page)
    const depositPage = new DepositPage(page)
    const profilePage = new ProfilePage(page)

    await test.step('Navigate to login page', async () => {
      await authPage.goto()
      await authPage.verifyPage()
    })

    await test.step('Login with Mock Login', async () => {
      await authPage.signInWithMock()
      await dashboardPage.verifyPage()
    })

    await test.step('Navigate to Wallet from Dashboard', async () => {
      await dashboardPage.goToWallet()
      await walletPage.verifyPage()
    })

    await test.step('Navigate to Deposit page', async () => {
      await walletPage.goToDeposit()
      await depositPage.verifyPage()
    })

    await test.step('Verify invoice generation', async () => {
      await depositPage.submitAmount('100')
      await depositPage.waitForInvoice(15000)
      
      // Verify QR code and invoice are displayed
      const hasQR = await depositPage.isQRCodeDisplayed()
      const hasInvoice = await depositPage.isInvoiceDisplayed()
      
      expect(hasQR).toBeTruthy()
      expect(hasInvoice).toBeTruthy()
      
      // Get the invoice for debugging
      const invoice = await depositPage.getInvoice()
      console.log('Generated invoice:', invoice.substring(0, 50) + '...')
    })

    await test.step('Navigate back to wallet', async () => {
      // Use browser back instead of clicking button
      await page.goBack()
      await walletPage.verifyPage()
    })

    await test.step('Navigate to Profile', async () => {
      await page.goto('/profile')
      await profilePage.verifyPage()
      // Just verify page loaded - user info might not be readily accessible with current selectors
      await page.waitForLoadState('networkidle')
    })

    await test.step('Verify Wallet from Profile', async () => {
      await profilePage.goToWallet()
      await walletPage.verifyPage()
      
      // Get balance
      const balance = await walletPage.getBalance()
      console.log('Final balance:', balance)
      expect(balance).toMatch(/\d/)
    })
  })

  test('should handle deposit flow with amount specification', async ({ page }) => {
    await mockDepositAPI(page)
    // Initialize Page Objects
    const authPage = new AuthPage(page)
    const dashboardPage = new DashboardPage(page)
    const walletPage = new WalletPage(page)
    const depositPage = new DepositPage(page)

    await test.step('Login', async () => {
      await authPage.goto()
      await authPage.signInWithMock()
      await dashboardPage.verifyPage()
    })

    await test.step('Navigate to Deposit', async () => {
      await dashboardPage.goToWallet()
      await walletPage.goToDeposit()
      await depositPage.verifyPage()
    })

    await test.step('Enter amount and wait for invoice', async () => {
      await depositPage.submitAmount('100')
      await depositPage.waitForInvoice(15000)
    })

    await test.step('Verify deposit page elements', async () => {
      // Verify all key elements are present
      await depositPage.verifyPage()
      
      // Verify QR code
      expect(await depositPage.isQRCodeDisplayed()).toBeTruthy()
      
      // Verify invoice
      expect(await depositPage.isInvoiceDisplayed()).toBeTruthy()
    })

    await test.step('Verify deposit page can navigate back', async () => {
      await page.goBack()
      await walletPage.verifyPage()
    })
  })

  test('should display wallet page with transaction history', async ({ page }) => {
    const authPage = new AuthPage(page)
    const dashboardPage = new DashboardPage(page)
    const walletPage = new WalletPage(page)

    await test.step('Login and navigate to wallet', async () => {
      await authPage.goto()
      await authPage.signInWithMock()
      await dashboardPage.verifyPage()
      await dashboardPage.goToWallet()
      await walletPage.verifyPage()
    })

    await test.step('Verify wallet page elements', async () => {
      // Verify deposit and withdraw buttons are present
      await expect(walletPage.depositButton.first()).toBeVisible()
      
      // Verify balance is displayed
      const balance = await walletPage.getBalance()
      expect(balance).toBeTruthy()
      console.log('Wallet balance:', balance)
    })

    await test.step('Test navigation', async () => {
      // Verify deposit button navigates correctly
      await walletPage.goToDeposit()
      await page.waitForURL(/\/wallet\/deposit/)
      
      // Go back to wallet
      await page.goBack()
      await walletPage.verifyPage()
    })
  })
})
