import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  throw new Error('Missing required environment variables for integration tests')
}

/**
 * Create an admin Supabase client that bypasses RLS policies
 */
export function createAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Create a user-context Supabase client subject to RLS policies
 */
export function createUserClient(accessToken?: string): SupabaseClient {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  if (accessToken) {
    client.auth.setSession({
      access_token: accessToken,
      refresh_token: 'dummy-refresh-token',
    })
  }

  return client
}

/**
 * Test data interfaces
 */
export interface TestProfile {
  id: string
  email: string
  name: string
  balance: number
  status?: string
}

export interface TestConnection {
  id: string
  primary_user_id: string
  connected_user_id: string
}

export interface TestTransaction {
  id: string
  user_id: string
  type: 'deposit' | 'withdrawal' | 'internal'
  amount: number
  status: 'completed'
}

export interface TestActivity {
  id: string
  user_id: string
  action_type: string
  description: string
}

/**
 * Create a test profile with auth user
 */
export async function createTestProfile(
  admin: SupabaseClient,
  email: string,
  name: string,
  balance: number = 0
): Promise<TestProfile> {
  // Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-12345',
    email_confirm: true,
  })

  if (authError) throw new Error(`Failed to create auth user: ${authError.message}`)

  // Create profile
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .insert({
      id: authData.user.id,
      email,
      name,
      balance,
      status: 'active',
    })
    .select()
    .single()

  if (profileError) throw new Error(`Failed to create profile: ${profileError.message}`)

  return profile
}

/**
 * Create a child account with @ganamos.app email
 */
export async function createChildAccount(
  admin: SupabaseClient,
  parentId: string,
  childName: string,
  balance: number = 0
): Promise<{ child: TestProfile; connection: TestConnection }> {
  const childEmail = `${childName.toLowerCase().replace(/\s+/g, '')}@ganamos.app`

  // Create child profile
  const child = await createTestProfile(admin, childEmail, childName, balance)

  // Create connection
  const { data: connection, error: connectionError } = await admin
    .from('connected_accounts')
    .insert({
      primary_user_id: parentId,
      connected_user_id: child.id,
    })
    .select()
    .single()

  if (connectionError) throw new Error(`Failed to create connection: ${connectionError.message}`)

  return { child, connection }
}

/**
 * Create test transactions for a user
 */
export async function createTestTransactions(
  admin: SupabaseClient,
  userId: string,
  transactions: Array<{ type: 'deposit' | 'withdrawal' | 'internal'; amount: number }>
): Promise<TestTransaction[]> {
  const { data, error } = await admin
    .from('transactions')
    .insert(
      transactions.map((tx) => ({
        user_id: userId,
        type: tx.type,
        amount: tx.amount,
        status: 'completed',
      }))
    )
    .select()

  if (error) throw new Error(`Failed to create transactions: ${error.message}`)

  return data
}

/**
 * Create test activities for a user
 */
export async function createTestActivities(
  admin: SupabaseClient,
  userId: string,
  count: number = 3
): Promise<TestActivity[]> {
  const activities = Array.from({ length: count }, (_, i) => ({
    user_id: userId,
    action_type: 'test_action',
    description: `Test activity ${i + 1}`,
  }))

  const { data, error } = await admin.from('activities').insert(activities).select()

  if (error) throw new Error(`Failed to create activities: ${error.message}`)

  return data
}

/**
 * Calculate balance from transactions
 */
export async function calculateBalanceFromTransactions(
  admin: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: transactions, error } = await admin
    .from('transactions')
    .select('type, amount')
    .eq('user_id', userId)
    .eq('status', 'completed')

  if (error) throw new Error(`Failed to fetch transactions: ${error.message}`)

  return transactions.reduce((balance, tx) => {
    if (tx.type === 'deposit' || tx.type === 'internal') {
      return balance + tx.amount
    } else if (tx.type === 'withdrawal') {
      return balance - tx.amount
    }
    return balance
  }, 0)
}

/**
 * Get profile by ID (bypasses RLS)
 */
export async function getProfile(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) throw error

  return data
}

/**
 * Check if connection exists
 */
export async function connectionExists(
  admin: SupabaseClient,
  primaryUserId: string,
  connectedUserId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('connected_accounts')
    .select('id')
    .eq('primary_user_id', primaryUserId)
    .eq('connected_user_id', connectedUserId)
    .maybeSingle()

  if (error) throw error

  return data !== null
}

/**
 * Get activities for a user (bypasses RLS)
 */
export async function getActivities(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from('activities')
    .select('*')
    .eq('user_id', userId)

  if (error) throw error

  return data
}

/**
 * Get transactions for a user (bypasses RLS)
 */
export async function getTransactions(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from('transactions')
    .select('*')
    .eq('user_id', userId)

  if (error) throw error

  return data
}

/**
 * Cleanup test data
 */
export async function cleanupTestData(admin: SupabaseClient, userIds: string[]) {
  if (userIds.length === 0) return

  try {
    // Delete in reverse dependency order
    await admin.from('activities').delete().in('user_id', userIds)
    await admin.from('transactions').delete().in('user_id', userIds)
    await admin.from('connected_accounts').delete().in('connected_user_id', userIds)
    await admin.from('connected_accounts').delete().in('primary_user_id', userIds)
    await admin.from('profiles').delete().in('id', userIds)

    // Delete auth users - individually to avoid partial failures
    for (const userId of userIds) {
      try {
        await admin.auth.admin.deleteUser(userId)
      } catch (error) {
        // Ignore errors if user already deleted
        console.warn(`Failed to delete auth user ${userId}:`, error)
      }
    }
  } catch (error) {
    console.error('Error during cleanup:', error)
    // Don't throw - allow tests to continue
  }
}

/**
 * Sign in as a user and get access token
 */
export async function signInAsUser(
  email: string,
  password: string = 'test-password-12345'
): Promise<string> {
  const client = createClient(SUPABASE_URL, ANON_KEY)

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw new Error(`Failed to sign in: ${error.message}`)
  if (!data.session) throw new Error('No session returned after sign in')

  return data.session.access_token
}