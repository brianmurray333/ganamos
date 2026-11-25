// Satoshi Pet pricing constants (in sats)
export const PET_DEVICE_LIST_PRICE_SATS = 49000
export const PET_DEVICE_PREORDER_PRICE_SATS = 40000

// Whether new orders are pre-orders (and get pre-order pricing). Decided on the
// server only: createPetOrder reads this, the client never sends it.
// Set to false when pre-orders end.
export const PET_PREORDER_ACTIVE = true

/** Device price for a new order right now (server-decided via PET_PREORDER_ACTIVE). */
export function currentPetDevicePriceSats(): number {
  return PET_PREORDER_ACTIVE ? PET_DEVICE_PREORDER_PRICE_SATS : PET_DEVICE_LIST_PRICE_SATS
}

// Estimated ship date for pre-orders, e.g. "March 2027". Set by the owner.
// null = no date announced yet.
export const PREORDER_SHIP_ESTIMATE: string | null = null

/** One line shown next to the price, in the order summary, the email and the order page. */
export function preorderShipEstimateText(): string {
  return PREORDER_SHIP_ESTIMATE
    ? `Estimated ship: ${PREORDER_SHIP_ESTIMATE}`
    : "Pre-order — we'll email you a ship date before it ships"
}

// Flat US shipping, in sats. These are not pegged to USD: their dollar value
// moves with the BTC price.
export const SHIPPING_BASE_SATS = 5000
export const SHIPPING_AK_HI_SATS = 8000 // Alaska/Hawaii

// Lightning invoice lifetime. Must match the expiry createInvoice() sets in lib/lightning.ts.
export const PET_INVOICE_EXPIRY_SECONDS = 3600

export const SUPPORT_EMAIL = "support@ganamos.earth"

// Valid US state codes
export const VALID_US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
]
