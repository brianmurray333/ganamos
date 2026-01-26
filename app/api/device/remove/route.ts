import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
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

    const body = await request.json()
    const { deviceId } = body

    if (!deviceId) {
      return NextResponse.json(
        {
          success: false,
          error: "Device ID is required",
        },
        { status: 400 }
      )
    }

    // Delete the device
    const { error: deleteError } = await supabase
      .from("devices")
      .delete()
      .eq("id", deviceId)
      .eq("user_id", user.id) // Ensure user owns this device

    if (deleteError) {
      console.error("Error deleting device:", deleteError)
      return NextResponse.json(
        {
          success: false,
          error: "Failed to remove device",
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Device unpaired successfully",
    })
  } catch (error) {
    console.error("Error in device remove API:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    )
  }
}

