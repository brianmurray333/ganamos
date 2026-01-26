/**
 * Single Source of Truth for E2E Test Selectors
 * 
 * Priority: data-testid → semantic → text selectors
 * Update once, apply everywhere.
 */

export const selectors = {
  // Home Page
  home: {
    loginLink: '[data-testid="login-link"]',
    signUpLink: '[data-testid="signup-link"]',
    earnBitcoinButton: '[data-testid="earn-bitcoin-link"]',
  },

  // Auth Page
  auth: {
    // Login buttons
    googleSignInButton: '[data-testid="google-signin-button"]',
    emailSignInButton: '[data-testid="email-signin-button"]',
    phoneSignInButton: '[data-testid="phone-signin-button"]',
    mockLoginButton: '[data-testid="mock-login-button"]',

    // Email form fields
    emailInput: '[data-testid="email-input"]',
    passwordInput: '[data-testid="password-input"]',
    submitButton: '[data-testid="email-submit-button"]',

    // Navigation
    signUpLink: 'a[href="/auth/register"]',
    forgotPasswordLink: 'a[href="/auth/forgot-password"]',
  },

  // Dashboard Page
  dashboard: {
    // Navigation (bottom nav)
    walletLink: '[data-testid="nav-wallet-link"]',
    profileLink: '[data-testid="nav-profile-link"]',
    mapLink: '[data-testid="nav-map-button"]',

    // Posts
    postCard: '[class*="post-card"]', // Generic, may need refinement

    // User menu/avatar
    userAvatar: '[class*="avatar"]',

    // Filters
    filterButton: 'button:has-text("Filter")',
  },

  // Wallet Page
  wallet: {
    // Action buttons
    depositButton: '[data-testid="deposit-button"]',
    withdrawButton: '[data-testid="withdraw-button"]',

    // Balance display
    balanceDisplay: '[data-testid="wallet-balance"]',
    
    // Transaction history
    transactionList: '[class*="transaction"]',
    transactionItem: '[class*="transaction"]:has(p.text-xs.text-muted-foreground)',
    transactionStatus: 'p.text-xs.text-muted-foreground',
    
    // Header/Navigation
    backButton: 'button:has(svg[class*="ArrowLeft"])',
    closeButton: 'button:has(svg[class*="X"])',
  },

  // Deposit Page
  deposit: {
    // Header
    title: 'h1:has-text("Receive Bitcoin")',
    backButton: 'button:first-of-type', // First button in header (back arrow)
    closeButton: 'button:last-of-type', // Last button in header (X button)
    
    // QR Code
    qrCode: 'canvas, svg', // QR code element
    qrContainer: 'div.bg-white:has(canvas), div.bg-white:has(svg)',
    
    // Invoice - displayed in a div with font-mono class
    invoiceTextarea: 'div.font-mono',
    copyButton: 'button[class*="shrink-0"]', // Copy button next to textarea
    copiedIcon: 'svg',
    
    // Amount input
    amountButton: 'button:has-text("Add an amount"), button:has-text("sats")',
    
    // Success state
    successContainer: 'div[class*="bg-green"]',
    successCheckmark: 'svg',
    successMessage: 'text=/Payment Received/i',
    redirectMessage: 'text=/Redirecting to your profile/i',
  },

  // Profile Page
  profile: {
    // User info
    userName: '[class*="font-semibold"]',
    userAvatar: 'img[alt*="account"]',
    balanceDisplay: 'text=/\\d+\\s*sats/',
    
    // Tabs
    activityTab: 'button[role="tab"]:has-text("Activity")',
    postsTab: 'button[role="tab"]:has-text("Posts")',
    
    // Navigation
    walletLink: 'a[href="/wallet"]',
    settingsButton: 'button:has-text("Settings")',
    
    // Menu
    signOutButton: 'button:has-text("Sign out")',
  },

  // Common Elements
  common: {
    loadingSpinner: '[class*="spinner"], [class*="animate-spin"]',
    toast: '[class*="toast"]',
    errorAlert: '[class*="alert"][class*="destructive"]',
    successMessage: '[class*="success"], [class*="green"]',
  },
} as const

// Helper function to get selector with optional data-testid fallback
export function getSelector(path: string, testId?: string): string {
  if (testId) {
    return `[data-testid="${testId}"]`
  }
  
  const keys = path.split('.')
  let current: any = selectors
  
  for (const key of keys) {
    current = current[key]
    if (!current) {
      throw new Error(`Selector path not found: ${path}`)
    }
  }
  
  return current
}
