import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '@/app/api/cron/expire-posts/route'
import { NextRequest } from 'next/server'
import { getServiceClient } from './helpers/db-client'
import { seedUser } from './helpers/test-isolation'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import * as transactionEmails from '@/lib/transaction-emails'

// Mock email functions for integration tests
vi.mock('@/lib/transaction-emails', () => ({
  sendPostExpiryWarningEmail: vi.fn().mockResolvedValue(undefined),
  sendPostExpiredConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendPostExpiredFixerEmail: vi.fn().mockResolvedValue(undefined),
}))

describe('POST Expiration Cron - Integration Tests', () => {
  let testSupabase: SupabaseClient<Database>
  let testUserId: string
  let testUserEmail: string
  let testFixerId: string
  let testFixerEmail: string

  beforeEach(async () => {
    vi.clearAllMocks()

    // Initialize Supabase client using the helper
    testSupabase = getServiceClient()

    const timestamp = Date.now()

    // Create test users via seedUser (creates auth.users + profiles properly)
    const poster = await seedUser({
      email: `test-poster-${timestamp}@example.com`,
      name: 'Test Poster',
      balance: 5000,
    })
    testUserId = poster.id
    testUserEmail = poster.email

    const fixer = await seedUser({
      email: `test-fixer-${timestamp}@example.com`,
      name: 'Test Fixer',
      balance: 0,
    })
    testFixerId = fixer.id
    testFixerEmail = fixer.email
  })

  // Cleanup is handled automatically by setup-db.ts afterEach

  describe('End-to-End Expiration Flow', () => {
    it('should expire post and update database', async () => {
      // Create an expired post
      const { data: post, error: insertError } = await testSupabase
        .from('posts')
        .insert({
          user_id: testUserId,
          title: 'Integration Test Post',
          description: 'This post should expire',
          image_url: 'https://example.com/test.jpg',
          reward: 1000,
          expires_at: new Date(Date.now() - 3600_000).toISOString(), // 1 hour ago
          fixed: false,
          under_review: false,
          fixed_by_is_anonymous: false,
        })
        .select('id, deleted_at')
        .single()

      if (insertError) {
        console.error('Insert error:', insertError)
      }

      expect(post).toBeDefined()
      expect((post as any)?.deleted_at).toBeFalsy() // Can be null or undefined

      // Get initial balance
      const { data: initialProfile } = await testSupabase
        .from('profiles')
        .select('balance')
        .eq('id', testUserId)
        .single()

      const initialBalance = (initialProfile as any)?.balance || 0

      // Verify post was actually created
      const { data: allPosts } = await testSupabase
        .from('posts')
        .select('*')
        .eq('user_id', testUserId)
      
      console.log('Posts in DB before cron:', JSON.stringify(allPosts, null, 2))

      // Execute cron job
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })

      const response = await GET(request)
      const data = await response.json()

      console.log('Cron response:', JSON.stringify(data, null, 2))

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.expired).toBeGreaterThan(0)

      // Verify post is soft-deleted
      const { data: updatedPost } = await testSupabase
        .from('posts')
        .select('deleted_at')
        .eq('id', (post as any)?.id)
        .single()

      expect(updatedPost?.deleted_at).not.toBeNull()

      // Verify balance was refunded
      const { data: updatedProfile } = await testSupabase
        .from('profiles')
        .select('balance')
        .eq('id', testUserId)
        .single()

      expect((updatedProfile as any)?.balance).toBe(initialBalance + 1000)

      // Verify activity was logged
      const { data: activities } = await testSupabase
        .from('activities')
        .select('*')
        .eq('user_id', testUserId)
        .eq('type', 'post_expired')
        .eq('related_id', (post as any)?.id)

      expect(activities).toHaveLength(1)
      expect((activities as any)?.[0].metadata).toMatchObject({
        title: 'Integration Test Post',
        reward: 1000,
      })

      // Verify transaction was created
      const { data: transactions } = await testSupabase
        .from('transactions')
        .select('*')
        .eq('user_id', testUserId)
        .eq('type', 'internal')
        .eq('amount', 1000)

      expect(transactions).toHaveLength(1)
      expect((transactions as any)?.[0].memo).toContain('Refund for expired post')

      // Verify confirmation email was sent
      expect(transactionEmails.sendPostExpiredConfirmationEmail).toHaveBeenCalledWith({
        toEmail: testUserEmail,
        userName: 'Test Poster',
        postTitle: 'Integration Test Post',
        refundAmountSats: 1000,
        postId: (post as any)?.id,
      })
    })

    it('should send warning email for posts expiring soon', async () => {
      // Create a post expiring in 5 hours
      const { data: post } = await testSupabase
        .from('posts')
        .insert({
          user_id: testUserId,
          title: 'Warning Test Post',
          description: 'This post will get a warning',
          image_url: 'https://example.com/warning.jpg',
          reward: 500,
          expires_at: new Date(Date.now() + 5 * 3600_000).toISOString(),
          expiry_warning_sent_at: null,
          fixed: false,
          under_review: false,
          fixed_by_is_anonymous: false,
        })
        .select('id, expiry_warning_sent_at')
        .single()

      expect((post as any)?.expiry_warning_sent_at).toBeFalsy() // Can be null or undefined

      // Execute cron job
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.warned).toBeGreaterThan(0)

      // Verify warning email was sent
      expect(transactionEmails.sendPostExpiryWarningEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          toEmail: testUserEmail,
          userName: 'Test Poster',
          postTitle: 'Warning Test Post',
          postId: (post as any)?.id,
        })
      )

      // Verify expiry_warning_sent_at was set
      const { data: updatedPost } = await testSupabase
        .from('posts')
        .select('expiry_warning_sent_at')
        .eq('id', (post as any)?.id)
        .single()

      expect(updatedPost?.expiry_warning_sent_at).not.toBeNull()
    })

    it('should clear assignment and notify fixer on expiration', async () => {
      // Create an expired post with an assigned fixer
      const { data: post } = await testSupabase
        .from('posts')
        .insert({
          user_id: testUserId,
          title: 'Assigned Post',
          description: 'This post has a fixer',
          image_url: 'https://example.com/assigned.jpg',
          reward: 1500,
          expires_at: new Date(Date.now() - 3600_000).toISOString(),
          assigned_to: testFixerId,
          fixed: false,
          under_review: false,
          fixed_by_is_anonymous: false,
        })
        .select('id, assigned_to')
        .single()

      expect((post as any)?.assigned_to).toBe(testFixerId)

      // Execute cron job
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })

      await GET(request)

      // Verify assignment was cleared
      const { data: updatedPost } = await testSupabase
        .from('posts')
        .select('assigned_to')
        .eq('id', (post as any)?.id)
        .single()

      expect(updatedPost?.assigned_to).toBeFalsy() // Should be null or undefined (cleared)

      // Verify fixer email was sent
      expect(transactionEmails.sendPostExpiredFixerEmail).toHaveBeenCalledWith({
        toEmail: testFixerEmail,
        fixerName: 'Test Fixer',
        postTitle: 'Assigned Post',
        postId: (post as any)?.id,
      })
    })

    it('should skip posts that are under_review', async () => {
      // Create an expired post that's under review
      const { data: post } = await testSupabase
        .from('posts')
        .insert({
          user_id: testUserId,
          title: 'Under Review Post',
          description: 'This post is under review',
          image_url: 'https://example.com/review.jpg',
          reward: 2000,
          expires_at: new Date(Date.now() - 3600_000).toISOString(),
          fixed: false,
          under_review: true,
          fixed_by_is_anonymous: false,
        })
        .select('id, deleted_at')
        .single()

      // Execute cron job
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.skipped).toBeGreaterThan(0)

      // Verify post was NOT deleted
      const { data: updatedPost } = await testSupabase
        .from('posts')
        .select('deleted_at')
        .eq('id', (post as any)?.id)
        .single()

      expect(updatedPost?.deleted_at).toBeFalsy() // Should still be null/undefined (not deleted)
    })
  })

  describe('Authentication', () => {
    it('should authenticate with Vercel cron headers', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { 'x-vercel-cron': '1' },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)
    })

    it('should authenticate with valid Bearer token', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)
    })

    it('should reject request without authentication', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/expire-posts', {
        method: 'GET',
      })

      const response = await GET(request)
      expect(response.status).toBe(401)
    })
  })
})
