import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/system/signups-enabled
 * 
 * Checks if user signups are currently enabled.
 * Used by the register page to determine if signups should be allowed.
 * 
 * Returns: { enabled: boolean }
 */
export async function GET() {
  try {
    // Use admin client to bypass RLS and check setting
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })
    
    const { data: settings } = await adminSupabase
      .from('system_settings')
      .select('signups_enabled')
      .eq('id', 'main')
      .single()
    
    // Default to enabled if setting doesn't exist (for initial setup)
    const signupsEnabled = settings?.signups_enabled !== false
    
    return NextResponse.json({ enabled: signupsEnabled })
  } catch (error) {
    console.error('Error checking signup status:', error)
    // Default to enabled on error to avoid blocking signups if there's a database issue
    return NextResponse.json({ enabled: true })
  }
}
