/**
 * Creates a mock device for testing
 */
export function createMockDevice(overrides: Partial<{
  id: string
  user_id: string
  pairing_code: string
  pet_name: string
  pet_type: 'cat' | 'dog' | 'rabbit' | 'squirrel' | 'turtle'
  status: 'paired' | 'disconnected' | 'offline'
  last_seen_at: string
  created_at: string
  updated_at: string
}> = {}) {
  const now = new Date().toISOString()
  return {
    id: overrides.id || 'device-1',
    user_id: overrides.user_id || 'test-user-id',
    pairing_code: overrides.pairing_code || 'ABC123',
    pet_name: overrides.pet_name || 'Fluffy',
    pet_type: overrides.pet_type || 'cat',
    status: overrides.status || 'paired',
    last_seen_at: overrides.last_seen_at || now,
    created_at: overrides.created_at || now,
    updated_at: overrides.updated_at || now,
  }
}

/**
 * Creates multiple mock devices with sequential IDs
 */
export function createMockDevices(count: number, baseOverrides: Parameters<typeof createMockDevice>[0] = {}) {
  return Array.from({ length: count }, (_, i) => 
    createMockDevice({
      ...baseOverrides,
      id: `device-${i + 1}`,
      pairing_code: `CODE${i + 1}`,
      pet_name: `Pet ${i + 1}`,
      created_at: new Date(Date.now() - i * 1000).toISOString(), // Stagger creation times
    })
  )
}

/**
 * Creates a mock connected account relationship
 */
export function createMockConnection(overrides: Partial<{
  id: string
  primary_user_id: string
  connected_user_id: string
  created_at: string
  updated_at: string
}> = {}) {
  const now = new Date().toISOString()
  return {
    id: overrides.id || 'connection-1',
    primary_user_id: overrides.primary_user_id || 'primary-user-id',
    connected_user_id: overrides.connected_user_id || 'connected-user-id',
    created_at: overrides.created_at || now,
    updated_at: overrides.updated_at || now,
  }
}

/**
 * Creates a mock profile for testing
 */
export function createMockProfile(overrides: Partial<{
  id: string
  email: string
  name: string
  username: string
  avatar_url: string
  balance: number
  created_at: string
  updated_at: string
  fixed_issues_count: number
}> = {}) {
  const now = new Date().toISOString()
  return {
    id: overrides.id || 'profile-1',
    email: overrides.email || 'test@example.com',
    name: overrides.name || 'Test User',
    username: overrides.username || 'testuser',
    avatar_url: overrides.avatar_url || null,
    balance: overrides.balance || 0,
    created_at: overrides.created_at || now,
    updated_at: overrides.updated_at || now,
    fixed_issues_count: overrides.fixed_issues_count || 0,
  }
}