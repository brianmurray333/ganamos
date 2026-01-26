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
    const { deviceId, petName, petType } = body

    if (!deviceId || !petName || !petType) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields",
        },
        { status: 400 }
      )
    }

    // Validate pet type
    const validPetTypes = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle', 'owl']
    if (!validPetTypes.includes(petType)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid pet type",
        },
        { status: 400 }
      )
    }

    // Update the device
    const { data: device, error: updateError } = await supabase
      .from("devices")
      .update({
        pet_name: petName.trim(),
        pet_type: petType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", deviceId)
      .eq("user_id", user.id) // Ensure user owns this device
      .select()
      .single()

    if (updateError) {
      console.error("Error updating device:", updateError)
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update device",
        },
        { status: 500 }
      )
    }

    if (!device) {
      return NextResponse.json(
        {
          success: false,
          error: "Device not found or you don't have permission",
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      device,
      message: "Pet settings updated successfully",
    })
  } catch (error) {
    console.error("Error in device update API:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    )
  }
}

