import { NextRequest, NextResponse } from "next/server"
import { isAuthorizedCronRequest } from "@/lib/cron-auth"
import { createServerSupabaseClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"

/**
 * Every 5 minutes (vercel.json): apply timeouts to live game rooms, so a room
 * nobody polls any more still ends. Expired open rooms and unfinished live
 * games return every bet; a missed turn counts as 0 and play moves on.
 * Rooms are also ticked whenever a device reads them, so this is a backstop.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_API_KEY) {
    return NextResponse.json({ error: "Database configuration missing" }, { status: 500 })
  }
  const supabase = createServerSupabaseClient({ supabaseKey: process.env.SUPABASE_SECRET_API_KEY })
  const { data, error } = await supabase.rpc("game_rooms_sweep")
  if (error) {
    console.error("[sweep-game-rooms] failed:", error.message)
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 })
  }
  return NextResponse.json({ success: true, checked: data ?? 0 })
}
