// Import the createServerSupabaseClient function
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { createServerSupabaseClient } from "@/lib/supabase" // Add this import
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

/**
 * Generate a unique username by checking for existing usernames and appending a suffix if needed
 */
async function generateUniqueUsername(supabase: any, baseName: string): Promise<string> {
  // Generate base username from display name
  const baseUsername = baseName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .substring(0, 16) // Leave room for suffix

  // Check if base username exists
  const { data: existing } = await supabase
    .from("profiles")
    .select("username")
    .eq("username", baseUsername)
    .maybeSingle()

  if (!existing) {
    return baseUsername
  }

  // Username exists, find a unique one by appending random suffix
  for (let i = 0; i < 10; i++) {
    const suffix = Math.random().toString(36).substring(2, 6) // 4 character random suffix
    const candidateUsername = `${baseUsername}-${suffix}`
    
    const { data: existingCandidate } = await supabase
      .from("profiles")
      .select("username")
      .eq("username", candidateUsername)
      .maybeSingle()
    
    if (!existingCandidate) {
      return candidateUsername
    }
  }

  // Fallback: use UUID-based username
  return `${baseUsername}-${uuidv4().substring(0, 8)}`
}

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

    // Generate a unique email for the child account
    const childId = uuidv4()
    const childEmail = `child-${childId}@ganamos.app`

    // Create a random password (it won't be used for login)
    const password = uuidv4()

    // Create a separate admin client with service role for admin operations
    const adminSupabase = createServerSupabaseClient()

    // Always create a new auth user for each child account
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

    const childUserId = adminData.user.id

    // Generate a unique username (handles collisions)
    const uniqueUsername = await generateUniqueUsername(supabase, username)

    // Check if a profile already exists for this user (could be created by a trigger)
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", childUserId)
      .maybeSingle()

    let profileError: any = null

    if (existingProfile) {
      // Profile already exists (created by trigger), update it with our data
      const { error } = await adminSupabase.from("profiles").update({
        name: username,
        username: uniqueUsername,
        email: childEmail,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      }).eq("id", childUserId)
      profileError = error
    } else {
      // Profile doesn't exist, create it
      // Use admin client to bypass RLS for child profile creation
      const { error } = await adminSupabase.from("profiles").insert({
        id: childUserId,
        name: username,
        username: uniqueUsername,
        email: childEmail,
        avatar_url: avatarUrl,
        balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      profileError = error
    }

    if (profileError) {
      console.error("Error creating child profile:", profileError)
      // Clean up: delete the auth user since profile creation failed
      await adminSupabase.auth.admin.deleteUser(childUserId)
      return NextResponse.json({ error: `Error creating child profile: ${profileError.message}` }, { status: 500 })
    }

    // Check if connection already exists before creating it
    const { data: existingConnection } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("primary_user_id", primaryUserId)
      .eq("connected_user_id", childUserId)
      .single()

    if (!existingConnection) {
      // Create the connection between primary user and child account
      // Use adminSupabase to bypass restrictive RLS policy (only service_role can insert)
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
