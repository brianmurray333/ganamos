/**
 * Constants for mock seed data generation
 */

/**
 * Mock user ID for test@ganamos.dev from seed.sql
 */
export const MOCK_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

/**
 * Mock user display name
 */
export const MOCK_USER_NAME = 'Test User';

/**
 * Mock user username
 */
export const MOCK_USERNAME = 'testuser';

/**
 * Target quantities for seeded entities (from acceptance criteria)
 */
export const SEED_QUANTITIES = {
  POSTS: 12,
  ACTIVITIES: 10,
  TRANSACTIONS: 7,
  DEVICES: 1,
  GAMES: 1,
  CONNECTED_ACCOUNTS: 2,
  GROUP_MEMBERSHIPS: 1,
  PENDING_FIXES: 3,
} as const;

/**
 * Realistic post titles for variety
 */
export const POST_TITLES = [
  'Pothole on Main Street',
  'Graffiti on Community Center',
  'Broken Bench at Park',
  'Litter in Playground Area',
  'Damaged Sidewalk Near School',
  'Streetlight Out on Oak Avenue',
  'Fallen Tree Branch Blocking Path',
  'Vandalized Bus Stop Shelter',
  'Overgrown Weeds in Public Garden',
  'Cracked Pavement at Intersection',
  'Broken Swing Set at Playground',
  'Faded Crosswalk Markings',
] as const;

/**
 * Post descriptions with varied detail
 */
export const POST_DESCRIPTIONS = [
  'This needs immediate attention for public safety.',
  'Has been an issue for several weeks now.',
  'Causing problems for pedestrians and vehicles.',
  'Children use this area frequently - safety concern.',
  'Multiple community members have complained.',
  'Weather damage has made this worse over time.',
  'Easy fix but needs someone to take action.',
  'Before and after photos will show clear improvement.',
  'Part of ongoing neighborhood improvement efforts.',
  'Would make a big difference to local residents.',
  'Quick repair could prevent larger damage later.',
  'Community volunteers could help with this.',
] as const;

/**
 * Cities for location variety
 */
export const CITIES = [
  { name: 'Austin', lat: 30.2672, lng: -97.7431 },
  { name: 'New York', lat: 40.7128, lng: -74.0060 },
  { name: 'San Francisco', lat: 37.7749, lng: -122.4194 },
  { name: 'Miami', lat: 25.7617, lng: -80.1918 },
  { name: 'Chicago', lat: 41.8781, lng: -87.6298 },
  { name: 'Seattle', lat: 47.6062, lng: -122.3321 },
] as const;

/**
 * Pet names for devices
 */
export const PET_NAMES = [
  'Satoshi',
  'Luna',
  'Bolt',
  'Pixel',
  'Nala',
  'Max',
  'Charlie',
  'Bella',
] as const;

/**
 * Pet types available
 */
export const PET_TYPES = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle'] as const;

/**
 * Transaction memos for variety
 */
export const TRANSACTION_MEMOS = {
  DEPOSIT: [
    'Initial deposit',
    'Added funds from checking',
    'Bitcoin purchase deposit',
    'Weekly allowance deposit',
  ],
  INTERNAL: [
    'Reward for fixing pothole',
    'Reward for cleaning graffiti',
    'Reward for park bench repair',
    'Community improvement bonus',
  ],
  WITHDRAWAL: [
    'Withdrawal to external wallet',
    'Sent to family member',
    'Payment for services',
  ],
} as const;

/**
 * Activity types
 */
export const ACTIVITY_TYPES = {
  POST_CREATED: 'post_created',
  POST_FIXED: 'post_fixed',
  POST_CLAIMED: 'post_claimed',
  TRANSACTION: 'transaction',
  DEVICE_PAIRED: 'device_paired',
  GROUP_JOINED: 'group_joined',
} as const;

/**
 * Fixer notes for completed fixes
 */
export const FIXER_NOTES = [
  'Successfully repaired and cleaned the area.',
  'Used proper materials for lasting fix.',
  'Area looks much better now!',
  'Community members were very appreciative.',
  'Completed ahead of schedule.',
  'Before and after photos show clear improvement.',
] as const;

/**
 * Placeholder image URLs
 */
export const PLACEHOLDER_IMAGES = {
  POST: 'https://placehold.co/600x400/png?text=Issue',
  FIXED: 'https://placehold.co/600x400/png?text=Fixed',
  DEVICE: 'https://placehold.co/400x400/png?text=Pet',
} as const;

/**
 * Reward amounts in sats
 */
export const REWARD_AMOUNTS = [250, 300, 400, 500, 600, 750, 1000] as const;

/**
 * Transaction amounts in sats
 */
export const TRANSACTION_AMOUNTS = {
  DEPOSIT: [5000, 10000, 25000, 50000],
  INTERNAL: [250, 300, 400, 500, 600, 750, 1000],
  WITHDRAWAL: [1000, 2500, 5000, 10000],
} as const;

/**
 * Flappy bird scores for realism
 */
export const GAME_SCORES = [9, 12, 15, 18, 24, 30, 42] as const;

/**
 * Group IDs from seed.sql
 */
export const EXISTING_GROUP_IDS = [
  'a1111111-1111-1111-1111-111111111111', // Austin Community Clean-up
  'b2222222-2222-2222-2222-222222222222', // NYC Street Fixers
] as const;

/**
 * Test user IDs from seed.sql for connected accounts
 */
export const TEST_USER_IDS = [
  'b1ffcd00-ad1c-5fa9-cc7e-7cc0ce491b22', // Alice
  'c2aade11-be2d-6ab0-dd8f-8dd1df5a2c33', // Bob
  'd3bbef22-cf3e-7cd1-ee9a-9ee2ea6b3d44', // Charlie
] as const;