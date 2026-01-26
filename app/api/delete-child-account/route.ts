import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { createServerSupabaseClient } from "@/lib/supabase"

export async function POST(request: Request) {
  try {
    // Get the request body
    const body = await request.json()
    const { childAccountId } = body

    if (!childAccountId) {
      return NextResponse.json({ error: "Child account ID is required" }, { status: 400 })
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

    // Check if the child account belongs to this user
    const { data: connectionData, error: connectionError } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("primary_user_id", userId)
      .eq("connected_user_id", childAccountId)
      .single()

    if (connectionError || !connectionData) {
      return NextResponse.json({ error: "You don't have permission to delete this account" }, { status: 403 })
    }

    // Get the child account profile to verify it's a child account
    const { data: childProfile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", childAccountId)
      .single()

    if (profileError || !childProfile) {
      return NextResponse.json({ error: "Child account profile not found" }, { status: 404 })
    }

    // Verify this is actually a child account (email ends with @ganamos.app)
    if (!childProfile.email.endsWith("@ganamos.app")) {
      return NextResponse.json({ error: "This is not a child account and cannot be deleted" }, { status: 400 })
    }

    // Check if we have the service role key for admin operations
    if (!process.env.SUPABASE_SECRET_API_KEY) {
      console.error("SUPABASE_SECRET_API_KEY is not configured - cannot delete user from auth")
      return NextResponse.json({ error: "Server configuration error: Cannot delete auth user" }, { status: 500 })
    }

    // Create admin client for auth operations
    const adminSupabase = createServerSupabaseClient()

    // SOFT DELETE: Mark the profile as deleted instead of hard deleting
    const { error: softDeleteError } = await supabase
      .from("profiles")
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq("id", childAccountId)

    if (softDeleteError) {
      console.error("Error soft deleting profile:", softDeleteError)
      return NextResponse.json({ error: "Failed to delete profile" }, { status: 500 })
    }

    // Delete the connection (this is safe since it's just a relationship)
    const { error: deleteConnectionError } = await supabase
      .from("connected_accounts")
      .delete()
      .eq("id", connectionData.id)

    if (deleteConnectionError) {
      console.error("Error deleting connection:", deleteConnectionError)
      // Don't fail the request since the profile is already soft deleted
    }

    // Note: We do NOT delete the auth user - this preserves the ability to restore
    // and maintains referential integrity for transactions

    return NextResponse.json({ 
      success: true, 
      message: "Child account deleted successfully",
      note: "Account data is preserved and can be restored if needed"
    })
  } catch (error) {
    console.error("Error in delete-child-account route:", error)
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 })
  }
}
