import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/pet-orders', () => ({
  reconcilePendingPetOrders: vi.fn(async () => ({ checked: 0, paid: 0, expired: 0, pending: 0, errors: 0 })),
}))

import { GET } from '@/app/api/cron/reconcile-pet-orders/route'
import { reconcilePendingPetOrders } from '@/lib/pet-orders'

const req = (headers: Record<string, string> = {}, query = '') =>
  new NextRequest(`http://localhost/api/cron/reconcile-pet-orders${query}`, { headers })

describe('GET /api/cron/reconcile-pet-orders', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret'
    vi.mocked(reconcilePendingPetOrders).mockClear()
  })

  it('rejects requests without the cron secret', async () => {
    const cases: Record<string, string>[] = [{}, { authorization: 'Bearer wrong' }, { 'x-vercel-cron': '1' }]
    for (const headers of cases) {
      const res = await GET(req(headers))
      expect(res.status).toBe(401)
    }
    expect(reconcilePendingPetOrders).not.toHaveBeenCalled()
  })

  it('fails closed when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req({ authorization: 'Bearer ' }))
    expect(res.status).toBe(401)
    expect(reconcilePendingPetOrders).not.toHaveBeenCalled()
  })

  it('runs the reconcile with the default window when authorized', async () => {
    const res = await GET(req({ authorization: 'Bearer test-cron-secret' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, checked: 0 })
    expect(reconcilePendingPetOrders).toHaveBeenCalledWith(expect.anything(), { expiredWithinHours: 1 })
  })

  it('accepts a wider sweep window from an operator, capped', async () => {
    await GET(req({ authorization: 'Bearer test-cron-secret' }, '?expiredWithinHours=720'))
    expect(reconcilePendingPetOrders).toHaveBeenLastCalledWith(expect.anything(), { expiredWithinHours: 720 })
    await GET(req({ authorization: 'Bearer test-cron-secret' }, '?expiredWithinHours=999999'))
    expect(reconcilePendingPetOrders).toHaveBeenLastCalledWith(expect.anything(), { expiredWithinHours: 2160 })
  })
})
