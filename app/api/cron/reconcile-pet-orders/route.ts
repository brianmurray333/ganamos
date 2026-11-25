import { NextRequest, NextResponse } from "next/server"
import { isAuthorizedCronRequest } from "@/lib/cron-auth"
import { createServerSupabaseClient } from "@/lib/supabase"
import { reconcilePendingPetOrders } from "@/lib/pet-orders"

export const dynamic = "force-dynamic"

/**
 * Every 5 minutes (vercel.json): check pending Satoshi Pet orders against the
 * node, so an order is recorded as paid (and the emails go out) even when the
 * buyer closed the payment page. Read-only against the node.
 *
 * Default scope: pending orders whose invoice is open or expired within the
 * last hour (orders from the last ~2 hours). An operator can widen it once,
 * e.g. to sweep older pending orders: ?expiredWithinHours=720
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_API_KEY) {
    console.error("Supabase configuration missing")
    return NextResponse.json({ error: "Database configuration missing" }, { status: 500 })
  }

  const param = Number(request.nextUrl.searchParams.get("expiredWithinHours"))
  const expiredWithinHours = Number.isFinite(param) && param > 0 ? Math.min(param, 24 * 90) : 1

  try {
    const supabase = createServerSupabaseClient({ supabaseKey: process.env.SUPABASE_SECRET_API_KEY })
    const summary = await reconcilePendingPetOrders(supabase, { expiredWithinHours })
    if (summary.checked > 0) console.log("[reconcile-pet-orders]", summary)
    return NextResponse.json({ success: true, ...summary })
  } catch (error) {
    console.error("Error in reconcile-pet-orders cron:", error)
    return NextResponse.json({ error: "Failed to reconcile pet orders" }, { status: 500 })
  }
}
