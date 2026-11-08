/**
 * Cron / admin-automation authorization (lib/cron-auth.ts) and the routes that use it.
 *
 * Only `Authorization: Bearer ${CRON_SECRET}` authorizes. `x-vercel-cron` can be sent by
 * anyone and Vercel adds `x-vercel-id` to every request, so neither is proof. With
 * CRON_SECRET unset every request is rejected (fail closed).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/lightning', () => ({ lndRequest: vi.fn() }))
vi.mock('@/lib/daily-summary', () => ({
  sendDailySummaryEmail: vi.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
  sendPRSummaryToSphinx: vi.fn().mockResolvedValue({ success: true, prCount: 0 }),
}))
vi.mock('@/lib/transaction-emails', () => ({
  sendPostExpiryWarningEmail: vi.fn(),
  sendPostExpiredConfirmationEmail: vi.fn(),
  sendPostExpiredFixerEmail: vi.fn(),
}))
// Any DB access means the request got past auth; make it observable and harmless.
const createClientSpy = vi.fn(() => {
  throw new Error('DB reached: request was not rejected by auth')
})
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args: any[]) => createClientSpy(...args) }))

import { isAuthorizedCronRequest } from '@/lib/cron-auth'
import { lndRequest } from '@/lib/lightning'
import { sendDailySummaryEmail } from '@/lib/daily-summary'
import { GET as nodeBalanceGET } from '@/app/api/admin/node-balance/route'
import { GET as checkEnvGET } from '@/app/api/admin/check-env/route'
import { GET as dailySummaryGET } from '@/app/api/admin/daily-summary/route'
import { GET as expirePostsGET } from '@/app/api/cron/expire-posts/route'
import { GET as bitcoinPriceGET } from '@/app/api/cron/update-bitcoin-price/route'

const SECRET = 'unit-test-cron-secret'

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost:3457/api/cron/anything', { method: 'GET', headers })

describe('isAuthorizedCronRequest', () => {
  let saved: string | undefined
  beforeEach(() => {
    saved = process.env.CRON_SECRET
    process.env.CRON_SECRET = SECRET
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = saved
  })

  it('accepts the correct Bearer secret', () => {
    expect(isAuthorizedCronRequest(req({ authorization: `Bearer ${SECRET}` }))).toBe(true)
  })

  it('rejects a missing Authorization header', () => {
    expect(isAuthorizedCronRequest(req())).toBe(false)
  })

  it.each([
    ['wrong secret', 'Bearer not-the-secret'],
    ['secret without scheme', SECRET],
    ['wrong scheme', `Basic ${SECRET}`],
    ['secret prefix', `Bearer ${SECRET.slice(0, -1)}`],
    ['secret with suffix', `Bearer ${SECRET}x`],
    ['empty bearer', 'Bearer '],
  ])('rejects %s', (_label, authorization) => {
    expect(isAuthorizedCronRequest(req({ authorization }))).toBe(false)
  })

  it('rejects a spoofed x-vercel-cron header', () => {
    expect(isAuthorizedCronRequest(req({ 'x-vercel-cron': '1' }))).toBe(false)
  })

  it('rejects an x-vercel-id header', () => {
    expect(isAuthorizedCronRequest(req({ 'x-vercel-id': 'iad1::abc' }))).toBe(false)
  })

  it('fails closed when CRON_SECRET is unset', () => {
    delete process.env.CRON_SECRET
    expect(isAuthorizedCronRequest(req())).toBe(false)
    expect(isAuthorizedCronRequest(req({ authorization: 'Bearer undefined' }))).toBe(false)
    expect(isAuthorizedCronRequest(req({ authorization: 'Bearer ' }))).toBe(false)
    expect(isAuthorizedCronRequest(req({ 'x-vercel-cron': '1' }))).toBe(false)
  })

  it('fails closed when CRON_SECRET is an empty string', () => {
    process.env.CRON_SECRET = ''
    expect(isAuthorizedCronRequest(req({ authorization: 'Bearer ' }))).toBe(false)
  })
})

describe('cron/admin routes reject requests without the Bearer secret', () => {
  const routes: Array<[string, (r: NextRequest) => Promise<Response>]> = [
    ['GET /api/admin/node-balance', nodeBalanceGET],
    ['GET /api/admin/check-env', checkEnvGET],
    ['GET /api/admin/daily-summary', dailySummaryGET],
    ['GET /api/cron/expire-posts', expirePostsGET],
    ['GET /api/cron/update-bitcoin-price', bitcoinPriceGET],
  ]

  let saved: string | undefined
  let fetchSpy: ReturnType<typeof vi.fn>
  beforeEach(() => {
    saved = process.env.CRON_SECRET
    process.env.CRON_SECRET = SECRET
    fetchSpy = vi.fn().mockRejectedValue(new Error('network reached: request was not rejected by auth'))
    vi.stubGlobal('fetch', fetchSpy)
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = saved
    vi.unstubAllGlobals()
  })

  const expectNoSideEffects = () => {
    expect(lndRequest).not.toHaveBeenCalled()
    expect(sendDailySummaryEmail).not.toHaveBeenCalled()
    expect(createClientSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  }

  describe.each(routes)('%s', (_name, GET) => {
    it.each([
      ['no headers', {}],
      ['spoofed x-vercel-cron', { 'x-vercel-cron': '1' }],
      ['x-vercel-id', { 'x-vercel-id': 'iad1::abc' }],
      ['wrong Bearer secret', { authorization: 'Bearer wrong' }],
    ])('returns 401 for %s', async (_label, headers) => {
      const response = await GET(req(headers as Record<string, string>))
      expect(response.status).toBe(401)
      expectNoSideEffects()
    })

    it('returns 401 when CRON_SECRET is unset, even with "Bearer undefined"', async () => {
      delete process.env.CRON_SECRET
      const response = await GET(req({ authorization: 'Bearer undefined' }))
      expect(response.status).toBe(401)
      expectNoSideEffects()
    })

    it('gets past auth with the correct Bearer secret', async () => {
      const response = await GET(req({ authorization: `Bearer ${SECRET}` }))
      // Downstream may fail (mocks are deliberately inert), but not with 401.
      expect(response.status).not.toBe(401)
    })
  })
})
