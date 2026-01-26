import { NextResponse } from "next/server"
import { checkInvoice } from "@/lib/lightning"
import { createServerSupabaseClient } from "@/lib/supabase"
import { serverEnv } from "@/lib/env"
import { cookies } from "next/headers"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // Require authentication
    const cookieStore = await cookies()
    const supabase = createServerSupabaseClient({ cookieStore })
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const rHash = searchParams.get('rHash')
    
    // Lightning config status
    const lightningConfig = {
      useMock: serverEnv?.lightning.useMock,
      isConfigured: serverEnv?.lightning.isConfigured,
      hasLndUrl: !!serverEnv?.lightning.lndRestUrl,
      hasMacaroon: !!serverEnv?.lightning.lndAdminMacaroon,
      lndUrlPrefix: serverEnv?.lightning.lndRestUrl?.substring(0, 30) + "...",
    }

    if (!rHash) {
      // Just return config status if no rHash provided
      return NextResponse.json({ 
        lightningConfig,
        message: "Add ?rHash=... to test invoice lookup"
      })
    }

    console.log("[DEBUG] Lightning config:", lightningConfig)
    console.log("[DEBUG] Checking invoice for rHash:", rHash)
    const result = await checkInvoice(rHash)
    console.log("[DEBUG] Invoice check result:", JSON.stringify(result, null, 2))

    return NextResponse.json({
      input: { rHash, rHashLength: rHash.length },
      lightningConfig,
      result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[DEBUG] Error:", error)
    return NextResponse.json({ 
      error: "Error checking invoice",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
