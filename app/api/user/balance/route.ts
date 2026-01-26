import { createServerSupabaseClient } from "@/lib/supabase"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = createServerSupabaseClient()

  // Get the current user
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
  }

  // Get the user's balance
  const { data: profile, error } = await supabase.from("profiles").select("balance").eq("id", session.user.id).single()

  if (error) {
    console.error("Error fetching balance:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch balance" }, { status: 500 })
  }

  return NextResponse.json({ success: true, balance: profile.balance })
}
