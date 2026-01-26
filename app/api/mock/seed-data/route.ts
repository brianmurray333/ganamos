/**
 * Mock seed data generation API endpoint
 * 
 * POST /api/mock/seed-data
 * 
 * Guards:
 * - NODE_ENV !== 'production' (never runs in production)
 * - USE_MOCKS === 'true' (only in mock environments)
 * - User authentication required
 * 
 * Flow:
 * 1. Verify environment guards
 * 2. Authenticate user
 * 3. Create service role client for RLS bypass
 * 4. Orchestrate seeding via seedMockData()
 * 5. Return success/error response
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { seedMockData } from '@/lib/seed/mockData';

// Force dynamic rendering for fresh auth on every request
export const dynamic = 'force-dynamic';

/**
 * POST handler for seed data generation
 */
export async function POST(request: NextRequest) {
  try {
    // Production guard: NEVER run in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          success: false,
          error: 'Seed endpoint not available in production',
        },
        { status: 400 }
      );
    }

    // Mock environment guard: only run with USE_MOCKS enabled
    if (process.env.USE_MOCKS !== 'true') {
      return NextResponse.json(
        {
          success: false,
          error: 'Seed endpoint requires USE_MOCKS=true',
        },
        { status: 400 }
      );
    }

    // Authenticate user
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    // Create service role client for RLS bypass
    const serviceRole = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    if (!serviceRole) {
      return NextResponse.json(
        {
          success: false,
          error: 'Service role client initialization failed',
        },
        { status: 500 }
      );
    }

    // Orchestrate seed data generation
    console.log(`[Seed API] Starting seed for user ${user.id}...`);
    const summary = await seedMockData(user.id, serviceRole);

    if (!summary.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Seed data generation failed',
          details: summary.errors,
        },
        { status: 500 }
      );
    }

    if (summary.skipped) {
      return NextResponse.json(
        {
          success: true,
          message: 'Seed data already exists',
          skipped: true,
        },
        { status: 200 }
      );
    }

    // Success response with counts
    return NextResponse.json(
      {
        success: true,
        message: 'Seed data generated successfully',
        counts: summary.counts,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Seed API] Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}