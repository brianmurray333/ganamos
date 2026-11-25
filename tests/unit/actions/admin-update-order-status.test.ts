import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.hoisted(() => {
  process.env.ADMIN_EMAIL = 'admin@example.com'
})

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
  headers: vi.fn(() => new Map()),
}))

import { updateOrderStatus } from '@/app/actions/admin-actions'
import { createFakeSupabase, type FakeSupabase } from '@/tests/unit/helpers/fake-supabase-db'

let fake: FakeSupabase

beforeEach(() => {
  fake = createFakeSupabase({
    pet_orders: [
      { id: 'paid', payment_status: 'paid', order_status: 'confirmed', status: 'pending' },
      { id: 'unpaid', payment_status: 'pending', order_status: 'pending', status: 'pending' },
      { id: 'expired', payment_status: 'expired', order_status: 'pending', status: 'pending' },
    ],
  }).install()
  fake.user = { id: 'admin-user', email: 'admin@example.com' }
})

describe('updateOrderStatus (admin)', () => {
  it('ships a paid order, writing order_status (not the legacy status column)', async () => {
    const result = await updateOrderStatus('paid', 'shipped', '1Z999')
    expect(result).toEqual({ success: true })
    expect(fake.row('pet_orders', 'paid')).toMatchObject({ order_status: 'shipped', tracking_number: '1Z999', status: 'pending' })
    expect(fake.row('pet_orders', 'paid')!.shipped_at).toBeTruthy()
  })

  it('refuses shipped/delivered for unpaid or expired orders', async () => {
    for (const id of ['unpaid', 'expired']) {
      for (const status of ['shipped', 'delivered']) {
        const result = await updateOrderStatus(id, status)
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/not paid/)
      }
      expect(fake.row('pet_orders', id)!.order_status).toBe('pending')
      expect(fake.row('pet_orders', id)!.shipped_at).toBeUndefined()
    }
  })

  it('allows non-shipping states on unpaid orders, rejects unknown statuses', async () => {
    expect(await updateOrderStatus('unpaid', 'cancelled')).toEqual({ success: true })
    expect(fake.row('pet_orders', 'unpaid')!.order_status).toBe('cancelled')
    expect((await updateOrderStatus('paid', 'refunded')).error).toBe('Invalid order status')
  })

  it('requires the admin', async () => {
    fake.user = { id: 'someone', email: 'someone@example.com' }
    expect(await updateOrderStatus('paid', 'shipped')).toEqual({ success: false, error: 'Unauthorized' })
    expect(fake.row('pet_orders', 'paid')!.order_status).toBe('confirmed')
  })
})
