import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  createAdminClient,
  createUserClient,
  createTestProfile,
  createChildAccount,
  createTestTransactions,
  createTestActivities,
  cleanupTestData,
  signInAsUser,
  getProfile,
  connectionExists,
  getActivities,
  getTransactions,
  calculateBalanceFromTransactions,
  TestProfile,
  TestConnection,
} from '../helpers/soft-delete-test-utils'

describe('POST /api/soft-delete-child-account - Integration Tests', () => {
  let admin: SupabaseClient
  let parentProfile: TestProfile
  let childProfile: TestProfile
  let connection: TestConnection
  let parentAccessToken: string
  let testUserIds: string[] = []

  beforeEach(async () => {
    admin = createAdminClient()
    testUserIds = []

    // Generate unique emails using timestamp and random string to avoid conflicts
    // Add a small delay to ensure unique timestamps even for fast test execution
    await new Promise((resolve) => setTimeout(resolve, 10))
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const parentEmail = `parent-${uniqueSuffix}@example.com`
    const childName = `Child-${uniqueSuffix}`

    // Create parent account
    parentProfile = await createTestProfile(admin, parentEmail, 'Parent User', 10000)
    testUserIds.push(parentProfile.id)

    // Create child account with connection
    const result = await createChildAccount(admin, parentProfile.id, childName, 5000)
    childProfile = result.child
    connection = result.connection
    testUserIds.push(childProfile.id)

    // Sign in as parent to get access token
    parentAccessToken = await signInAsUser(parentProfile.email)
  })

  afterEach(async () => {
    await cleanupTestData(admin, testUserIds)
  })

  describe('Soft Delete Behavior and Data Preservation', () => {
    it('should soft delete child account by marking status as deleted', async () => {
      // Call the endpoint
      const response = await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)

      // Verify profile is soft deleted (status = 'deleted')
      const profile = await getProfile(admin, childProfile.id)
      expect(profile.status).toBe('deleted')
      expect(profile.deleted_at).toBeTruthy()
      expect(profile.deleted_by).toBe(parentProfile.id)

      // Verify profile row still exists in database
      expect(profile.id).toBe(childProfile.id)
      expect(profile.email).toBe(childProfile.email)
      expect(profile.name).toBe(childProfile.name)
    })

    it('should preserve transactions after soft delete', async () => {
      // Create test transactions for child
      const transactions = await createTestTransactions(admin, childProfile.id, [
        { type: 'deposit', amount: 1000 },
        { type: 'withdrawal', amount: 500 },
        { type: 'internal', amount: 200 },
      ])

      // Soft delete child account
      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      // Verify transactions still exist
      const preservedTransactions = await getTransactions(admin, childProfile.id)
      expect(preservedTransactions).toHaveLength(transactions.length)
      expect(preservedTransactions.map((t) => t.id).sort()).toEqual(
        transactions.map((t) => t.id).sort()
      )
    })

    it('should preserve activities after soft delete', async () => {
      // Create test activities for child
      const activities = await createTestActivities(admin, childProfile.id, 5)

      // Soft delete child account
      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      // Verify activities still exist
      const preservedActivities = await getActivities(admin, childProfile.id)
      expect(preservedActivities).toHaveLength(activities.length)
      expect(preservedActivities.map((a) => a.id).sort()).toEqual(
        activities.map((a) => a.id).sort()
      )
    })

    it('should preserve auth.users record after soft delete', async () => {
      // Soft delete child account
      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      // Verify auth user still exists
      const { data: authUser, error } = await admin.auth.admin.getUserById(childProfile.id)
      expect(error).toBeNull()
      expect(authUser.user).toBeTruthy()
      expect(authUser.user?.id).toBe(childProfile.id)
      expect(authUser.user?.email).toBe(childProfile.email)
    })

    it('should hard delete connected_accounts relationship', async () => {
      // Soft delete child account
      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      // Verify connection is deleted
      const exists = await connectionExists(admin, parentProfile.id, childProfile.id)
      expect(exists).toBe(false)
    })
  })

  describe('Audit Trail and Metadata', () => {
    it('should populate deleted_at timestamp', async () => {
      const beforeDelete = new Date()

      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      const profile = await getProfile(admin, childProfile.id)
      expect(profile.deleted_at).toBeTruthy()

      const deletedAt = new Date(profile.deleted_at)
      expect(deletedAt.getTime()).toBeGreaterThanOrEqual(beforeDelete.getTime())
      expect(deletedAt.getTime()).toBeLessThanOrEqual(new Date().getTime())
    })

    it('should populate deleted_by with parent user ID', async () => {
      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      const profile = await getProfile(admin, childProfile.id)
      expect(profile.deleted_by).toBe(parentProfile.id)
    })

    it('should update updated_at timestamp', async () => {
      const originalProfile = await getProfile(admin, childProfile.id)
      const originalUpdatedAt = new Date(originalProfile.updated_at)

      // Wait a moment to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 100))

      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      const updatedProfile = await getProfile(admin, childProfile.id)
      const newUpdatedAt = new Date(updatedProfile.updated_at)
      expect(newUpdatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime())
    })
  })

  describe('Authorization and Permission Checks', () => {
    it('should return 401 when no session provided', async () => {
      const response = await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 403 when attempting to delete non-connected account', async () => {
      // Create another parent with no connection to child
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const otherParent = await createTestProfile(
        admin,
        `other-${uniqueSuffix}@example.com`,
        'Other Parent',
        5000
      )
      testUserIds.push(otherParent.id)
      const otherAccessToken = await signInAsUser(otherParent.email)

      const response = await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${otherAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe("You don't have permission to delete this account")
    })

    it('should return 400 when attempting to delete non-child account (missing @ganamos.app)', async () => {
      // Try to delete parent account (doesn't have @ganamos.app email)
      const response = await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: parentProfile.id }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('This is not a child account and cannot be deleted')
    })

    it('should return 400 when childAccountId is missing', async () => {
      const response = await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({}),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Child account ID is required')
    })

    it('should return 404 when child account profile not found', async () => {
      const fakeChildId = '00000000-0000-0000-0000-000000000000'

      const response = await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: fakeChildId }),
      })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Child account profile not found')
    })
  })

  describe('Idempotency and Edge Cases', () => {
    it('should return 400 when attempting to delete already deleted account', async () => {
      // First deletion
      const firstResponse = await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      expect(firstResponse.status).toBe(200)

      // Second deletion attempt
      const secondResponse = await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      expect(secondResponse.status).toBe(400)
      const data = await secondResponse.json()
      expect(data.error).toBe('Account is already deleted')
    })

    it('should handle child account with zero balance', async () => {
      // Create child with zero balance
      const result = await createChildAccount(admin, parentProfile.id, 'Zero Balance Child', 0)
      testUserIds.push(result.child.id)

      const response = await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: result.child.id }),
      })

      expect(response.status).toBe(200)

      const profile = await getProfile(admin, result.child.id)
      expect(profile.status).toBe('deleted')
      expect(profile.balance).toBe(0)
    })

    it('should handle child account with no transactions', async () => {
      // Create child with no transactions
      const result = await createChildAccount(admin, parentProfile.id, 'No Transactions Child', 1000)
      testUserIds.push(result.child.id)

      const response = await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: result.child.id }),
      })

      expect(response.status).toBe(200)

      const transactions = await getTransactions(admin, result.child.id)
      expect(transactions).toHaveLength(0)

      const profile = await getProfile(admin, result.child.id)
      expect(profile.status).toBe('deleted')
    })

    it('should handle child account with no activities', async () => {
      // Create child with no activities
      const result = await createChildAccount(admin, parentProfile.id, 'No Activities Child', 1000)
      testUserIds.push(result.child.id)

      const response = await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: result.child.id }),
      })

      expect(response.status).toBe(200)

      const activities = await getActivities(admin, result.child.id)
      expect(activities).toHaveLength(0)

      const profile = await getProfile(admin, result.child.id)
      expect(profile.status).toBe('deleted')
    })
  })

  describe('Balance Integrity and Orphan Prevention', () => {
    it('should not create orphaned transactions after deletion', async () => {
      // Create transactions
      await createTestTransactions(admin, childProfile.id, [
        { type: 'deposit', amount: 2000 },
        { type: 'withdrawal', amount: 500 },
      ])

      // Soft delete
      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      // Verify transactions still reference valid user_id
      const transactions = await getTransactions(admin, childProfile.id)
      expect(transactions.length).toBeGreaterThan(0)

      transactions.forEach((tx) => {
        expect(tx.user_id).toBe(childProfile.id)
      })

      // Verify profile still exists (foreign key remains valid)
      const profile = await getProfile(admin, childProfile.id)
      expect(profile.id).toBe(childProfile.id)
    })

    it('should maintain accurate balance calculation from preserved transactions', async () => {
      // Create known transactions
      await createTestTransactions(admin, childProfile.id, [
        { type: 'deposit', amount: 3000 },
        { type: 'withdrawal', amount: 1000 },
        { type: 'internal', amount: 500 },
      ])

      const expectedBalance = 3000 - 1000 + 500 // 2500

      // Soft delete
      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      // Calculate balance from transactions
      const calculatedBalance = await calculateBalanceFromTransactions(admin, childProfile.id)
      expect(calculatedBalance).toBe(expectedBalance)
    })

    it('should not affect parent account balance', async () => {
      const originalParentProfile = await getProfile(admin, parentProfile.id)
      const originalParentBalance = originalParentProfile.balance

      // Soft delete child
      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      // Verify parent balance unchanged
      const updatedParentProfile = await getProfile(admin, parentProfile.id)
      expect(updatedParentProfile.balance).toBe(originalParentBalance)
    })

    it('should preserve balance field on soft-deleted profile', async () => {
      const originalBalance = childProfile.balance

      // Soft delete
      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      // Verify balance field unchanged
      const profile = await getProfile(admin, childProfile.id)
      expect(profile.balance).toBe(originalBalance)
    })
  })

  describe('RLS Policy Enforcement (Downstream System Respect)', () => {
    it('should filter deleted profiles from authenticated user queries', async () => {
      // Soft delete child
      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      // Query as authenticated parent (subject to RLS)
      const userClient = createUserClient(parentAccessToken)
      const { data: profiles, error } = await userClient
        .from('profiles')
        .select('*')
        .neq('status', 'deleted')

      expect(error).toBeNull()
      expect(profiles).toBeTruthy()

      // Verify deleted child not in results
      const deletedChildFound = profiles?.some((p) => p.id === childProfile.id)
      expect(deletedChildFound).toBe(false)

      // Verify parent still in results
      const parentFound = profiles?.some((p) => p.id === parentProfile.id)
      expect(parentFound).toBe(true)
    })

    it('should allow admin client to view deleted profiles (RLS bypass)', async () => {
      // Soft delete child
      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      // Query as admin (bypasses RLS)
      const { data: profiles, error } = await admin
        .from('profiles')
        .select('*')
        .eq('status', 'deleted')

      expect(error).toBeNull()
      expect(profiles).toBeTruthy()

      // Verify deleted child is in results
      const deletedChild = profiles?.find((p) => p.id === childProfile.id)
      expect(deletedChild).toBeTruthy()
      expect(deletedChild?.status).toBe('deleted')
    })

    it('should enforce activities RLS after soft delete', async () => {
      // Create activities for child
      await createTestActivities(admin, childProfile.id, 3)

      // Get child access token before deletion
      const childAccessToken = await signInAsUser(childProfile.email)

      // Soft delete child
      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      // Query activities as child (should be filtered by RLS based on auth.uid())
      const childClient = createUserClient(childAccessToken)
      const { data: childActivities } = await childClient
        .from('activities')
        .select('*')
        .eq('user_id', childProfile.id)

      // Child can still see their own activities (RLS checks auth.uid() = user_id, not status)
      expect(childActivities).toBeTruthy()
      expect(childActivities?.length).toBe(3)

      // Parent should NOT see child activities (different user_id)
      const parentClient = createUserClient(parentAccessToken)
      const { data: parentViewOfChildActivities } = await parentClient
        .from('activities')
        .select('*')
        .eq('user_id', childProfile.id)

      // RLS policy 'auth.uid() = user_id' will filter these out for parent
      expect(parentViewOfChildActivities).toHaveLength(0)
    })

    it('should maintain transaction RLS with connected accounts after deletion', async () => {
      // Create transactions for child
      await createTestTransactions(admin, childProfile.id, [
        { type: 'deposit', amount: 1000 },
      ])

      // Soft delete child
      await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      // NOTE: Connection is hard-deleted, so parent can no longer access child transactions via RLS
      const parentClient = createUserClient(parentAccessToken)
      const { data: parentViewOfChildTransactions } = await parentClient
        .from('transactions')
        .select('*')
        .eq('user_id', childProfile.id)

      // After connection deletion, RLS should filter these out for parent
      expect(parentViewOfChildTransactions).toHaveLength(0)

      // Admin can still see transactions (bypasses RLS)
      const adminTransactions = await getTransactions(admin, childProfile.id)
      expect(adminTransactions.length).toBeGreaterThan(0)
    })
  })

  describe('Response Format and Success Messages', () => {
    it('should return success response with preservation note', async () => {
      const response = await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data).toMatchObject({
        success: true,
        message: 'Child account deleted successfully',
        note: 'Account data is preserved and can be restored if needed',
      })
    })

    it('should return JSON content type', async () => {
      const response = await fetch('http://localhost:3000/api/soft-delete-child-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${parentAccessToken}`,
        },
        body: JSON.stringify({ childAccountId: childProfile.id }),
      })

      const contentType = response.headers.get('content-type')
      expect(contentType).toContain('application/json')
    })
  })
})