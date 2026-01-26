/**
 * Test isolation helpers for seeding data in real database tests.
 *
 * All data created via these helpers is:
 * 1. Committed immediately (so Supabase REST API can see it)
 * 2. Tracked for cleanup in afterEach
 */
import { getPool, trackUser, trackDevice, trackConnection } from '../../setup-db'

/**
 * Seed a test user (creates auth.users + profiles entries).
 * Returns the user ID and email for use in tests.
 */
export async function seedUser(
  overrides: {
    id?: string
    email?: string
    name?: string
    username?: string
    balance?: number
    petCoins?: number
  } = {}
) {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const id = overrides.id || crypto.randomUUID()
    const email = overrides.email || `test-${id.slice(0, 8)}@test.local`
    const name = overrides.name || 'Test User'
    const username = overrides.username || `user_${id.slice(0, 8)}`
    const balance = overrides.balance ?? 1000
    const petCoins = overrides.petCoins ?? balance // Default pet_coins to same as balance

    // Insert into auth.users
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
        $3::jsonb,
        now(), now()
      )
    `,
      [id, email, JSON.stringify({ name })]
    )

    // Insert into auth.identities
    await client.query(
      `
      INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(), $1::uuid, $2::text,
        jsonb_build_object('sub', $1::text, 'email', $2::text),
        'email', now(), now(), now()
      )
    `,
      [id, email]
    )

    // Insert into profiles
    await client.query(
      `
      INSERT INTO profiles (id, email, name, username, balance, pet_coins)
      VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::int, $6::int)
    `,
      [id, email, name, username, balance, petCoins]
    )

    // Track for cleanup
    trackUser(id)

    return { id, email, name, username, balance, petCoins }
  } finally {
    client.release()
  }
}

/**
 * Seed a test device for a user.
 * Returns the device ID for use in tests.
 */
export async function seedDevice(
  userId: string,
  overrides: {
    id?: string
    pairingCode?: string
    petName?: string
    petType?: string
    status?: string
    coins?: number
  } = {}
) {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const id = overrides.id || crypto.randomUUID()
    const pairingCode = overrides.pairingCode || `TEST-${id.slice(0, 6).toUpperCase()}`
    const petName = overrides.petName || 'TestPet'
    const petType = overrides.petType || 'cat'
    const status = overrides.status || 'paired'
    const coins = overrides.coins ?? 0

    await client.query(
      `
      INSERT INTO devices (id, user_id, pairing_code, pet_name, pet_type, status, coins)
      VALUES ($1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text, $7::integer)
    `,
      [id, userId, pairingCode, petName, petType, status, coins]
    )

    // Track for cleanup
    trackDevice(id)

    return { id, pairingCode, petName, petType, status, coins }
  } finally {
    client.release()
  }
}

/**
 * Seed a connected account relationship between parent and child.
 */
export async function seedConnectedAccount(primaryUserId: string, connectedUserId: string) {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const id = crypto.randomUUID()

    await client.query(
      `
      INSERT INTO connected_accounts (id, primary_user_id, connected_user_id)
      VALUES ($1::uuid, $2::uuid, $3::uuid)
    `,
      [id, primaryUserId, connectedUserId]
    )

    // Track for cleanup
    trackConnection(id)

    return { id }
  } finally {
    client.release()
  }
}

/**
 * Execute a raw SQL query.
 * Use for custom setup or assertions not covered by other helpers.
 */
export async function queryDB<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

/**
 * Get a single row from the database.
 * Throws if no rows found.
 */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T> {
  const rows = await queryDB<T>(sql, params)
  if (rows.length === 0) {
    throw new Error(`Expected 1 row, got 0 for query: ${sql}`)
  }
  return rows[0]
}

/**
 * Seed a game score for testing leaderboard functionality.
 * Returns the ID of the created score entry.
 */
export async function seedGameScore(
  deviceId: string,
  userId: string,
  score: number
): Promise<string> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    const result = await client.query(
      `INSERT INTO flappy_bird_game (device_id, user_id, score)
       VALUES ($1::uuid, $2::uuid, $3::int)
       RETURNING id`,
      [deviceId, userId, score]
    )
    const id = result.rows[0].id
    // Note: We don't track game scores for cleanup as they cascade delete with devices
    return id
  } finally {
    client.release()
  }
}
