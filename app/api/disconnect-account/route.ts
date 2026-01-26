import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"

export async function POST(request: Request) {
  try {
    // Get the request body
    const body = await request.json()
    const { connectedAccountId } = body

    if (!connectedAccountId) {
      return NextResponse.json({ error: "Connected account ID is required" }, { status: 400 })
    }

    // Get the user's session
    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id

    // Check if the connected account belongs to this user
    const { data: connectionData, error: connectionError } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("primary_user_id", userId)
      .eq("connected_user_id", connectedAccountId)
      .single()

    if (connectionError || !connectionData) {
      return NextResponse.json({ error: "You don't have permission to disconnect this account" }, { status: 403 })
    }

    // Delete the connection
    const { error: deleteError } = await supabase.from("connected_accounts").delete().eq("id", connectionData.id)

    if (deleteError) {
      console.error("Error disconnecting account:", deleteError)
      return NextResponse.json({ error: "Failed to disconnect account" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Account disconnected successfully" })
  } catch (error) {
    console.error("Error in disconnect-account route:", error)
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 })
  }
}
