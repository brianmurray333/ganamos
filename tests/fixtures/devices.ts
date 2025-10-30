/**
 * Device Test Fixtures
 *
 * Factory functions for creating mock device data in tests.
 * Follows the database schema from scripts/create-devices-table.sql
 */

export interface MockDevice {
  id: string;
  user_id: string;
  pairing_code: string;
  pet_name: string;
  pet_type: "cat" | "dog" | "rabbit" | "squirrel" | "turtle";
  status: "paired" | "disconnected" | "offline";
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface MockUser {
  id: string;
  email: string;
}

/**
 * Create a mock device with optional overrides
 */
export function createMockDevice(overrides?: Partial<MockDevice>): MockDevice {
  const now = new Date().toISOString();
  return {
    id: "device-123",
    user_id: "user-456",
    pairing_code: "ABC123",
    pet_name: "Fluffy",
    pet_type: "cat",
    status: "paired",
    last_seen_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/**
 * Create a mock authenticated user
 */
export function createMockUser(overrides?: Partial<MockUser>): MockUser {
  return {
    id: "user-456",
    email: "test@example.com",
    ...overrides,
  };
}

/**
 * Valid pet types enum matching database CHECK constraint
 */
export const VALID_PET_TYPES = [
  "cat",
  "dog",
  "rabbit",
  "squirrel",
  "turtle",
] as const;

/**
 * Create multiple devices for testing ownership scenarios
 */
export function createDeviceCollection(
  userId: string,
  count: number = 3
): MockDevice[] {
  return Array.from({ length: count }, (_, i) =>
    createMockDevice({
      id: `device-${i + 1}`,
      user_id: userId,
      pet_name: `Pet ${i + 1}`,
      pairing_code: `CODE${i + 1}`,
    })
  );
}
