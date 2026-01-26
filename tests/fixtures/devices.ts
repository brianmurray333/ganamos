/**
 * Test fixtures for device-related tests
 * Provides mock device data matching the database schema
 */

export interface MockDevice {
  id: string
  user_id: string
  pairing_code: string
  pet_name: string
  pet_type: 'cat' | 'dog' | 'rabbit' | 'squirrel' | 'turtle' | 'owl'
  status: 'paired' | 'disconnected' | 'offline'
  last_seen_at: string
  created_at: string
  updated_at: string
}

export interface MockUser {
  id: string
  email: string
  aud: string
  role: string
}

/**
 * Valid authenticated user for testing
 */
export const mockAuthenticatedUser: MockUser = {
  id: 'user-123',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
}

/**
 * Different user for testing ownership validation
 */
export const mockOtherUser: MockUser = {
  id: 'user-456',
  email: 'other@example.com',
  aud: 'authenticated',
  role: 'authenticated',
}

/**
 * Valid device owned by mockAuthenticatedUser
 */
export const mockValidDevice: MockDevice = {
  id: 'device-123',
  user_id: 'user-123',
  pairing_code: 'ABC123',
  pet_name: 'Fluffy',
  pet_type: 'cat',
  status: 'paired',
  last_seen_at: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

/**
 * Device owned by a different user (for testing ownership validation)
 */
export const mockUnownedDevice: MockDevice = {
  id: 'device-456',
  user_id: 'user-456',
  pairing_code: 'XYZ789',
  pet_name: 'Buddy',
  pet_type: 'dog',
  status: 'paired',
  last_seen_at: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

/**
 * Factory function to create a mock device with overrides
 */
export function createMockDevice(overrides: Partial<MockDevice> = {}): MockDevice {
  return {
    ...mockValidDevice,
    ...overrides,
  }
}

/**
 * Valid pet types as defined in database schema
 */
export const validPetTypes = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle', 'owl'] as const

/**
 * Invalid pet type for validation testing
 */
export const invalidPetType = 'dragon'