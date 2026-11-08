import { isAuthorizedCronRequest } from "@/lib/cron-auth"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

/**
 * Check environment variables (for debugging)
 */
export async function GET(request: NextRequest) {
  try {
    // Only Vercel Cron (Bearer CRON_SECRET) or an operator with the secret
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const envCheck = {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SECRET_API_KEY: !!process.env.SUPABASE_SECRET_API_KEY,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      CRON_SECRET: !!process.env.CRON_SECRET,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: !!process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      USE_MOCKS: process.env.USE_MOCKS || 'not set',
      
      // Show URL prefix only (never log key prefixes - security risk)
      NEXT_PUBLIC_SUPABASE_URL_PREFIX: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30),
    }

    return NextResponse.json(envCheck)
  } catch (error) {
    console.error("Environment check error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
