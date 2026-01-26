import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      )
    }

    // Get activeUserId from query params (for viewing child accounts)
    const { searchParams } = new URL(request.url)
    const activeUserId = searchParams.get('activeUserId') || user.id

    // Verify the user has permission to view this account's devices
    // Allow if it's their own account OR if they're the primary user of a connected account
    if (activeUserId !== user.id) {
      const { data: connection } = await supabase
        .from('connected_accounts')
        .select('primary_user_id')
        .eq('connected_user_id', activeUserId)
        .eq('primary_user_id', user.id)
        .single()

      if (!connection) {
        return NextResponse.json(
          {
            success: false,
            error: "Unauthorized to view this account's devices",
          },
          { status: 403 }
        )
      }
    }

    // Get all devices for the active user (not the authenticated user)
    const { data: devices, error: devicesError } = await supabase
      .from("devices")
      .select("*")
      .eq("user_id", activeUserId)
      .order("created_at", { ascending: false })

    if (devicesError) {
      console.error("Error fetching devices:", devicesError)
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch devices",
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      devices: devices || [],
    })
  } catch (error) {
    console.error("Error in device list API:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    )
  }
}

