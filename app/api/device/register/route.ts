import { NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function POST(request: NextRequest) {
  try {
    // Debug: Check cookies before creating client
    const cookieStore = await cookies()
    const cookieNames = cookieStore.getAll().map(c => c.name)
    console.log("[Device Register] Available cookies:", cookieNames)
    
    const supabase = createRouteHandlerClient({ cookies })

    // Debug: Try to get session first
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    console.log("[Device Register] Session:", session ? `Found (user: ${session.user?.id})` : "Not found", "Error:", sessionError?.message || sessionError)

    if (sessionError || !session) {
      console.error("[Device Register] Authentication failed:", sessionError)
      return NextResponse.json(
        { success: false, error: "Unauthorized", debug: { sessionError: sessionError?.message } },
        { status: 401 }
      )
    }

    const user = session.user

    const body = await request.json()
    const { deviceCode, petName, petType, targetUserId } = body

    if (!deviceCode || !petName || !petType) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Determine which account this device should belong to
    let deviceOwnerId: string = user.id
    if (targetUserId && targetUserId !== user.id) {
      const { data: connection, error: connectionError } = await supabase
        .from('connected_accounts')
        .select('primary_user_id')
        .eq('primary_user_id', user.id)
        .eq('connected_user_id', targetUserId)
        .single()

      if (connectionError && connectionError.code !== 'PGRST116') {
        console.error("[Device Register] Error verifying connected account:", connectionError)
        return NextResponse.json(
          { success: false, error: "Database error" },
          { status: 500 }
        )
      }

      if (!connection) {
        return NextResponse.json(
          {
            success: false,
            error: "You are not authorized to connect a device for this account.",
          },
          { status: 403 }
        )
      }

      deviceOwnerId = targetUserId
    }

    // Validate pet type
    const validPetTypes = ['cat', 'dog', 'rabbit', 'squirrel', 'turtle', 'owl']
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

    if (existingDevice && existingDevice.user_id !== deviceOwnerId) {
      return NextResponse.json(
        {
          success: false,
          error: `This device (${existingDevice.pet_name}) is already connected to another user. Each pet can only be connected to one account.`,
        },
        { status: 409 }
      )
    }

    // If device exists for this user, update it instead of creating new
    if (existingDevice && existingDevice.user_id === deviceOwnerId) {
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

    // If this user already has a device record, update it with new details
    const { data: userDevice, error: userDeviceError } = await supabase
      .from('devices')
      .select('id')
      .eq('user_id', deviceOwnerId)
      .single()

    if (!userDeviceError && userDevice) {
      const { error: updateExistingError } = await supabase
        .from('devices')
        .update({
          pairing_code: deviceCode.toUpperCase(),
          pet_name: petName,
          pet_type: petType,
          status: 'paired',
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', userDevice.id)

      if (updateExistingError) {
        console.error('Error updating existing device for user:', updateExistingError)
        return NextResponse.json(
          { success: false, error: "Failed to update device" },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: `${petName} has been connected successfully!`,
        deviceId: userDevice.id,
      })
    } else if (userDeviceError && userDeviceError.code !== 'PGRST116') {
      console.error('Error fetching user device:', userDeviceError)
      return NextResponse.json(
        { success: false, error: "Database error" },
        { status: 500 }
      )
    }

    // Create new device
    const { data: newDevice, error: createError } = await supabase
      .from('devices')
      .insert({
        user_id: deviceOwnerId,
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
