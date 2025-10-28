// Import the createServerSupabaseClient function
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { createServerSupabaseClient } from "@/lib/supabase" // Add this import
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

export async function POST(request: Request) {
  try {
    const { username, avatarUrl } = await request.json()

    // Validate input
    if (!username || !avatarUrl) {
      return NextResponse.json({ error: "Username and avatar are required" }, { status: 400 })
    }

    // Create a Supabase client with the user's session
    const supabase = createRouteHandlerClient({ cookies })

    // Get the current user to determine who is creating the child account
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const primaryUserId = session.user.id
    console.log('[DEBUG] Primary User ID:', primaryUserId)

    // Generate a unique email for the child account
    const childId = uuidv4()
    const childEmail = `child-${childId}@ganamos.app`
    console.log('[DEBUG] Child Email:', childEmail)

    // Create a random password (it won't be used for login)
    const password = uuidv4()

    // Create a separate admin client with service role for admin operations
    const adminSupabase = createServerSupabaseClient()

    // Check if a user with this email already exists (from a previous failed attempt)
    const { data: existingUsers } = await adminSupabase.auth.admin.listUsers({
      filter: `email eq '${childEmail}'`,
    })

    let childUserId

    // If user doesn't exist, create it
    if (!existingUsers || existingUsers.users.length === 0) {
      // Create the child user with admin API using the admin client
      const { data: adminData, error: adminError } = await adminSupabase.auth.admin.createUser({
        email: childEmail,
        password: password,
        email_confirm: true, // Skip email verification
        user_metadata: {
          name: username,
          avatar_url: avatarUrl,
          is_child_account: true,
          primary_user_id: primaryUserId,
        },
      })

      if (adminError) {
        console.error("Error creating child user:", adminError)
        return NextResponse.json({ error: `Error creating child account: ${adminError.message}` }, { status: 500 })
      }

      childUserId = adminData.user.id
      console.log('[DEBUG] Created new child user ID:', childUserId)
    } else {
      // User already exists, use the existing ID
      childUserId = existingUsers.users[0].id
      console.log('[DEBUG] Using existing child user ID:', childUserId)

      // Update the user metadata to ensure it's current
      await adminSupabase.auth.admin.updateUserById(childUserId, {
        user_metadata: {
          name: username,
          avatar_url: avatarUrl,
          is_child_account: true,
          primary_user_id: primaryUserId,
        },
      })
    }

    // Generate a user-friendly username from the display name
    // Convert to lowercase, replace spaces with hyphens, remove special characters
    const defaultUsername = username
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 20) // Limit to 20 characters

    // Use admin client to create profile (bypasses RLS)
    const { error: profileError } = await adminSupabase.from("profiles").upsert(
      {
        id: childUserId,
        name: username,
        username: defaultUsername,
        email: childEmail,
        avatar_url: avatarUrl,
        balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )

    if (profileError) {
      console.error("Error creating child profile:", profileError)
      return NextResponse.json({ error: `Error creating child profile: ${profileError.message}` }, { status: 500 })
    }

    // Check if connection already exists before creating it
    const { data: existingConnection } = await adminSupabase
      .from("connected_accounts")
      .select("*")
      .eq("primary_user_id", primaryUserId)
      .eq("connected_user_id", childUserId)
      .single()

    if (!existingConnection) {
      console.log('[DEBUG] Creating connection - Primary:', primaryUserId, 'Child:', childUserId)
      // Create the connection between primary user and child account using admin client
      const { error: connectionError } = await adminSupabase.from("connected_accounts").insert({
        primary_user_id: primaryUserId,
        connected_user_id: childUserId,
        created_at: new Date().toISOString(),
      })

      if (connectionError) {
        console.error("Error creating connection:", connectionError)
        // Note: We don't clean up here because the profile and user are valid
        return NextResponse.json({ error: `Error connecting accounts: ${connectionError.message}` }, { status: 500 })
      }
    }

    // Get the full profile to return
    const { data: childProfile } = await supabase.from("profiles").select("*").eq("id", childUserId).single()

    return NextResponse.json({
      success: true,
      message: "Child account created successfully",
      profile: childProfile,
    })
  } catch (error: any) {
    console.error("Unexpected error in child account creation:", error)
    return NextResponse.json({ error: `Unexpected error: ${error.message}` }, { status: 500 })
  }
}
