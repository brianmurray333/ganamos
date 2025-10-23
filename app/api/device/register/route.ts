import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { deviceCode, petName, petType } = body

    if (!deviceCode || !petName || !petType) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Validate pet type
    const validPetTypes = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle']
    if (!validPetTypes.includes(petType)) {
      return NextResponse.json(
        { success: false, error: "Invalid pet type" },
        { status: 400 }
      )
    }

    // Check if this pairing code already exists and is connected to another user
    const { data: existingDevice, error: checkError } = await supabase
      .from('devices')
      .select('id, user_id, pet_name')
      .eq('pairing_code', deviceCode.toUpperCase())
      .single()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error checking existing device:', checkError)
      return NextResponse.json(
        { success: false, error: "Database error" },
        { status: 500 }
      )
    }

    if (existingDevice && existingDevice.user_id !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: `This device (${existingDevice.pet_name}) is already connected to another user. Each pet can only be connected to one account.`,
        },
        { status: 409 }
      )
    }

    // If device exists for this user, update it instead of creating new
    if (existingDevice && existingDevice.user_id === user.id) {
      const { error: updateError } = await supabase
        .from('devices')
        .update({
          pet_name: petName,
          pet_type: petType,
          status: 'paired',
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existingDevice.id)

      if (updateError) {
        console.error('Error updating device:', updateError)
        return NextResponse.json(
          { success: false, error: "Failed to update device" },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: `${petName} has been reconnected!`,
        deviceId: existingDevice.id,
      })
    }

    // Create new device
    const { data: newDevice, error: createError } = await supabase
      .from('devices')
      .insert({
        user_id: user.id,
        pairing_code: deviceCode.toUpperCase(),
        pet_name: petName,
        pet_type: petType,
        status: 'paired',
        last_seen_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating device:', createError)
      return NextResponse.json(
        { success: false, error: "Failed to register device" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${petName} has been connected successfully!`,
      deviceId: newDevice.id,
    })
  } catch (error) {
    console.error('Error in device registration:', error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
