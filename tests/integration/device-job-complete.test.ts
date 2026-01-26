import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/device/job-complete/route'
import { getServiceClient } from './helpers/db-client'
import { seedUser, seedDevice } from './helpers/test-isolation'
import { NextRequest } from 'next/server'

// Mock the auth module
const authState = {
  userId: null as string | null,
}

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(() => {
    if (!authState.userId) {
      return Promise.resolve(null)
    }
    return Promise.resolve({
      user: {
        id: authState.userId,
        email: `user-${authState.userId}@example.com`,
      },
    })
  }),
}))

// Mock the email service
const mockSendDeviceJobCompletionEmail = vi.fn()
vi.mock('@/lib/transaction-emails', () => ({
  sendDeviceJobCompletionEmail: vi.fn((...args) => mockSendDeviceJobCompletionEmail(...args)),
}))

// Mock rate limiter
const rateLimitState = {
  allowed: true,
}

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => ({
    allowed: rateLimitState.allowed,
    remaining: rateLimitState.allowed ? 10 : 0,
    reset: Date.now() + 60000,
  })),
  RATE_LIMITS: {
    DEVICE_CONFIG: { requests: 10, window: 60 },
  },
}))

describe('POST /api/device/job-complete', () => {
  let ownerUserId: string
  let ownerEmail: string
  let fixerUserId: string
  let fixerUsername: string
  let deviceId: string
  let postId: string
  let groupId: string

  beforeEach(async () => {
    // Reset mocks before each test
    vi.clearAllMocks()
    mockSendDeviceJobCompletionEmail.mockResolvedValue(undefined)
    rateLimitState.allowed = true

    const supabase = getServiceClient()

    // Use unique emails to avoid conflicts with previous test runs
    const timestamp = Date.now()

    // Seed owner user
    const owner = await seedUser({
      email: `owner-${timestamp}@example.com`,
      username: `owner_${timestamp}`,
      name: 'Owner User',
    })
    ownerUserId = owner.id
    ownerEmail = owner.email

    // Seed fixer user
    const fixer = await seedUser({
      email: `fixer-${timestamp}@example.com`,
      username: `fixer_${timestamp}`,
      name: 'Fixer User',
    })
    fixerUserId = fixer.id
    fixerUsername = fixer.username

    // Create a paired device for fixer using seedDevice helper
    const device = await seedDevice(fixerUserId, {
      status: 'paired',
      petName: 'Test Device',
    })
    deviceId = device.id

    // Create a test post using service client (bypasses RLS)
    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert({
        user_id: ownerUserId,
        title: 'Fix my issue',
        description: 'Need help with something',
        image_url: 'https://example.com/test-image.jpg',
        reward: 1000,
        fixed: false,
        claimed: false,
      })
      .select('id')
      .single()

    if (postError) {
      console.error('Error creating post:', postError)
      throw postError
    }
    postId = post.id

    // Create a test group using service client
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert({
        name: 'Test Group',
        description: 'Test group for job completion',
        created_by: ownerUserId,
        invite_code: `INVITE-${timestamp}`,
        group_code: `GROUP-${timestamp}`,
      })
      .select('id')
      .single()

    if (groupError) {
      console.error('Error creating group:', groupError)
      throw groupError
    }
    groupId = group.id
  })

  it('should successfully complete a job and send email notification', async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/device/job-complete?deviceId=${deviceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: postId,
        }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.message).toBe('Verification request sent to poster')

    // Verify email was sent with correct parameters
    expect(mockSendDeviceJobCompletionEmail).toHaveBeenCalledTimes(1)
    expect(mockSendDeviceJobCompletionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: ownerEmail,
        ownerName: 'Owner User',
        issueTitle: 'Fix my issue',
        fixerName: 'Fixer User',
        fixerUsername: fixerUsername,
        fixerUserId: fixerUserId,
        rewardAmount: 1000,
        postId: postId,
      })
    )
  })

  it('should return 400 when deviceId is missing', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/device/job-complete',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: postId,
        }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Device ID required')
  })

  it('should return 400 when jobId is missing', async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/device/job-complete?deviceId=${deviceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Job ID required')
  })

  it('should return 404 when device is not found', async () => {
    const fakeDeviceId = '00000000-0000-0000-0000-000000000000'
    const request = new NextRequest(
      `http://localhost:3000/api/device/job-complete?deviceId=${fakeDeviceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: postId,
        }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Device not found')
  })

  it('should return 404 when device is not paired', async () => {
    // Create a separate user for the unpaired device (each user can only have one device)
    const timestamp = Date.now()
    const unpairedUser = await seedUser({
      email: `unpaired-${timestamp}@example.com`,
      username: `unpaired_${timestamp}`,
      name: 'Unpaired User',
    })
    
    // Create an unpaired device using seedDevice helper
    const unpairedDevice = await seedDevice(unpairedUser.id, {
      status: 'disconnected',
      petName: 'Unpaired Device',
    })

    const request = new NextRequest(
      `http://localhost:3000/api/device/job-complete?deviceId=${unpairedDevice.id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: postId,
        }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Device not found')
  })

  it('should return 404 when job is not found', async () => {
    const fakeJobId = '00000000-0000-0000-0000-000000000000'
    const request = new NextRequest(
      `http://localhost:3000/api/device/job-complete?deviceId=${deviceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: fakeJobId,
        }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Job not found')
  })

  it('should return 400 when job is already fixed', async () => {
    const supabase = getServiceClient()

    // Create a fixed post
    const { data: fixedPost } = await supabase
      .from('posts')
      .insert({
        user_id: ownerUserId,
        title: 'Already fixed',
        description: 'This is fixed',
        image_url: 'https://example.com/fixed-image.jpg',
        reward: 500,
        fixed: true,
        claimed: false,
      })
      .select('id')
      .single()

    const request = new NextRequest(
      `http://localhost:3000/api/device/job-complete?deviceId=${deviceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: fixedPost!.id,
        }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Job already completed')

    // Cleanup
    await supabase.from('posts').delete().eq('id', fixedPost!.id)
  })

  it('should return 400 when job is already claimed', async () => {
    const supabase = getServiceClient()

    // Create a claimed post
    const { data: claimedPost } = await supabase
      .from('posts')
      .insert({
        user_id: ownerUserId,
        title: 'Already claimed',
        description: 'This is claimed',
        reward: 500,
        fixed: false,
        image_url: 'https://example.com/test-image.jpg',
        claimed: true,
      })
      .select('id')
      .single()

    const request = new NextRequest(
      `http://localhost:3000/api/device/job-complete?deviceId=${deviceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: claimedPost!.id,
        }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Job already claimed')

    // Cleanup
    await supabase.from('posts').delete().eq('id', claimedPost!.id)
  })

  it('should return 400 when job is deleted', async () => {
    const supabase = getServiceClient()

    // Create a deleted post
    const { data: deletedPost } = await supabase
      .from('posts')
      .insert({
        user_id: ownerUserId,
        title: 'Deleted post',
        description: 'This is deleted',
        reward: 500,
        fixed: false,
        image_url: 'https://example.com/test-image.jpg',
        claimed: false,
        deleted_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    const request = new NextRequest(
      `http://localhost:3000/api/device/job-complete?deviceId=${deviceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: deletedPost!.id,
        }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Job has been deleted')

    // Cleanup
    await supabase.from('posts').delete().eq('id', deletedPost!.id)
  })

  it('should return 403 when fixer is not a member of required group', async () => {
    const supabase = getServiceClient()

    // Create a post that requires group membership
    const { data: groupPost } = await supabase
      .from('posts')
      .insert({
        user_id: ownerUserId,
        title: 'Group job',
        description: 'Requires group membership',
        reward: 1000,
        fixed: false,
        image_url: 'https://example.com/test-image.jpg',
        claimed: false,
        group_id: groupId,
      })
      .select('id')
      .single()

    const request = new NextRequest(
      `http://localhost:3000/api/device/job-complete?deviceId=${deviceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: groupPost!.id,
        }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.success).toBe(false)
    expect(data.error).toBe('You are not a member of this group')

    // Cleanup
    await supabase.from('posts').delete().eq('id', groupPost!.id)
  })

  it('should succeed when fixer is an approved member of required group', async () => {
    const supabase = getServiceClient()

    // Add fixer to group as approved member
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({
        group_id: groupId,
        user_id: fixerUserId,
        role: 'member',
        status: 'approved',
      })

    if (memberError) {
      console.error('Error adding member to group:', memberError)
      throw memberError
    }

    // Create a post that requires group membership
    const { data: groupPost } = await supabase
      .from('posts')
      .insert({
        user_id: ownerUserId,
        title: 'Group job',
        description: 'Requires group membership',
        reward: 1000,
        fixed: false,
        image_url: 'https://example.com/test-image.jpg',
        claimed: false,
        group_id: groupId,
      })
      .select('id')
      .single()

    const request = new NextRequest(
      `http://localhost:3000/api/device/job-complete?deviceId=${deviceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: groupPost!.id,
        }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockSendDeviceJobCompletionEmail).toHaveBeenCalledTimes(1)

    // Cleanup
    await supabase.from('posts').delete().eq('id', groupPost!.id)
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', fixerUserId)
  })

  it('should skip email when owner has @ganamos.app address but still succeed', async () => {
    const supabase = getServiceClient()

    // Create owner with @ganamos.app email using unique timestamp
    const timestamp = Date.now()
    const ganamosOwner = await seedUser({
      email: `testowner-${timestamp}@ganamos.app`,
      username: `ganamos_owner_${timestamp}`,
      name: 'Ganamos Owner',
    })

    // Create post for this owner
    const { data: ganamosPost } = await supabase
      .from('posts')
      .insert({
        user_id: ganamosOwner.id,
        title: 'Ganamos job',
        description: 'Internal job',
        reward: 500,
        fixed: false,
        image_url: 'https://example.com/test-image.jpg',
        claimed: false,
      })
      .select('id')
      .single()

    const request = new NextRequest(
      `http://localhost:3000/api/device/job-complete?deviceId=${deviceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: ganamosPost!.id,
        }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    // Email should not be sent for @ganamos.app addresses
    expect(mockSendDeviceJobCompletionEmail).not.toHaveBeenCalled()

    // Cleanup
    await supabase.from('posts').delete().eq('id', ganamosPost!.id)
    await supabase.from('profiles').delete().eq('id', ganamosOwner.id)
  })

  it('should return 429 when rate limit is exceeded', async () => {
    rateLimitState.allowed = false

    const request = new NextRequest(
      `http://localhost:3000/api/device/job-complete?deviceId=${deviceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: postId,
        }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(429)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Rate limit exceeded')
  })

  it('should still succeed even if email fails', async () => {
    // Mock email to throw error
    mockSendDeviceJobCompletionEmail.mockRejectedValue(new Error('Email service unavailable'))

    const request = new NextRequest(
      `http://localhost:3000/api/device/job-complete?deviceId=${deviceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: postId,
        }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    // Endpoint should still return success even when email fails
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.message).toBe('Verification request sent to poster')

    // Verify email was attempted
    expect(mockSendDeviceJobCompletionEmail).toHaveBeenCalledTimes(1)
  })
})
