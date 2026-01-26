/**
 * Setup file for real database integration tests.
 *
 * Uses per-test cleanup strategy:
 * - Data is committed so Supabase REST API can see it
 * - Each test tracks what it creates
 * - afterEach cleans up all test data
 *
 * This works with Supabase's PostgREST because data is actually committed.
 */
import { beforeAll, afterAll, afterEach } from 'vitest'
import { Pool } from 'pg'

// PostgreSQL connection for direct DB access
let pool: Pool

// Track data created during tests for cleanup
const createdUsers: string[] = []
const createdDevices: string[] = []
const createdConnections: string[] = []
const createdTransactions: string[] = []
const createdGameScores: string[] = []

export function trackUser(id: string) {
  createdUsers.push(id)
}

export function trackDevice(id: string) {
  createdDevices.push(id)
}

export function trackConnection(id: string) {
  createdConnections.push(id)
}

export function trackTransaction(id: string) {
  createdTransactions.push(id)
}

export function trackGameScore(id: string) {
  createdGameScores.push(id)
}

// Export pool for direct queries
export function getPool(): Pool {
  return pool
}

// Helper function for running SQL queries directly
// Returns the full query result with rows property for compatibility
export async function queryDB(sql: string, params?: any[]): Promise<{ rows: any[] }> {
  const client = await pool.connect()
  try {
    const result = await client.query(sql, params)
    return result
  } finally {
    client.release()
  }
}

// Local Supabase PostgreSQL connection config
const PG_CONFIG = {
  host: 'localhost',
  port: 54322, // Supabase local DB port
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
}

// Set environment variables for Supabase clients
// Use values from environment if provided (e.g., from CI), otherwise use default local Supabase keys
// The default keys are for the standard local Supabase setup (safe to commit)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
}
if (!process.env.SUPABASE_SECRET_API_KEY) {
  process.env.SUPABASE_SECRET_API_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
}
// JWT secret for Alexa token validation (same as Supabase JWT secret for local dev)
process.env.SUPABASE_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'
process.env.ALEXA_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'

beforeAll(async () => {
  try {
    pool = new Pool(PG_CONFIG)

    // Verify connection
    const testClient = await pool.connect()
    await testClient.query('SELECT 1')
    testClient.release()

    console.log('✓ Connected to local Supabase database')
  } catch (error) {
    console.error('✗ Failed to connect to local Supabase database')
    console.error('  Make sure Supabase is running: npm run supabase:start')
    throw error
  }
})

afterAll(async () => {
  if (pool) {
    await pool.end()
    console.log('✓ Disconnected from database')
  }
})

afterEach(async () => {
  // Clean up in reverse order of dependencies
  const client = await pool.connect()
  try {
    // Delete connected accounts first (references users)
    if (createdConnections.length > 0) {
      await client.query(`DELETE FROM connected_accounts WHERE id = ANY($1::uuid[])`, [
        createdConnections,
      ])
      createdConnections.length = 0
    }

    // Delete transactions for tracked users
    if (createdUsers.length > 0) {
      await client.query(`DELETE FROM transactions WHERE user_id = ANY($1::uuid[])`, [createdUsers])
    }

    // Delete specifically tracked transactions
    if (createdTransactions.length > 0) {
      await client.query(`DELETE FROM transactions WHERE id = ANY($1::uuid[])`, [
        createdTransactions,
      ])
      createdTransactions.length = 0
    }

    // Delete explicitly tracked game scores
    if (createdGameScores.length > 0) {
      await client.query(`DELETE FROM flappy_bird_game WHERE id = ANY($1::uuid[])`, [
        createdGameScores,
      ])
      createdGameScores.length = 0
    }

    // Delete game scores for tracked devices (FK to devices)
    if (createdUsers.length > 0) {
      await client.query(
        `DELETE FROM flappy_bird_game WHERE device_id IN (SELECT id FROM devices WHERE user_id = ANY($1::uuid[]))`,
        [createdUsers]
      )
    }

    // Delete ALL devices for tracked users (catches devices created via Supabase client too)
    if (createdUsers.length > 0) {
      await client.query(`DELETE FROM devices WHERE user_id = ANY($1::uuid[])`, [createdUsers])
    }

    // Also delete specifically tracked devices (in case they were for non-tracked users)
    if (createdDevices.length > 0) {
      await client.query(`DELETE FROM devices WHERE id = ANY($1::uuid[])`, [createdDevices])
      createdDevices.length = 0
    }

    // Delete activities for tracked users (references profiles)
    if (createdUsers.length > 0) {
      await client.query(`DELETE FROM activities WHERE user_id = ANY($1::uuid[])`, [createdUsers])
    }

    // Delete group_members before groups (FK to groups)
    if (createdUsers.length > 0) {
      await client.query(`DELETE FROM group_members WHERE user_id = ANY($1::uuid[])`, [createdUsers])
    }

    // Delete alexa linked accounts for tracked users (references profiles)
    if (createdUsers.length > 0) {
      await client.query(`DELETE FROM alexa_linked_accounts WHERE user_id = ANY($1::uuid[])`, [createdUsers])
    }

    // Delete alexa auth codes for tracked users (references profiles)
    if (createdUsers.length > 0) {
      await client.query(`DELETE FROM alexa_auth_codes WHERE user_id = ANY($1::uuid[])`, [createdUsers])
    }

    // Delete posts for tracked users (may have FK to groups)
    if (createdUsers.length > 0) {
      await client.query(`DELETE FROM posts WHERE user_id = ANY($1::uuid[])`, [createdUsers])
    }

    // Delete groups for tracked users (groups has FK to profiles.created_by)
    if (createdUsers.length > 0) {
      await client.query(`DELETE FROM groups WHERE created_by = ANY($1::uuid[])`, [createdUsers])
    }

    // Delete profiles (references auth.users)
    if (createdUsers.length > 0) {
      await client.query(`DELETE FROM profiles WHERE id = ANY($1::uuid[])`, [createdUsers])
    }

    // Delete auth.identities (references auth.users)
    if (createdUsers.length > 0) {
      await client.query(`DELETE FROM auth.identities WHERE user_id = ANY($1::uuid[])`, [
        createdUsers,
      ])
    }

    // Delete auth.users last
    if (createdUsers.length > 0) {
      await client.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [createdUsers])
      createdUsers.length = 0
    }
  } finally {
    client.release()
  }
})
