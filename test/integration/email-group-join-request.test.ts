/**
 * Integration test for /api/email/group-join-request POST endpoint
 *
 * Tests group join request handling, email notifications to admins, and error scenarios.
 * Uses real database with per-test cleanup and mock email service for verification.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '@/app/api/email/group-join-request/route'
import { seedUser } from './helpers/test-isolation'
import { getPool, trackUser } from '../setup-db'
import { mockEmailStore } from '@/lib/mock-email-store'

// Mock the email service to use mock store
vi.mock('@/lib/transaction-emails', () => ({
  sendGroupJoinRequestEmail: vi.fn(async (params) => {
    const { mockEmailStore } = await import('@/lib/mock-email-store')
    mockEmailStore.storeEmail({
      type: 'group_join_request',
      to: params.toEmail,
      subject: `New Join Request for ${params.groupName}`,
      html: '', // Mock HTML content
      metadata: {
        adminName: params.adminName,
        requesterName: params.requesterName,
        groupName: params.groupName,
        groupId: params.groupId,
        date: params.date,
      },
    })
  }),
}))

// Helper to create test groups
async function seedGroup(overrides: {
  id?: string
  name?: string
  description?: string
  createdBy?: string
  inviteCode?: string
  groupCode?: string
} = {}) {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const id = overrides.id || crypto.randomUUID()
    const name = overrides.name || 'Test Group'
    const description = overrides.description || 'A test group for integration testing'
    const createdBy = overrides.createdBy || crypto.randomUUID()
    const inviteCode = overrides.inviteCode || `INVITE-${id.slice(0, 8).toUpperCase()}`
    const groupCode = overrides.groupCode || `GROUP-${id.slice(0, 8).toUpperCase()}`

    // If createdBy is provided but not existing, create a minimal user
    if (overrides.createdBy) {
      // Assume the user exists (should be created by the test)
    } else {
      // Create a minimal user for the group creator with unique email
      const creatorEmail = `creator-${createdBy}@test.local`
      
      await client.query(
        `
        INSERT INTO auth.users (
          id, instance_id, email, encrypted_password,
          email_confirmed_at, role, aud,
          raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at
        )
        VALUES (
          $1::uuid, '00000000-0000-0000-0000-000000000000', $2::text,
          crypt('test123', gen_salt('bf')),
          now(), 'authenticated', 'authenticated',
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{"name":"Group Creator"}'::jsonb,
          now(), now()
        )
        ON CONFLICT (id) DO NOTHING
      `,
        [createdBy, creatorEmail]
      )

      await client.query(
        `
        INSERT INTO profiles (id, email, name, balance, pet_coins)
        VALUES ($1::uuid, $2::text, 'Group Creator', 1000, 1000)
        ON CONFLICT (id) DO NOTHING
      `,
        [createdBy, creatorEmail]
      )

      trackUser(createdBy)
    }

    await client.query(
      `
      INSERT INTO groups (id, name, description, created_by, invite_code, group_code, created_at, updated_at)
      VALUES ($1::uuid, $2::text, $3::text, $4::uuid, $5::text, $6::text, now(), now())
    `,
      [id, name, description, createdBy, inviteCode, groupCode]
    )

    return { id, name, description, createdBy, inviteCode, groupCode }
  } finally {
    client.release()
  }
}

// Helper to add group member
async function seedGroupMember(
  groupId: string,
  userId: string,
  role: 'admin' | 'member' = 'member',
  status: 'approved' | 'pending' = 'approved'
) {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const id = crypto.randomUUID()

    await client.query(
      `
      INSERT INTO group_members (id, group_id, user_id, role, status, created_at, updated_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, now(), now())
    `,
      [id, groupId, userId, role, status]
    )

    return { id, groupId, userId, role, status }
  } finally {
    client.release()
  }
}

// Helper to clean up group data
async function cleanupGroup(groupId: string) {
  const pool = getPool()
  const client = await pool.connect()

  try {
    // Delete group members first (FK constraint)
    await client.query(`DELETE FROM group_members WHERE group_id = $1::uuid`, [groupId])
    // Delete group
    await client.query(`DELETE FROM groups WHERE id = $1::uuid`, [groupId])
  } finally {
    client.release()
  }
}

// Helper to create NextRequest for group join request
function createGroupJoinRequest(body: { groupId?: string; requesterId?: string } | null = null) {
  return new Request('http://localhost:3000/api/email/group-join-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : null,
  })
}

describe('POST /api/email/group-join-request', () => {
  beforeEach(() => {
    mockEmailStore.clear()
  })

  describe('Success Cases', () => {
    it('should send email notification to all admins when valid group join request is made', async () => {
      // Seed test data
      const requester = await seedUser({ name: 'John Requester' })
      const admin1 = await seedUser({ name: 'Admin One', email: `admin1-${crypto.randomUUID().slice(0, 8)}@example.com` })
      const admin2 = await seedUser({ name: 'Admin Two', email: `admin2-${crypto.randomUUID().slice(0, 8)}@example.com` })
      const regularMember = await seedUser({ name: 'Regular Member', email: `member-${crypto.randomUUID().slice(0, 8)}@example.com` })

      const group = await seedGroup({ name: 'Tech Enthusiasts' })

      // Add admins and regular member to group
      await seedGroupMember(group.id, admin1.id, 'admin', 'approved')
      await seedGroupMember(group.id, admin2.id, 'admin', 'approved')
      await seedGroupMember(group.id, regularMember.id, 'member', 'approved')

      try {
        // Make request
        const request = createGroupJoinRequest({
          groupId: group.id,
          requesterId: requester.id,
        })

        const response = await POST(request)
        const data = await response.json()

        // Assert response
        expect(response.status).toBe(200)
        expect(data.success).toBe(true)

        // Verify emails were sent to both admins
        const groupJoinEmails = mockEmailStore.getEmailsByType('group_join_request')
        expect(groupJoinEmails).toHaveLength(2)

        // Verify email to admin1
        expect(
          mockEmailStore.wasEmailSent({
            type: 'group_join_request',
            to: admin1.email,
          })
        ).toBe(true)

        const admin1Email = groupJoinEmails.find((e) => e.to === admin1.email)
        expect(admin1Email).toBeDefined()
        expect(admin1Email?.subject).toContain('Tech Enthusiasts')
        expect(admin1Email?.metadata?.requesterName).toBe('John Requester')
        expect(admin1Email?.metadata?.groupName).toBe('Tech Enthusiasts')
        expect(admin1Email?.metadata?.groupId).toBe(group.id)

        // Verify email to admin2
        expect(
          mockEmailStore.wasEmailSent({
            type: 'group_join_request',
            to: admin2.email,
          })
        ).toBe(true)

        // Verify regular member did NOT receive email
        expect(
          mockEmailStore.wasEmailSent({
            type: 'group_join_request',
            to: regularMember.email,
          })
        ).toBe(false)
      } finally {
        await cleanupGroup(group.id)
      }
    })

    it('should filter out @ganamos.app email addresses but still return success', async () => {
      // Seed test data
      const requester = await seedUser({ name: 'Jane Requester' })
      const ganamosAdmin = await seedUser({
        name: 'Ganamos Admin',
        email: `admin-${crypto.randomUUID().slice(0, 8)}@ganamos.app`,
      })
      const externalAdmin = await seedUser({
        name: 'External Admin',
        email: `admin-${crypto.randomUUID().slice(0, 8)}@external.com`,
      })

      const group = await seedGroup({ name: 'Mixed Admin Group' })

      // Add both admins
      await seedGroupMember(group.id, ganamosAdmin.id, 'admin', 'approved')
      await seedGroupMember(group.id, externalAdmin.id, 'admin', 'approved')

      try {
        const request = createGroupJoinRequest({
          groupId: group.id,
          requesterId: requester.id,
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)

        // Verify only external admin received email
        const groupJoinEmails = mockEmailStore.getEmailsByType('group_join_request')
        expect(groupJoinEmails).toHaveLength(1)

        expect(
          mockEmailStore.wasEmailSent({
            type: 'group_join_request',
            to: externalAdmin.email,
          })
        ).toBe(true)

        // Verify ganamos admin did NOT receive email
        expect(
          mockEmailStore.wasEmailSent({
            type: 'group_join_request',
            to: ganamosAdmin.email,
          })
        ).toBe(false)
      } finally {
        await cleanupGroup(group.id)
      }
    })

    it('should filter out admin emails with null value', async () => {
      // Seed test data
      const requester = await seedUser({ name: 'Test Requester' })
      const adminWithEmail = await seedUser({
        name: 'Admin With Email',
        email: `admin-${crypto.randomUUID().slice(0, 8)}@example.com`,
      })

      // Create admin with null email directly via SQL
      const pool = getPool()
      const client = await pool.connect()
      const adminNoEmailId = crypto.randomUUID()

      try {
        // Insert user with null email
        await client.query(
          `
          INSERT INTO auth.users (
            id, instance_id, email, encrypted_password,
            email_confirmed_at, role, aud,
            raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at
          )
          VALUES (
            $1::uuid, '00000000-0000-0000-0000-000000000000', NULL,
            crypt('test123', gen_salt('bf')),
            now(), 'authenticated', 'authenticated',
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"name":"Admin No Email"}'::jsonb,
            now(), now()
          )
        `,
          [adminNoEmailId]
        )

        await client.query(
          `
          INSERT INTO profiles (id, email, name, balance, pet_coins)
          VALUES ($1::uuid, NULL, 'Admin No Email', 1000, 1000)
        `,
          [adminNoEmailId]
        )

        trackUser(adminNoEmailId)

        const group = await seedGroup({ name: 'Null Email Test Group' })

        // Add both admins
        await seedGroupMember(group.id, adminWithEmail.id, 'admin', 'approved')
        await seedGroupMember(group.id, adminNoEmailId, 'admin', 'approved')

        const request = createGroupJoinRequest({
          groupId: group.id,
          requesterId: requester.id,
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)

        // Verify only admin with email received notification
        const groupJoinEmails = mockEmailStore.getEmailsByType('group_join_request')
        expect(groupJoinEmails).toHaveLength(1)
        expect(groupJoinEmails[0].to).toBe(adminWithEmail.email)

        await cleanupGroup(group.id)
      } finally {
        client.release()
      }
    })
  })

  describe('Error Cases', () => {
    it('should return 400 when groupId is missing', async () => {
      const requester = await seedUser()

      const request = createGroupJoinRequest({
        requesterId: requester.id,
      } as any)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Missing required parameters')

      // Verify no emails sent
      expect(mockEmailStore.getEmailsByType('group_join_request')).toHaveLength(0)
    })

    it('should return 400 when requesterId is missing', async () => {
      const group = await seedGroup()

      try {
        const request = createGroupJoinRequest({
          groupId: group.id,
        } as any)

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toBe('Missing required parameters')

        // Verify no emails sent
        expect(mockEmailStore.getEmailsByType('group_join_request')).toHaveLength(0)
      } finally {
        await cleanupGroup(group.id)
      }
    })

    it('should return 500 when request body is null', async () => {
      const request = createGroupJoinRequest(null)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to send email notifications')

      // Verify no emails sent
      expect(mockEmailStore.getEmailsByType('group_join_request')).toHaveLength(0)
    })

    it('should return 404 when group does not exist', async () => {
      const requester = await seedUser()
      const nonExistentGroupId = crypto.randomUUID()

      const request = createGroupJoinRequest({
        groupId: nonExistentGroupId,
        requesterId: requester.id,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Group not found')

      // Verify no emails sent
      expect(mockEmailStore.getEmailsByType('group_join_request')).toHaveLength(0)
    })

    it('should use "Someone" as requester name when profile does not exist', async () => {
      const admin = await seedUser({ name: 'Group Admin', email: `admin-${crypto.randomUUID().slice(0, 8)}@example.com` })
      const group = await seedGroup()
      const nonExistentUserId = crypto.randomUUID()

      // Add admin to group
      await seedGroupMember(group.id, admin.id, 'admin', 'approved')

      try {
        const request = createGroupJoinRequest({
          groupId: group.id,
          requesterId: nonExistentUserId,
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)

        // Verify email was sent with "Someone" as requester name
        const groupJoinEmails = mockEmailStore.getEmailsByType('group_join_request')
        expect(groupJoinEmails).toHaveLength(1)
        expect(groupJoinEmails[0].metadata?.requesterName).toBe('Someone')
      } finally {
        await cleanupGroup(group.id)
      }
    })

    it('should return 404 when group has no admin members', async () => {
      const requester = await seedUser({ name: 'Requester' })
      const regularMember = await seedUser({ name: 'Regular Member' })

      const group = await seedGroup({ name: 'No Admins Group' })

      // Add only regular member (no admins)
      await seedGroupMember(group.id, regularMember.id, 'member', 'approved')

      try {
        const request = createGroupJoinRequest({
          groupId: group.id,
          requesterId: requester.id,
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(404)
        expect(data.error).toBe('No admins found for group')

        // Verify no emails sent
        expect(mockEmailStore.getEmailsByType('group_join_request')).toHaveLength(0)
      } finally {
        await cleanupGroup(group.id)
      }
    })

    it('should return success but send no emails when all admins have @ganamos.app emails', async () => {
      const requester = await seedUser({ name: 'Requester' })
      const ganamosAdmin1 = await seedUser({
        name: 'Ganamos Admin 1',
        email: `admin1-${crypto.randomUUID().slice(0, 8)}@ganamos.app`,
      })
      const ganamosAdmin2 = await seedUser({
        name: 'Ganamos Admin 2',
        email: `admin2-${crypto.randomUUID().slice(0, 8)}@ganamos.app`,
      })

      const group = await seedGroup({ name: 'All Ganamos Admins Group' })

      await seedGroupMember(group.id, ganamosAdmin1.id, 'admin', 'approved')
      await seedGroupMember(group.id, ganamosAdmin2.id, 'admin', 'approved')

      try {
        const request = createGroupJoinRequest({
          groupId: group.id,
          requesterId: requester.id,
        })

        const response = await POST(request)
        const data = await response.json()

        // API returns 200 even when no emails sent (all filtered)
        expect(response.status).toBe(200)
        expect(data.success).toBe(true)

        // Verify no emails sent (all filtered out)
        expect(mockEmailStore.getEmailsByType('group_join_request')).toHaveLength(0)
      } finally {
        await cleanupGroup(group.id)
      }
    })

    it('should only include approved admins in email notifications', async () => {
      const requester = await seedUser({ name: 'Requester' })
      const approvedAdmin = await seedUser({
        name: 'Approved Admin',
        email: `approved-${crypto.randomUUID().slice(0, 8)}@example.com`,
      })
      const pendingAdmin = await seedUser({
        name: 'Pending Admin',
        email: `pending-${crypto.randomUUID().slice(0, 8)}@example.com`,
      })

      const group = await seedGroup({ name: 'Status Filter Group' })

      // Add approved and pending admins
      await seedGroupMember(group.id, approvedAdmin.id, 'admin', 'approved')
      await seedGroupMember(group.id, pendingAdmin.id, 'admin', 'pending')

      try {
        const request = createGroupJoinRequest({
          groupId: group.id,
          requesterId: requester.id,
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)

        // Verify only approved admin received email
        const groupJoinEmails = mockEmailStore.getEmailsByType('group_join_request')
        expect(groupJoinEmails).toHaveLength(1)
        expect(groupJoinEmails[0].to).toBe(approvedAdmin.email)

        // Verify pending admin did NOT receive email
        expect(
          mockEmailStore.wasEmailSent({
            type: 'group_join_request',
            to: pendingAdmin.email,
          })
        ).toBe(false)
      } finally {
        await cleanupGroup(group.id)
      }
    })
  })

  describe('Email Content Verification', () => {
    it('should include correct requester and group information in email', async () => {
      const requester = await seedUser({ name: 'Alice Johnson' })
      const admin = await seedUser({ name: 'Bob Admin', email: `bob-${crypto.randomUUID().slice(0, 8)}@example.com` })
      const group = await seedGroup({ name: 'Photography Club' })

      await seedGroupMember(group.id, admin.id, 'admin', 'approved')

      try {
        const request = createGroupJoinRequest({
          groupId: group.id,
          requesterId: requester.id,
        })

        const response = await POST(request)
        expect(response.status).toBe(200)

        const emails = mockEmailStore.getEmailsByType('group_join_request')
        expect(emails).toHaveLength(1)

        const email = emails[0]
        expect(email.to).toBe(admin.email)
        expect(email.subject).toContain('Photography Club')
        expect(email.metadata?.adminName).toBe('Bob Admin')
        expect(email.metadata?.requesterName).toBe('Alice Johnson')
        expect(email.metadata?.groupName).toBe('Photography Club')
        expect(email.metadata?.groupId).toBe(group.id)
        expect(email.metadata?.date).toBeDefined()
      } finally {
        await cleanupGroup(group.id)
      }
    })
  })
})

