/**
 * Shipping-form validation shared by the checkout form (client) and
 * createPetOrder (server), so both apply exactly the same rules.
 */
import { VALID_US_STATES } from "@/lib/pet-order-constants"

export const PET_ORDER_FIELD_LIMITS = {
  email: 254,
  fullName: 100,
  addressLine1: 120,
  addressLine2: 120,
  city: 100,
  state: 2,
  postalCode: 10,
} as const

export const US_ZIP_REGEX = /^\d{5}(-\d{4})?$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export type PetOrderField = keyof typeof PET_ORDER_FIELD_LIMITS

export interface PetOrderShippingInput {
  email: string
  fullName: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  postalCode: string
}

export interface NormalizedShipping {
  email: string
  fullName: string
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string
  postalCode: string
}

const LABELS: Record<PetOrderField, string> = {
  email: "Email",
  fullName: "Full name",
  addressLine1: "Address",
  addressLine2: "Apartment, suite, etc.",
  city: "City",
  state: "State",
  postalCode: "ZIP code",
}

/**
 * Trim, normalize and validate. Returns the normalized values, or a map of
 * field -> error message (only fields with errors are present).
 */
export function validatePetOrderShipping(input: Partial<PetOrderShippingInput>):
  | { ok: true; value: NormalizedShipping }
  | { ok: false; errors: Partial<Record<PetOrderField, string>> } {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  const raw: Record<PetOrderField, string> = {
    email: str(input.email).toLowerCase(),
    fullName: str(input.fullName),
    addressLine1: str(input.addressLine1),
    addressLine2: str(input.addressLine2),
    city: str(input.city),
    state: str(input.state).toUpperCase(),
    postalCode: str(input.postalCode),
  }
  const errors: Partial<Record<PetOrderField, string>> = {}

  for (const field of Object.keys(PET_ORDER_FIELD_LIMITS) as PetOrderField[]) {
    const v = raw[field]
    if (!v) {
      if (field !== "addressLine2") errors[field] = `${LABELS[field]} is required`
      continue
    }
    if (v.length > PET_ORDER_FIELD_LIMITS[field]) {
      errors[field] = `${LABELS[field]} must be ${PET_ORDER_FIELD_LIMITS[field]} characters or fewer`
    } else if (CONTROL_CHARS.test(v)) {
      errors[field] = `${LABELS[field]} contains invalid characters`
    }
  }

  if (!errors.email && raw.email && !EMAIL_REGEX.test(raw.email)) errors.email = "Enter a valid email address"
  if (!errors.state && raw.state && !VALID_US_STATES.includes(raw.state)) {
    errors.state = "We currently only ship within the United States"
  }
  if (!errors.postalCode && raw.postalCode && !US_ZIP_REGEX.test(raw.postalCode)) {
    errors.postalCode = "Enter a 5-digit ZIP code (or ZIP+4)"
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { ...raw, addressLine2: raw.addressLine2 || null },
  }
}
