import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/alexa/jobs/[id]/complete/route'
import { getServiceClient } from './helpers/db-client'
import { seedUser } from './helpers/test-isolation'
import { SignJWT } from 'jose'
import * as postActions from '@/app/actions/post-actions'

// Track mock calls
const mockEmailCalls: any[] = []
const mockCloseIssueResults = new Map<string, { success: boolean; error?: string }>()

// Mock Resend email service
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(async (emailData: any) => {
        mockEmailCalls.push(emailData)
        return { id: 'mock-email-id' }
      }),
    },
  })),
}))

// Mock closeIssueAction - this is the key business logic that awards sats
vi.mock('@/app/actions/post-actions', () => ({
  closeIssueAction: vi.fn(async (postId: string, userId: string, fixerUsername: string) => {
    const key = `${postId}-${userId}-${fixerUsername}`
    return mockCloseIssueResults.get(key) || { success: true }
  }),
}))

// Helper to create Alexa access token
async function createAccessToken(userId: string, clientId: string = 'test-client-id'): Promise<string> {
  const secret = new TextEncoder().encode(process.env.ALEXA_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || 'test-secret-key-for-testing')
  const now = Math.floor(Date.now() / 1000)
  
  return await new SignJWT({
    sub: userId,
    client_id: clientId,
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime('1h')
    .sign(secret)
}

describe('POST /api/alexa/jobs/[id]/complete', () => {
  const serviceClient = getServiceClient()
  let ownerUserId: string
  let ownerEmail: string
  let fixerUserId: string
  let fixerUsername: string
  let testJobId: string
  let testGroupId: string
  let accessToken: string

  beforeEach(async () => {
    // Reset mocks
    mockEmailCalls.length = 0
    mockCloseIssueResults.clear()
    vi.clearAllMocks()
    
    // Set required environment variables for tests
    process.env.RESEND_API_KEY = 'test-resend-key'
    process.env.SUPABASE_JWT_SECRET = 'test-secret-key-for-testing'

    const timestamp = Date.now()

    // Seed owner user first (needed for group creation)
    const owner = await seedUser({
      email: `owner-${timestamp}@example.com`,
      username: `owner_${timestamp}`,
      name: 'Owner User',
      balance: 1000,
    })
    ownerUserId = owner.id
    ownerEmail = owner.email

    // Create test group
    const { data: group, error: groupError } = await serviceClient
      .from('groups')
      .insert({
        name: `Test Group ${timestamp}`,
        description: 'Test group for job completion',
        created_by: ownerUserId,
        invite_code: `INVITE-${timestamp}`,
        group_code: `GROUP-${timestamp}`,
      })
      .select('id')
      .single()

    if (groupError) throw groupError
    testGroupId = group.id

    // Seed fixer user
    const fixer = await seedUser({
      email: `fixer-${timestamp}@example.com`,
      username: `fixer_${timestamp}`,
      name: 'Fixer User',
      balance: 0,
    })
    fixerUserId = fixer.id
    fixerUsername = fixer.username

    // Add both users to group
    await serviceClient.from('group_members').insert([
      {
        group_id: testGroupId,
        user_id: ownerUserId,
        role: 'admin',
        status: 'approved',
      },
      {
        group_id: testGroupId,
        user_id: fixerUserId,
        role: 'member',
        status: 'approved',
      },
    ])

    // Create Alexa linked account for owner using direct database insertion
    accessToken = await createAccessToken(ownerUserId, 'test-client-id')
    
    await serviceClient.from('alexa_linked_accounts').insert({
      user_id: ownerUserId,
      client_id: 'test-client-id',
      access_token: accessToken,
      refresh_token: 'mock-refresh-token',
      selected_group_id: testGroupId,
      token_expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    })

    // Create test job
    const { data: job, error: jobError } = await serviceClient
      .from('posts')
      .insert({
        title: 'Fix the broken fence',
        description: 'The fence in the backyard needs repair',
        image_url: 'https://example.com/test-fence.jpg',
        reward: 100,
        user_id: ownerUserId,
        group_id: testGroupId,
        created_by: 'Owner User',
        fixed: false,
        claimed: false,
      })
      .select('id')
      .single()

    if (jobError) throw jobError
    testJobId = job.id
  })

  // Helper to create request
  function createRequest(jobId: string, fixerName: string, token?: string): NextRequest {
    return new NextRequest(`http://localhost:3000/api/alexa/jobs/${jobId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ fixerName }),
    })
  }

  describe('Authentication', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const request = createRequest(testJobId, 'Fixer User')
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Missing authorization token')
    })

    it('should return 401 when token is invalid', async () => {
      const request = createRequest(testJobId, 'Fixer User', 'invalid-token')
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid or expired token')
    })

    it('should accept valid Bearer token', async () => {
      const request = createRequest(testJobId, 'Fixer User', accessToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('Request Validation', () => {
    it('should return 400 when fixerName is missing', async () => {
      const request = new NextRequest(`http://localhost:3000/api/alexa/jobs/${testJobId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      })
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Fixer name is required')
    })

    it('should return 400 when fixerName is not a string', async () => {
      const request = new NextRequest(`http://localhost:3000/api/alexa/jobs/${testJobId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ fixerName: 123 }),
      })
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Fixer name is required')
    })

    it('should return 400 when no group is selected', async () => {
      // Remove selected_group_id from linked account
      await serviceClient
        .from('alexa_linked_accounts')
        .update({ selected_group_id: null })
        .eq('user_id', ownerUserId)

      const request = createRequest(testJobId, 'Fixer User', accessToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('No group selected')
    })
  })

  describe('Job Validation', () => {
    it('should return 404 when job is not found', async () => {
      const request = createRequest('00000000-0000-0000-0000-000000000000', 'Fixer User', accessToken)
      const response = await POST(request, { params: { id: '00000000-0000-0000-0000-000000000000' } })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Job not found')
    })

    it('should return 403 when job is in different group', async () => {
      const timestamp = Date.now()
      const { data: otherGroup } = await serviceClient
        .from('groups')
        .insert({
          name: `Other Group ${timestamp}`,
          group_code: `OTHER-${timestamp}`,
          invite_code: `INVITE-OTHER-${timestamp}`,
          created_by: ownerUserId,
        })
        .select('id')
        .single()

      const { data: otherJob } = await serviceClient
        .from('posts')
        .insert({
          title: 'Other Job',
          description: 'Different group',
          image_url: 'https://example.com/other-job.jpg',
          reward: 50,
          user_id: ownerUserId,
          group_id: otherGroup!.id,
          created_by: 'Owner User',
          fixed: false,
          claimed: false,
        })
        .select('id')
        .single()

      const request = createRequest(otherJob!.id, 'Fixer User', accessToken)
      const response = await POST(request, { params: { id: otherJob!.id } })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Job not in your selected group')
    })

    it('should return 400 when job is already completed', async () => {
      await serviceClient
        .from('posts')
        .update({ fixed: true })
        .eq('id', testJobId)

      const request = createRequest(testJobId, 'Fixer User', accessToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Job has already been claimed or is under review')
    })

    it('should return 400 when job is already claimed', async () => {
      await serviceClient
        .from('posts')
        .update({ claimed: true })
        .eq('id', testJobId)

      const request = createRequest(testJobId, 'Fixer User', accessToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Job has already been claimed or is under review')
    })

    it('should return 400 when job is deleted', async () => {
      await serviceClient
        .from('posts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', testJobId)

      const request = createRequest(testJobId, 'Fixer User', accessToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Job has already been claimed or is under review')
    })
  })

  describe('Fixer Lookup', () => {
    it('should return 404 when fixer is not found in group', async () => {
      const request = createRequest(testJobId, 'Unknown Person', accessToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toContain('Could not find a group member named "Unknown Person"')
      expect(data.suggestion).toBe('Make sure the person is a member of your group.')
    })

    it('should find fixer by exact username', async () => {
      const request = createRequest(testJobId, fixerUsername, accessToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.fixer.username).toBe(fixerUsername)
    })

    it('should find fixer by full name', async () => {
      const request = createRequest(testJobId, 'Fixer User', accessToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.fixer.name).toBe('Fixer User')
    })

    it('should find fixer by first name', async () => {
      const request = createRequest(testJobId, 'Fixer', accessToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.fixer.name).toBe('Fixer User')
    })

    it('should handle case-insensitive matching', async () => {
      const request = createRequest(testJobId, 'fixer user', accessToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('Post Owner Flow', () => {
    it('should successfully complete job when user is post owner', async () => {
      const request = createRequest(testJobId, 'Fixer User', accessToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.message).toContain('Great! The job "Fix the broken fence" has been marked complete')
      expect(data.message).toContain('Fixer User has been awarded 100 sats')
      expect(data.job).toMatchObject({
        id: testJobId,
        title: 'Fix the broken fence',
        reward: 100,
      })
      expect(data.fixer).toMatchObject({
        name: 'Fixer User',
        username: fixerUsername,
      })
      expect(data.requiresVerification).toBeUndefined()
    })

    it('should call closeIssueAction with correct parameters', async () => {
      const request = createRequest(testJobId, 'Fixer User', accessToken)
      await POST(request, { params: { id: testJobId } })

      expect(postActions.closeIssueAction).toHaveBeenCalledWith(
        testJobId,
        ownerUserId,
        fixerUsername
      )
    })

    it('should return 500 when closeIssueAction fails', async () => {
      const key = `${testJobId}-${ownerUserId}-${fixerUsername}`
      mockCloseIssueResults.set(key, { success: false, error: 'Failed to transfer reward' })

      const request = createRequest(testJobId, 'Fixer User', accessToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to transfer reward')
    })
  })

  describe('Non-Owner Flow', () => {
    let nonOwnerUserId: string
    let nonOwnerToken: string

    beforeEach(async () => {
      const timestamp = Date.now()
      
      // Create a different user to simulate non-owner
      const nonOwner = await seedUser({
        email: `nonowner-${timestamp}@example.com`,
        username: `nonowner_${timestamp}`,
        name: 'Non Owner',
      })
      nonOwnerUserId = nonOwner.id

      // Add non-owner to group
      await serviceClient.from('group_members').insert({
        group_id: testGroupId,
        user_id: nonOwnerUserId,
        role: 'member',
        status: 'approved',
      })

      // Create token for non-owner
      nonOwnerToken = await createAccessToken(nonOwnerUserId, 'test-client-id')
      
      await serviceClient.from('alexa_linked_accounts').insert({
        user_id: nonOwnerUserId,
        client_id: 'test-client-id',
        access_token: nonOwnerToken,
        refresh_token: 'mock-refresh-token',
        selected_group_id: testGroupId,
        token_expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      })
    })

    it('should mark job under review when non-owner completes it', async () => {
      const request = createRequest(testJobId, 'Fixer User', nonOwnerToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.requiresVerification).toBe(true)
      expect(data.message).toContain('An email has been sent to them to verify')
      expect(data.job.ownerName).toBe('Owner User')
      expect(data.fixer.name).toBe('Fixer User')

      // Verify database state
      const { data: updatedJob } = await serviceClient
        .from('posts')
        .select('under_review, submitted_fix_by_id, submitted_fix_by_name, submitted_fix_by_avatar, submitted_fix_at, submitted_fix_note')
        .eq('id', testJobId)
        .single()

      expect(updatedJob!.under_review).toBe(true)
      expect(updatedJob!.submitted_fix_by_id).toBe(fixerUserId)
      expect(updatedJob!.submitted_fix_by_name).toBe('Fixer User')
      expect(updatedJob!.submitted_fix_note).toContain('Submitted via Alexa by Fixer User')
      expect(updatedJob!.submitted_fix_at).toBeTruthy()
    })

    it('should send verification email to post owner', async () => {
      const request = createRequest(testJobId, 'Fixer User', nonOwnerToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(200)
      
      // Check that email was sent
      expect(mockEmailCalls.length).toBeGreaterThan(0)
      const emailCall = mockEmailCalls[0]
      expect(emailCall.to).toBe(ownerEmail)
      expect(emailCall.subject).toContain('Fixer User says they completed your job')
      expect(emailCall.html).toContain('Fix the broken fence')
      expect(emailCall.html).toContain('100')
    })

    it('should not call closeIssueAction for non-owner non-admin', async () => {
      vi.mocked(postActions.closeIssueAction).mockClear()

      const request = createRequest(testJobId, 'Fixer User', nonOwnerToken)
      await POST(request, { params: { id: testJobId } })

      expect(postActions.closeIssueAction).not.toHaveBeenCalled()
    })
  })

  describe('Group Admin Flow', () => {
    let groupAdminUserId: string
    let groupAdminToken: string

    beforeEach(async () => {
      const timestamp = Date.now()
      
      // Create a group admin user who is NOT the post owner
      const groupAdmin = await seedUser({
        email: `groupadmin-${timestamp}@example.com`,
        username: `groupadmin_${timestamp}`,
        name: 'Group Admin',
      })
      groupAdminUserId = groupAdmin.id

      // Add group admin to group with admin role
      await serviceClient.from('group_members').insert({
        group_id: testGroupId,
        user_id: groupAdminUserId,
        role: 'admin',  // This is the key difference - they're an admin
        status: 'approved',
      })

      // Create token for group admin
      groupAdminToken = await createAccessToken(groupAdminUserId, 'test-client-id')
      
      await serviceClient.from('alexa_linked_accounts').insert({
        user_id: groupAdminUserId,
        client_id: 'test-client-id',
        access_token: groupAdminToken,
        refresh_token: 'mock-refresh-token',
        selected_group_id: testGroupId,
        token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      })
    })

    it('should successfully complete job when user is group admin (not post owner)', async () => {
      const request = createRequest(testJobId, 'Fixer User', groupAdminToken)
      const response = await POST(request, { params: { id: testJobId } })

      expect(response.status).toBe(200)
      const data = await response.json()

      // Group admin should be able to close the job directly (like post owner)
      expect(data.success).toBe(true)
      expect(data.requiresVerification).toBeUndefined() // Should NOT require verification
      expect(data.message).toContain('has been marked complete')
      expect(data.job.title).toBe('Fix the broken fence')
      expect(data.fixer.name).toBe('Fixer User')

      expect(postActions.closeIssueAction).toHaveBeenCalledWith(
        testJobId,
        groupAdminUserId,
        fixerUsername
      )
    })

    it('should call closeIssueAction for group admin', async () => {
      vi.mocked(postActions.closeIssueAction).mockClear()

      const request = createRequest(testJobId, 'Fixer User', groupAdminToken)
      await POST(request, { params: { id: testJobId } })

      // Group admin should call closeIssueAction (unlike regular member)
      expect(postActions.closeIssueAction).toHaveBeenCalled()
    })
  })

  describe('Downstream Effects', () => {
    it('should update last_used_at timestamp for access token', async () => {
      const { data: beforeToken } = await serviceClient
        .from('alexa_linked_accounts')
        .select('last_used_at')
        .eq('user_id', ownerUserId)
        .single()

      const request = createRequest(testJobId, 'Fixer User', accessToken)
      await POST(request, { params: { id: testJobId } })

      const { data: afterToken } = await serviceClient
        .from('alexa_linked_accounts')
        .select('last_used_at')
        .eq('user_id', ownerUserId)
        .single()

      // last_used_at should have been updated
      if (beforeToken!.last_used_at) {
        expect(new Date(afterToken!.last_used_at!).getTime()).toBeGreaterThan(
          new Date(beforeToken!.last_used_at).getTime()
        )
      } else {
        expect(afterToken!.last_used_at).toBeTruthy()
      }
    })
  })
})
