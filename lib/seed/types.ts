/**
 * Shared type definitions for mock seed data generation
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Service role Supabase client type for RLS bypass operations
 */
export type ServiceRoleClient = SupabaseClient;

/**
 * Base seed result with count and optional data
 */
export interface SeedResult<T = unknown> {
  count: number;
  data?: T[];
  error?: string;
}

/**
 * Post seed data with all required fields
 */
export interface SeedPost {
  id?: string;
  user_id: string;
  title: string;
  description: string;
  image_url: string;
  location: string;
  latitude: number;
  longitude: number;
  city: string;
  reward: number;
  original_reward: number;
  claimed: boolean;
  fixed: boolean;
  created_by: string;
  created_at: string;
  claimed_by?: string;
  claimed_at?: string;
  fixed_by?: string;
  fixed_at?: string;
  fixed_image_url?: string;
  fixer_note?: string;
  is_anonymous?: boolean;
  expires_at?: string | null;
  expiry_warning_sent_at?: string | null;
  under_review?: boolean;
}

/**
 * Transaction seed data
 */
export interface SeedTransaction {
  id?: string;
  user_id: string;
  type: 'deposit' | 'withdrawal' | 'internal';
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  memo?: string;
  created_at: string;
}

/**
 * Activity seed data
 */
export interface SeedActivity {
  id?: string;
  user_id: string;
  type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Device seed data
 */
export interface SeedDevice {
  id?: string;
  user_id: string;
  pairing_code: string;
  pet_name: string;
  pet_type: 'cat' | 'dog' | 'rabbit' | 'squirrel' | 'turtle';
  status: 'paired' | 'disconnected' | 'offline';
  created_at: string;
}

/**
 * Flappy bird game seed data
 */
export interface SeedGame {
  id?: string;
  device_id: string;
  user_id: string;
  score: number;
  created_at: string;
}

/**
 * Connected account seed data
 */
export interface SeedConnectedAccount {
  id?: string;
  primary_user_id: string;
  connected_user_id: string;
  created_at: string;
}

/**
 * Group membership seed data
 */
export interface SeedGroupMembership {
  id?: string;
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

/**
 * Pending fix seed data
 */
export interface SeedPendingFix {
  id?: string;
  post_id: string;
  fixer_id: string;
  fix_image_url: string;
  fixer_note: string;
  confidence_score?: number;
  ai_reasoning?: string;
  status?: string;
  created_at: string;
}

/**
 * Profile update data
 */
export interface ProfileUpdate {
  balance: number;
  pet_coins?: number;
  status?: string;
  updated_at: string;
}

/**
 * Orchestrator options
 */
export interface SeedOptions {
  force?: boolean; // Force re-seeding even if data exists
  skipIdempotencyCheck?: boolean; // Skip the idempotency check
}

/**
 * Seeding summary returned by orchestrator
 */
export interface SeedSummary {
  success: boolean;
  userId: string;
  skipped: boolean;
  counts: {
    posts: number;
    transactions: number;
    activities: number;
    devices: number;
    games: number;
    connectedAccounts: number;
    groupMemberships: number;
    pendingFixes: number;
  };
  errors?: string[];
}
