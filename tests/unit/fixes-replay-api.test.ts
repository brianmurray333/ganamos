import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/l402', () => ({
  createL402Challenge: vi.fn(),
  verifyL402Token: vi.fn(),
  parseL402Header: vi.fn(),
}))

vi.mock('@/app/actions/post-actions', () => ({
  submitAnonymousFixForReviewAction: vi.fn(),
}))

const mockInsert = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'l402_used_tokens') {
        return { insert: mockInsert }
      }
      return {}
    }),
  })),
}))

import * as l402 from '@/lib/l402'
import * as postActions from '@/app/actions/post-actions'
import { POST } from '@/app/api/fixes/route'

function createMockRequest(body: any, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) {
    headers.set('Authorization', authHeader)
  }
  return {
    json: vi.fn().mockResolvedValue(body),
    headers,
    method: 'POST',
  } as any
}

describe('POST /api/fixes - Replay Protection', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NODE_ENV = 'production'
    mockInsert.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    vi.restoreAllMocks()
  })

  it('should reject duplicate L402 token with 409 Conflict', async () => {
    const mockToken = { macaroon: 'mock-mac', preimage: 'mock-pre' }
    vi.mocked(l402.parseL402Header).mockReturnValue(mockToken as any)
    vi.mocked(l402.verifyL402Token).mockResolvedValue({
      success: true,
      paymentHash: 'replay-hash-123',
      macaroon: {} as any,
    })

    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })

    const body = { post_id: 'post-1', proof_text: 'I fixed it' }
    const request = createMockRequest(body, 'L402 mock-mac:mock-pre')
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(409)
    expect(data.error).toContain('already been used')
    expect(postActions.submitAnonymousFixForReviewAction).not.toHaveBeenCalled()
  })

  it('should allow first use of L402 token for fix submission', async () => {
    const mockToken = { macaroon: 'mock-mac', preimage: 'mock-pre' }
    vi.mocked(l402.parseL402Header).mockReturnValue(mockToken as any)
    vi.mocked(l402.verifyL402Token).mockResolvedValue({
      success: true,
      paymentHash: 'new-hash-456',
      macaroon: {} as any,
    })
    vi.mocked(postActions.submitAnonymousFixForReviewAction).mockResolvedValue({
      success: true,
    } as any)

    mockInsert.mockResolvedValue({ error: null })

    const body = { post_id: 'post-1', proof_text: 'I fixed it' }
    const request = createMockRequest(body, 'L402 mock-mac:mock-pre')
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.success).toBe(true)
    expect(postActions.submitAnonymousFixForReviewAction).toHaveBeenCalled()
  })

  it('should record payment hash with correct endpoint', async () => {
    const mockToken = { macaroon: 'mock-mac', preimage: 'mock-pre' }
    vi.mocked(l402.parseL402Header).mockReturnValue(mockToken as any)
    vi.mocked(l402.verifyL402Token).mockResolvedValue({
      success: true,
      paymentHash: 'hash-to-record',
      macaroon: {} as any,
    })
    vi.mocked(postActions.submitAnonymousFixForReviewAction).mockResolvedValue({
      success: true,
    } as any)

    mockInsert.mockResolvedValue({ error: null })

    const body = { post_id: 'post-1', proof_text: 'I fixed it' }
    const request = createMockRequest(body, 'L402 mock-mac:mock-pre')
    await POST(request)

    expect(mockInsert).toHaveBeenCalledWith({
      payment_hash: 'hash-to-record',
      endpoint: 'POST /api/fixes',
    })
  })

  it('should still validate request body after replay check passes', async () => {
    const mockToken = { macaroon: 'mock-mac', preimage: 'mock-pre' }
    vi.mocked(l402.parseL402Header).mockReturnValue(mockToken as any)
    vi.mocked(l402.verifyL402Token).mockResolvedValue({
      success: true,
      paymentHash: 'hash-789',
      macaroon: {} as any,
    })

    mockInsert.mockResolvedValue({ error: null })

    const body = { post_id: 'post-1' } // missing proof_text and proof_image_url
    const request = createMockRequest(body, 'L402 mock-mac:mock-pre')
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('proof_text or proof_image_url')
  })

  it('should reject replay before validating request body', async () => {
    const mockToken = { macaroon: 'mock-mac', preimage: 'mock-pre' }
    vi.mocked(l402.parseL402Header).mockReturnValue(mockToken as any)
    vi.mocked(l402.verifyL402Token).mockResolvedValue({
      success: true,
      paymentHash: 'replayed-hash',
      macaroon: {} as any,
    })

    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })

    const body = {} // intentionally invalid body
    const request = createMockRequest(body, 'L402 mock-mac:mock-pre')
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(409)
    expect(data.error).toContain('already been used')
  })
})
