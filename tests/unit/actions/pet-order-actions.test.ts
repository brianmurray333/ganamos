import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Satoshi Pet orders: the paid transition, the reconcile cron, access-token
 * gating of order details, validation, server-side pricing, order reuse,
 * rate limits and invoice renewal. Runs against the stateful in-memory
 * Supabase fake, with LND (checkInvoice/createInvoice) and Resend mocked.
 */

const h = vi.hoisted(() => ({ ip: '203.0.113.1', send: null as any }))

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Map([['x-forwarded-for', h.ip]])),
  cookies: vi.fn(),
}))

vi.mock('@/lib/lightning', () => ({
  checkInvoice: vi.fn(),
  createInvoice: vi.fn(),
}))

vi.mock('resend', () => {
  h.send = vi.fn(async () => ({ data: { id: 'email-1' }, error: null }))
  return { Resend: vi.fn().mockImplementation(() => ({ emails: { send: h.send } })) }
})

import {
  createPetOrder,
  checkOrderPaymentStatus,
  getOrderByNumber,
  renewPetOrderInvoice,
} from '@/app/actions/pet-order-actions'
import { reconcilePendingPetOrders, renderOrderConfirmationEmail, renderAdminOrderNotificationEmail } from '@/lib/pet-orders'
import { validatePetOrderShipping } from '@/lib/pet-order-validation'
import { checkInvoice, createInvoice } from '@/lib/lightning'
import { createFakeSupabase, type FakeSupabase } from '@/tests/unit/helpers/fake-supabase-db'
import {
  PET_DEVICE_PREORDER_PRICE_SATS,
  PET_PREORDER_ACTIVE,
  SHIPPING_BASE_SATS,
  currentPetDevicePriceSats,
} from '@/lib/pet-order-constants'

const HASH = 'a'.repeat(64)
const TOKEN = 'f'.repeat(64)
let ipCounter = 0

const settled = { success: true, settled: true, state: 'SETTLED', amountPaid: '45000' }
const open = { success: true, settled: false, state: 'OPEN', amountPaid: '0' }
const canceled = { success: true, settled: false, state: 'CANCELED', amountPaid: '0' }

function orderRow(overrides: Record<string, any> = {}) {
  const now = Date.now()
  return {
    id: 'order-1',
    order_number: 'SP-ABC234',
    access_token: TOKEN,
    email: 'buyer@example.com',
    full_name: 'Alice <b>Buyer</b>',
    address_line1: '1 Main St',
    address_line2: null,
    city: 'Austin',
    state: 'TX',
    postal_code: '78701',
    device_price_sats: 40000,
    shipping_price_sats: 5000,
    total_price_sats: 45000,
    payment_request: 'lnbc450u1fakeinvoice',
    payment_hash: HASH,
    payment_status: 'pending',
    order_status: 'pending',
    is_preorder: true,
    invoice_expires_at: new Date(now + 30 * 60_000).toISOString(),
    created_at: new Date(now - 30 * 60_000).toISOString(),
    ...overrides,
  }
}

const validShipping = {
  email: 'Buyer@Example.com ',
  fullName: ' Alice Buyer ',
  addressLine1: '1 Main St',
  city: 'Austin',
  state: 'tx',
  postalCode: '78701',
}

let fake: FakeSupabase

beforeEach(() => {
  h.ip = `203.0.113.${++ipCounter}`
  process.env.RESEND_API_KEY = 'test-resend'
  process.env.ADMIN_EMAIL = 'admin@example.com'
  h.send.mockClear()
  vi.mocked(checkInvoice).mockReset()
  vi.mocked(createInvoice).mockReset()
  fake = createFakeSupabase({ pet_orders: [], bitcoin_prices: [] }).install()
})

describe('paid transition (checkOrderPaymentStatus)', () => {
  it('marks a settled order paid and sends the two emails once', async () => {
    fake.tables.pet_orders.push(orderRow())
    vi.mocked(checkInvoice).mockResolvedValue(settled as any)

    const result = await checkOrderPaymentStatus(HASH)
    expect(result).toEqual({ success: true, paid: true, expired: false, orderNumber: 'SP-ABC234' })
    expect(result).not.toHaveProperty('email')
    expect(fake.row('pet_orders', 'order-1')).toMatchObject({ payment_status: 'paid', order_status: 'confirmed' })
    expect(h.send).toHaveBeenCalledTimes(2)

    // Polling again: already paid, no node call, no more emails
    vi.mocked(checkInvoice).mockClear()
    const again = await checkOrderPaymentStatus(HASH)
    expect(again.paid).toBe(true)
    expect(checkInvoice).not.toHaveBeenCalled()
    expect(h.send).toHaveBeenCalledTimes(2)
  })

  it('two concurrent checks that both saw "pending" send the emails only once', async () => {
    fake.tables.pet_orders.push(orderRow())
    vi.mocked(checkInvoice).mockResolvedValue(settled as any)
    fake.latency = fake.barrier(op => op.table === 'pet_orders' && op.op === 'update', 2)

    const [a, b] = await Promise.all([checkOrderPaymentStatus(HASH), checkOrderPaymentStatus(HASH)])
    expect(a.paid).toBe(true)
    expect(b.paid).toBe(true)
    expect(h.send).toHaveBeenCalledTimes(2) // one confirmation + one admin email
    const paidUpdates = fake.ops(op => op.op === 'update' && op.rowsAffected === 1)
    expect(paidUpdates).toHaveLength(1)
  })

  it('returns an error (not paid) and sends no email when the update fails', async () => {
    fake.tables.pet_orders.push(orderRow())
    vi.mocked(checkInvoice).mockResolvedValue(settled as any)
    fake.failOp = op => (op.op === 'update' ? { message: 'db down' } : null)

    const result = await checkOrderPaymentStatus(HASH)
    expect(result.success).toBe(false)
    expect(result.paid).toBeUndefined()
    expect(h.send).not.toHaveBeenCalled()
    expect(fake.row('pet_orders', 'order-1')!.payment_status).toBe('pending')
  })

  it('does not mark paid when the node reports an underpayment', async () => {
    fake.tables.pet_orders.push(orderRow())
    vi.mocked(checkInvoice).mockResolvedValue({ ...settled, amountPaid: '100' } as any)
    const result = await checkOrderPaymentStatus(HASH)
    expect(result.success).toBe(false)
    expect(fake.row('pet_orders', 'order-1')!.payment_status).toBe('pending')
    expect(h.send).not.toHaveBeenCalled()
  })

  it('reports an open invoice as unpaid and rejects malformed hashes', async () => {
    fake.tables.pet_orders.push(orderRow())
    vi.mocked(checkInvoice).mockResolvedValue(open as any)
    expect(await checkOrderPaymentStatus(HASH)).toEqual({ success: true, paid: false, expired: false, orderNumber: 'SP-ABC234' })
    expect((await checkOrderPaymentStatus('not-a-hash')).success).toBe(false)
  })
})

describe('reconcilePendingPetOrders (cron)', () => {
  it('marks settled orders paid, dead invoices expired, leaves open ones pending', async () => {
    const now = new Date()
    fake.tables.pet_orders.push(
      orderRow({ id: 'paid-1', order_number: 'SP-PAID22', payment_hash: '1'.repeat(64) }),
      orderRow({
        id: 'exp-1', order_number: 'SP-EXPD22', payment_hash: '2'.repeat(64),
        invoice_expires_at: new Date(now.getTime() - 5 * 60_000).toISOString(),
      }),
      orderRow({ id: 'open-1', order_number: 'SP-OPEN22', payment_hash: '3'.repeat(64) }),
      // Canceled by the node: expired even before our clock says so
      orderRow({ id: 'canc-1', order_number: 'SP-CANC22', payment_hash: '4'.repeat(64) }),
      // Expired just now but within the safety margin and still OPEN on the node: left pending
      orderRow({
        id: 'margin-1', order_number: 'SP-MRGN22', payment_hash: '5'.repeat(64),
        invoice_expires_at: new Date(now.getTime() - 5_000).toISOString(),
      }),
      // Outside the default window: not checked
      orderRow({
        id: 'old-1', order_number: 'SP-OLDD22', payment_hash: '6'.repeat(64),
        invoice_expires_at: new Date(now.getTime() - 5 * 3600_000).toISOString(),
      }),
    )
    vi.mocked(checkInvoice).mockImplementation(async (hash: string) => {
      if (hash === '1'.repeat(64)) return settled as any
      if (hash === '4'.repeat(64)) return canceled as any
      return open as any
    })

    const summary = await reconcilePendingPetOrders(fake.adminClient, { now })
    expect(summary).toEqual({ checked: 5, paid: 1, expired: 2, pending: 2, errors: 0 })
    expect(fake.row('pet_orders', 'paid-1')!.payment_status).toBe('paid')
    expect(fake.row('pet_orders', 'exp-1')!.payment_status).toBe('expired')
    expect(fake.row('pet_orders', 'canc-1')!.payment_status).toBe('expired')
    expect(fake.row('pet_orders', 'open-1')!.payment_status).toBe('pending')
    expect(fake.row('pet_orders', 'margin-1')!.payment_status).toBe('pending')
    expect(fake.row('pet_orders', 'old-1')!.payment_status).toBe('pending')
    expect(checkInvoice).not.toHaveBeenCalledWith('6'.repeat(64))
    expect(h.send).toHaveBeenCalledTimes(2)

    // A second run doesn't email again
    await reconcilePendingPetOrders(fake.adminClient, { now })
    expect(h.send).toHaveBeenCalledTimes(2)
  })

  it('records a settled payment even if the order was already marked expired', async () => {
    fake.tables.pet_orders.push(orderRow({ payment_status: 'expired' }))
    vi.mocked(checkInvoice).mockResolvedValue(settled as any)
    const result = await checkOrderPaymentStatus(HASH)
    expect(result.paid).toBe(true)
    expect(h.send).toHaveBeenCalledTimes(2)
  })

  it('counts node errors without changing the order', async () => {
    fake.tables.pet_orders.push(orderRow())
    vi.mocked(checkInvoice).mockResolvedValue({ success: false, error: 'down' } as any)
    const summary = await reconcilePendingPetOrders(fake.adminClient)
    expect(summary.errors).toBe(1)
    expect(fake.row('pet_orders', 'order-1')!.payment_status).toBe('pending')
  })
})

describe('getOrderByNumber access-token gating', () => {
  beforeEach(() => {
    fake.tables.pet_orders.push(orderRow())
  })

  it('without a token returns only non-identifying fields and a masked email', async () => {
    const result = await getOrderByNumber('sp-abc234')
    expect(result.success).toBe(true)
    expect(result.hasAccess).toBe(false)
    expect(result.order).toEqual({
      orderNumber: 'SP-ABC234',
      paymentStatus: 'pending',
      orderStatus: 'pending',
      totalPriceSats: 45000,
      createdAt: expect.any(String),
      isPreorder: true,
      city: 'Austin',
      state: 'TX',
      maskedEmail: 'b***@example.com',
    })
    const json = JSON.stringify(result)
    expect(json).not.toContain('buyer@example.com')
    expect(json).not.toContain('Main St')
    expect(json).not.toContain('Alice')
    expect(json).not.toContain('lnbc')
  })

  it('with a wrong token (same length or not) returns the public view', async () => {
    for (const t of ['e'.repeat(64), 'short', '', null]) {
      const result = await getOrderByNumber('SP-ABC234', t as any)
      expect(result.hasAccess).toBe(false)
      expect(result.order).not.toHaveProperty('email')
    }
  })

  it('with the right token returns full details and the invoice while unpaid', async () => {
    const result = await getOrderByNumber('SP-ABC234', TOKEN)
    expect(result.hasAccess).toBe(true)
    expect(result.order).toMatchObject({
      email: 'buyer@example.com',
      fullName: 'Alice <b>Buyer</b>',
      shippingAddress: { line1: '1 Main St', city: 'Austin', state: 'TX', postalCode: '78701' },
      paymentRequest: 'lnbc450u1fakeinvoice',
      paymentHash: HASH,
    })
  })

  it('rate limits lookups per IP', async () => {
    let last: any
    for (let i = 0; i < 31; i++) last = await getOrderByNumber('SP-ABC234')
    expect(last.success).toBe(false)
    expect(last.error).toMatch(/Too many/)
  })

  it('rejects malformed order numbers without a query', async () => {
    const result = await getOrderByNumber('SP-ABC234; drop table')
    expect(result.success).toBe(false)
    expect(fake.ops(op => op.table === 'pet_orders')).toHaveLength(0)
  })
})

describe('validation (shared by client and server)', () => {
  it('accepts 5-digit ZIP and ZIP+4, rejects others', () => {
    for (const zip of ['78701', '78701-1234']) {
      expect(validatePetOrderShipping({ ...validShipping, postalCode: zip }).ok).toBe(true)
    }
    for (const zip of ['abcde', '7870', '787011', '78701-12', '78701 1234']) {
      const r = validatePetOrderShipping({ ...validShipping, postalCode: zip })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.postalCode).toBeTruthy()
    }
  })

  it('trims, normalizes and caps lengths', () => {
    const r = validatePetOrderShipping(validShipping)
    expect(r).toEqual({
      ok: true,
      value: {
        email: 'buyer@example.com', fullName: 'Alice Buyer', addressLine1: '1 Main St',
        addressLine2: null, city: 'Austin', state: 'TX', postalCode: '78701',
      },
    })
    const long = validatePetOrderShipping({ ...validShipping, fullName: 'x'.repeat(101) })
    expect(long.ok).toBe(false)
    if (!long.ok) expect(long.errors.fullName).toMatch(/100 characters/)
    const blank = validatePetOrderShipping({ ...validShipping, city: '   ' })
    expect(blank.ok).toBe(false)
    const ctrl = validatePetOrderShipping({ ...validShipping, addressLine1: '1 Main\nSt' })
    expect(ctrl.ok).toBe(false)
    const st = validatePetOrderShipping({ ...validShipping, state: 'ZZ' })
    expect(st.ok).toBe(false)
  })

  it('createPetOrder rejects invalid input before touching the node or DB', async () => {
    const result = await createPetOrder({ ...validShipping, postalCode: 'abcde' })
    expect(result.success).toBe(false)
    expect(result.fieldErrors?.postalCode).toBeTruthy()
    expect(createInvoice).not.toHaveBeenCalled()
    expect(fake.tables.pet_orders).toHaveLength(0)
  })
})

describe('createPetOrder', () => {
  beforeEach(() => {
    // Model the column default: created_at DEFAULT NOW()
    fake.beforeOp = op => {
      if (op.table === 'pet_orders' && op.op === 'insert' && !op.payload.created_at) {
        op.payload.created_at = new Date().toISOString()
      }
    }
    let n = 0
    vi.mocked(createInvoice).mockImplementation(async () => {
      n++
      return { success: true, paymentRequest: `lnbcfake${n}`, rHash: String(n).repeat(64).slice(0, 64), addIndex: n } as any
    })
  })

  it('decides price and pre-order status on the server and ignores client isPreorder', async () => {
    const result = await createPetOrder({ ...validShipping, isPreorder: false, devicePriceSats: 1 } as any)
    expect(result.success).toBe(true)
    expect(result.orderNumber).toMatch(/^SP-[A-Z2-9]{6}$/)
    expect(result.accessToken).toMatch(/^[0-9a-f]{64}$/)

    const row = fake.tables.pet_orders[0]
    expect(row.is_preorder).toBe(PET_PREORDER_ACTIVE)
    expect(row.device_price_sats).toBe(currentPetDevicePriceSats())
    expect(row.device_price_sats).toBe(PET_DEVICE_PREORDER_PRICE_SATS)
    expect(row.total_price_sats).toBe(PET_DEVICE_PREORDER_PRICE_SATS + SHIPPING_BASE_SATS)
    expect(row.email).toBe('buyer@example.com')
    expect(row.full_name).toBe('Alice Buyer')
    expect(row.access_token).toBe(result.accessToken)
    expect(row.client_ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.client_ip_hash).not.toContain('203.0.113')
    expect(new Date(row.invoice_expires_at).getTime()).toBeGreaterThan(Date.now() + 59 * 60_000)

    // Invoice: server-computed amount, memo is the order number only (no buyer name)
    expect(createInvoice).toHaveBeenCalledWith(row.total_price_sats, `SATOSHI-PET-ORDER: ${row.order_number}`)
    expect(vi.mocked(createInvoice).mock.calls[0][1]).not.toContain('Alice')
  })

  it('reuses the open pending order for the same buyer and address', async () => {
    const first = await createPetOrder(validShipping)
    const second = await createPetOrder({ ...validShipping, email: 'buyer@example.com' })
    expect(second).toEqual(first)
    expect(createInvoice).toHaveBeenCalledTimes(1)
    expect(fake.tables.pet_orders).toHaveLength(1)

    // Different address: new order
    const third = await createPetOrder({ ...validShipping, addressLine2: 'Apt 2' })
    expect(third.orderNumber).not.toBe(first.orderNumber)
    expect(createInvoice).toHaveBeenCalledTimes(2)
  })

  it('does not reuse an order whose invoice is about to expire', async () => {
    const first = await createPetOrder(validShipping)
    fake.tables.pet_orders[0].invoice_expires_at = new Date(Date.now() + 60_000).toISOString()
    const second = await createPetOrder(validShipping)
    expect(second.orderNumber).not.toBe(first.orderNumber)
  })

  it('limits orders per email per hour (durable, DB-backed)', async () => {
    for (let i = 0; i < 5; i++) {
      h.ip = `198.51.100.${i}`
      const r = await createPetOrder({ ...validShipping, addressLine1: `${i} Main St` })
      expect(r.success).toBe(true)
    }
    h.ip = '198.51.100.99'
    const blocked = await createPetOrder({ ...validShipping, addressLine1: '99 Main St' })
    expect(blocked.success).toBe(false)
    expect(blocked.error).toMatch(/Too many orders/)
    expect(createInvoice).toHaveBeenCalledTimes(5)
  })

  it('limits orders per IP per hour (durable, DB-backed)', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await createPetOrder({ ...validShipping, email: `b${i}@example.com` })
      expect(r.success).toBe(true)
    }
    const blocked = await createPetOrder({ ...validShipping, email: 'b99@example.com' })
    expect(blocked.success).toBe(false)
    expect(createInvoice).toHaveBeenCalledTimes(10)
  })
})

describe('renewPetOrderInvoice', () => {
  beforeEach(() => {
    vi.mocked(createInvoice).mockResolvedValue({ success: true, paymentRequest: 'lnbcnew', rHash: 'b'.repeat(64) } as any)
  })

  it('replaces a dead invoice for the same amount', async () => {
    fake.tables.pet_orders.push(orderRow({
      payment_status: 'expired',
      invoice_expires_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    }))
    vi.mocked(checkInvoice).mockResolvedValue(canceled as any)
    const result = await renewPetOrderInvoice('SP-ABC234', TOKEN)
    expect(result).toMatchObject({ success: true, paid: false, paymentRequest: 'lnbcnew', paymentHash: 'b'.repeat(64) })
    expect(createInvoice).toHaveBeenCalledWith(45000, 'SATOSHI-PET-ORDER: SP-ABC234')
    expect(fake.row('pet_orders', 'order-1')).toMatchObject({ payment_status: 'pending', payment_hash: 'b'.repeat(64) })
  })

  it('records the payment instead if the old invoice was paid', async () => {
    fake.tables.pet_orders.push(orderRow({ payment_status: 'expired' }))
    vi.mocked(checkInvoice).mockResolvedValue(settled as any)
    const result = await renewPetOrderInvoice('SP-ABC234', TOKEN)
    expect(result).toEqual({ success: true, paid: true })
    expect(createInvoice).not.toHaveBeenCalled()
    expect(fake.row('pet_orders', 'order-1')!.payment_status).toBe('paid')
  })

  it('refuses while the invoice is still payable, for paid orders, and without the token', async () => {
    fake.tables.pet_orders.push(orderRow())
    vi.mocked(checkInvoice).mockResolvedValue(open as any)
    expect((await renewPetOrderInvoice('SP-ABC234', TOKEN)).success).toBe(false)
    expect((await renewPetOrderInvoice('SP-ABC234', 'e'.repeat(64))).error).toBe('Order not found')
    fake.tables.pet_orders[0].payment_status = 'paid'
    expect(await renewPetOrderInvoice('SP-ABC234', TOKEN)).toEqual({ success: true, paid: true })
    expect(createInvoice).not.toHaveBeenCalled()
  })
})

describe('order emails', () => {
  it('escape user fields and include address, ship estimate and the token link', () => {
    const order = orderRow({ full_name: '<script>x</script>', address_line1: '<a href="evil">1</a>' })
    const { html } = renderOrderConfirmationEmail(order)
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(html).not.toContain('<a href="evil">')
    expect(html).toContain(`https://satoshipet.com/order/SP-ABC234?t=${TOKEN}`)
    expect(html).toContain('https://ganamos.earth/auth/register')
    expect(html).toContain('pre-order')
    expect(html).toMatch(/ship date|Estimated ship/)
    expect(html).not.toContain('#ffffff !important')

    const admin = renderAdminOrderNotificationEmail(order).html
    expect(admin).not.toContain('<script>x</script>')
    expect(admin).not.toContain('<a href="evil">')
  })

  it('uses order wording (no pre-order or ship estimate) when it is not a pre-order', () => {
    const { html } = renderOrderConfirmationEmail(orderRow({ is_preorder: false }))
    expect(html).not.toMatch(/pre-order/i)
    expect(html).not.toMatch(/ship date|Estimated ship/)
  })
})
