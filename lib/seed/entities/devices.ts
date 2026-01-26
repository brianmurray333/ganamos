/**
 * Device entity seeder for mock data generation
 */

import type { ServiceRoleClient, SeedDevice, SeedResult } from '../types';
import {
  MOCK_USER_ID,
  PET_NAMES,
  PET_TYPES,
  SEED_QUANTITIES,
} from '../constants';

/**
 * Generate device code (pairing code format)
 */
function generatePairingCode(): string {
  return `FLP${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
}

/**
 * Generate realistic device seed data
 * Note: devices.user_id has UNIQUE constraint - only 1 device per user
 */
function generateDeviceData(): SeedDevice {
  const now = new Date();
  const petName = PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)];
  const petType = PET_TYPES[Math.floor(Math.random() * PET_TYPES.length)];

  return {
    user_id: MOCK_USER_ID,
    pairing_code: generatePairingCode(),
    pet_name: petName,
    pet_type: petType,
    status: 'paired',
    created_at: now.toISOString(),
  };
}

/**
 * Seed device for mock user
 * Only creates 1 device due to UNIQUE constraint on user_id
 */
export async function seedDevices(
  serviceRole: ServiceRoleClient,
  userId: string
): Promise<SeedResult> {
  try {
    const device = generateDeviceData();

    const { data, error } = await serviceRole
      .from('devices')
      .insert([device])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to seed device: ${error.message}`);
    }

    return {
      count: 1,
      data: data ? [data] : [],
    };
  } catch (error) {
    return {
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error seeding device',
    };
  }
}