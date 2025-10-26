import { v4 as uuidv4 } from 'uuid'
import type { Database } from '@/lib/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type ConnectedAccount = Database['public']['Tables']['connected_accounts']['Row']

/**
 * Test fixture for parent account
 */
export interface TestParentAccount {
  id: string
  email: string
  name: string
  username: string
  avatar_url: string
  balance: number
  created_at: string
  updated_at: string
  fixed_issues_count: number
}

/**
 * Test fixture for child account
 */
export interface TestChildAccount extends TestParentAccount {
  parent_id: string
  connection_id: string
}

/**
 * Extended profile with soft-delete fields (not in database.types.ts yet)
 */
export interface ExtendedProfile extends Profile {
  status?: 'active' | 'deleted' | 'suspended'
  deleted_at?: string | null
  deleted_by?: string | null
}

/**
 * Create a test parent account fixture
 */
export function createTestParentAccount(overrides: Partial<TestParentAccount> = {}): TestParentAccount {
  const id = uuidv4()
  return {
    id,
    email: `parent-${id.substring(0, 8)}@test.com`,
    name: 'Test Parent',
    username: `testparent${id.substring(0, 8)}`,
    avatar_url: '/images/avatars/default.png',
    balance: 10000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    fixed_issues_count: 0,
    ...overrides,
  }
}

/**
 * Create a test child account fixture
 */
export function createTestChildAccount(
  parentId: string,
  overrides: Partial<Omit<TestChildAccount, 'parent_id' | 'connection_id'>> = {}
): TestChildAccount {
  const id = uuidv4()
  const childId = id
  
  return {
    id: childId,
    email: `child-${childId}@ganamos.app`, // Critical: must end with @ganamos.app
    name: 'Test Child',
    username: `testchild${childId.substring(0, 8)}`,
    avatar_url: '/images/avatars/child-default.png',
    balance: 0, // Child accounts start with 0 balance
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    fixed_issues_count: 0,
    parent_id: parentId,
    connection_id: uuidv4(), // For connected_accounts record
    ...overrides,
  }
}

/**
 * Create a connected_accounts relationship fixture
 */
export function createConnectionFixture(
  primaryUserId: string,
  connectedUserId: string
): ConnectedAccount {
  return {
    id: uuidv4(),
    primary_user_id: primaryUserId,
    connected_user_id: connectedUserId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

/**
 * Create a complete parent-child relationship with connected account
 */
export function createParentChildFixture() {
  const parent = createTestParentAccount()
  const child = createTestChildAccount(parent.id)
  const connection = createConnectionFixture(parent.id, child.id)
  
  return {
    parent,
    child,
    connection,
  }
}

/**
 * Mock soft-deleted child account
 */
export function createDeletedChildAccount(
  parentId: string,
  deletedBy: string
): TestChildAccount & { status: 'deleted'; deleted_at: string; deleted_by: string } {
  const child = createTestChildAccount(parentId)
  return {
    ...child,
    status: 'deleted',
    deleted_at: new Date().toISOString(),
    deleted_by: deletedBy,
  }
}

/**
 * Mock non-child account (regular user account, not a child)
 */
export function createNonChildAccount(): TestParentAccount {
  return createTestParentAccount({
    email: `regular-user-${uuidv4().substring(0, 8)}@example.com`, // NOT @ganamos.app
    name: 'Regular User',
  })
}