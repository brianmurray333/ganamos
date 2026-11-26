import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createMiddlewareClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}))

import { middleware } from '@/middleware'

const req = (url: string) => new NextRequest(url, { headers: { host: new URL(url).host } })

describe('middleware on satoshipet.com', () => {
  it('lets the page reach its leaderboard and price APIs', async () => {
    for (const path of ['/api/leaderboard?game=flappy&best=1', '/api/bitcoin-price']) {
      const res = await middleware(req(`https://satoshipet.com${path}`))
      expect(res.headers.get('location')).toBeNull()
      expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    }
  })

  it('still sends other paths (including other APIs) to the landing page', async () => {
    for (const path of ['/wallet', '/api/game/rooms']) {
      const res = await middleware(req(`https://satoshipet.com${path}`))
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location')!).pathname).toBe('/')
    }
  })

  it('serves the landing page at the root', async () => {
    const res = await middleware(req('https://satoshipet.com/'))
    expect(res.headers.get('x-middleware-rewrite')).toContain('/satoshi-pet')
  })
})
