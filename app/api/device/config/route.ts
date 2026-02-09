import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limiter"

// Force dynamic rendering and disable caching
export const dynamic = 'force-dynamic'
export const revalidate = 0 // Never cache

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get("deviceId")
    const pairingCode = searchParams.get("pairingCode")

    // Require either deviceId or pairingCode for authentication
    if (!deviceId && !pairingCode) {
      return NextResponse.json(
        {
          success: false,
          error: "Device ID or pairing code required",
        },
        { status: 400 }
      )
    }

    // Rate limiting check (use deviceId or pairingCode as identifier)
    const rateLimitId = deviceId || pairingCode || 'unknown'
    const rateLimit = checkRateLimit(rateLimitId, RATE_LIMITS.DEVICE_CONFIG)
    if (!rateLimit.allowed) {
      console.warn(`[Rate Limit] Device ${rateLimitId} exceeded config limit (${rateLimit.totalRequests} requests)`)
      return NextResponse.json(
        {
          success: false,
          error: "Rate limit exceeded. Please try again later.",
          retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
        },
        { status: 429 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Find the device first (including rejection tracking columns)
    let deviceQuery = supabase
      .from("devices")
      .select("*, last_rejection_id, rejection_message")
      .eq("status", "paired")

    if (deviceId) {
      deviceQuery = deviceQuery.eq("id", deviceId)
    } else {
      deviceQuery = deviceQuery.eq("pairing_code", pairingCode)
    }

    const { data: device, error: deviceError } = await deviceQuery.single()

    console.log("[Device Config] Device query result:", {
      deviceId,
      pairingCode,
      found: !!device,
      deviceExists: !!device,
      errorCode: deviceError?.code,
      errorMessage: deviceError?.message,
      deviceStatus: device?.status,
      deviceIdFromDb: device?.id,
      deviceUserId: device?.user_id, // CRITICAL: Log the user_id we'll query for
    })

    // Explicitly check for PGRST116 (not found) error code
    if (deviceError) {
      if (deviceError.code === 'PGRST116') {
        console.log("[Device Config] Device not found (PGRST116) - returning 404")
        return NextResponse.json(
          {
            success: false,
            error: "Device not found or not paired",
          },
          { status: 404 }
        )
      }
      // Other errors
      console.error("[Device Config] Query error:", deviceError)
      return NextResponse.json(
        {
          success: false,
          error: "Device query failed",
          debug: { deviceError: deviceError.message },
        },
        { status: 500 }
      )
    }

    // Check if device is null/undefined
    if (!device) {
      console.log("[Device Config] Device query returned null - returning 404")
      return NextResponse.json(
        {
          success: false,
          error: "Device not found or not paired",
        },
        { status: 404 }
      )
    }

    // Get user profile - RLS policy allows public reads
    // Force a fresh read by creating a new client and using greater-than-or-equal with updated_at
    // This prevents Supabase from returning cached results
    console.log("[Device Config] Fetching profile for user_id:", device.user_id)
    const freshClient = createServerSupabaseClient()
    let profileResult = await freshClient
      .from("profiles")
      .select("id, balance, pet_coins, name, updated_at")
      .eq("id", device.user_id)
      .gte("updated_at", "2000-01-01") // Force bypass any query cache
      .single()

    let profile = profileResult.data;
    let profileError = profileResult.error;

    // CRITICAL LOGGING: See what we actually got from the database
    console.log("[Device Config] Profile query result:", {
      hasProfile: !!profile,
      profileId: profile?.id,
      profileName: profile?.name,
      balanceFromDb: profile?.balance,
      balanceType: typeof profile?.balance,
      petCoinsFromDb: profile?.pet_coins,
      petCoinsType: typeof profile?.pet_coins,
      profileError: profileError ? {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint
      } : null
    })

    // If error is due to missing pet_coins column, retry without it
    if (profileError && profileError.message && profileError.message.includes('pet_coins')) {
      console.warn("[Device Config] pet_coins column missing, retrying without it");
      const retryResult = await supabase
        .from("profiles")
        .select("id, balance, name")
        .eq("id", device.user_id)
        .single()

      profile = retryResult.data;
      profileError = retryResult.error;
      
      console.log("[Device Config] Retry profile query result:", {
        hasProfile: !!profile,
        balanceFromDb: profile?.balance,
        petCoinsFromDb: profile?.pet_coins,
        profileError: profileError ? profileError.message : null
      })
      
      if (!profileError && profile) {
        // Add pet_coins as 0 for missing column
        profile.pet_coins = 0;
      }
    }

    if (profileError || !profile) {
      console.error("[Device Config] Profile not found:", profileError)
      return NextResponse.json(
        {
          success: false,
          error: "User profile not found",
        },
        { status: 404 }
      )
    }

    // Log the values we're about to send to the device
    console.log("[Device Config] Preparing response with:", {
      balance: profile.balance,
      deviceCoins: device.coins || 0,
      userName: profile.name
    })

    // Update last_seen_at
    await supabase
      .from("devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", device.id)

    // Get the last transaction message and determine notification type
    let lastMessage = ""
    let lastMessageType = "" // "fix" for fix rewards, "transfer" for internal transfers
    let lastPostTitle = "" // Post title for fix rewards
    let lastSenderName = "" // Sender name for internal transfers
    
    try {
      const { data: lastTransaction } = await supabase
        .from("transactions")
        .select("memo")
        .eq("user_id", device.user_id)
        .eq("type", "internal")
        .gt("amount", 0) // Received transactions have positive amounts
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
      
      if (lastTransaction && lastTransaction.memo) {
        lastMessage = lastTransaction.memo
        
        // Parse memo to determine notification type and extract details
        // Fix rewards have memo like: "Fix reward earned: [post title]"
        // Transfers have memo like: "Transfer from [sender name]"
        if (lastMessage.startsWith("Fix reward earned:")) {
          lastMessageType = "fix"
          lastPostTitle = lastMessage.replace("Fix reward earned:", "").trim()
        } else if (lastMessage.startsWith("Transfer from")) {
          lastMessageType = "transfer"
          lastSenderName = lastMessage.replace("Transfer from", "").trim()
        }
      }
    } catch (error) {
      console.warn("Could not fetch last transaction message:", error)
    }
    
    // Parse rejection post title from rejection_message if present
    // Rejection messages are formatted like: '"[post title]" was rejected'
    let rejectionPostTitle = ""
    if (device.rejection_message) {
      const match = device.rejection_message.match(/^"(.+)" was rejected$/)
      if (match) {
        rejectionPostTitle = match[1]
      }
    }

    // Get current Bitcoin price from database (much faster than external API)
    let btcPrice = null
    try {
      // Try function first
      let priceData, priceError
      try {
        const result = await supabase.rpc("get_latest_bitcoin_price", {
          p_currency: "USD",
        })
        priceData = result.data
        priceError = result.error
      } catch {
        // Fallback: Query table directly
        const result = await supabase
          .from("bitcoin_prices")
          .select("price")
          .eq("currency", "USD")
          .order("created_at", { ascending: false })
          .limit(1)
          .single()

        if (result.data) {
          priceData = [{ price: result.data.price }]
        }
        priceError = result.error
      }

      if (!priceError && priceData && priceData.length > 0) {
        btcPrice = parseFloat(priceData[0].price)
      } else {
        console.warn("Failed to fetch BTC price from database:", priceError)
      }
    } catch (error) {
      console.warn("Error fetching BTC price:", error)
    }

    // Calculate coins earned since last sync
    // Device creates coins when balance increases, this tells device about earnings
    let coinsEarnedSinceLastSync = 0
    let deviceCoins = device.coins || 0  // Current device coin balance
    try {
      const { data: earnings, error: earningsError } = await supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", device.user_id)
        .eq("status", "completed")
        .in("type", ["deposit", "internal"])
        .gt("amount", 0)  // Only positive amounts (earnings)
        .gte("created_at", device.created_at)  // Only after device paired
        .gt("created_at", device.last_seen_at || device.created_at)  // Since last sync
      
      if (!earningsError && earnings) {
        coinsEarnedSinceLastSync = earnings.reduce((sum, tx) => sum + tx.amount, 0)
        console.log(`[Device Config] Coins earned since last sync for ${device.id}: ${coinsEarnedSinceLastSync}`)
        
        // If there are new earnings, update the device's coin balance in the database
        // This keeps device.coins in sync with what the firmware's local balance should be
        if (coinsEarnedSinceLastSync > 0) {
          const newDeviceCoins = deviceCoins + coinsEarnedSinceLastSync
          const { error: updateError } = await supabase
            .from("devices")
            .update({ coins: newDeviceCoins })
            .eq("id", device.id)
          
          if (!updateError) {
            deviceCoins = newDeviceCoins
            console.log(`[Device Config] Updated device.coins: ${deviceCoins} (added ${coinsEarnedSinceLastSync})`)
          } else {
            console.warn("[Device Config] Failed to update device.coins:", updateError)
          }
        }
      } else if (earningsError) {
        console.warn("[Device Config] Error calculating coins earned:", earningsError)
      }
    } catch (error) {
      console.warn("[Device Config] Error calculating coins earned:", error)
    }

    // Check for new jobs in user's groups OR assigned directly to user (for notification)
    let hasNewJob = false
    let newJobTitle: string | null = null
    let newJobReward: number | null = null
    
    try {
      // Get user's group memberships
      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", device.user_id)
        .eq("status", "approved")
      
      const groupIds = memberships?.map(m => m.group_id) || []
      let newestJob: { id: string; title: string; reward: number; created_at: string } | null = null
      
      // Check for newest group job (if user has any groups)
      if (groupIds.length > 0) {
        const { data: newestGroupJob } = await supabase
          .from("posts")
          .select("id, title, reward, created_at")
          .in("group_id", groupIds)
          .eq("fixed", false)
          .eq("claimed", false)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .single()
        
        if (newestGroupJob) {
          newestJob = newestGroupJob
        }
      }
      
      // Check for newest job assigned directly to this user
      const { data: newestAssignedJob } = await supabase
        .from("posts")
        .select("id, title, reward, created_at")
        .eq("assigned_to", device.user_id)
        .eq("fixed", false)
        .eq("claimed", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
      
      // Use the more recent of the two (group job or assigned job)
      if (newestAssignedJob) {
        if (!newestJob || new Date(newestAssignedJob.created_at) > new Date(newestJob.created_at)) {
          newestJob = newestAssignedJob
        }
      }
      
      if (newestJob) {
        // Check if this job is newer than what device has seen
        const lastJobsSeen = device.last_jobs_seen_at
        const jobCreatedAt = new Date(newestJob.created_at)
        
        if (!lastJobsSeen || jobCreatedAt > new Date(lastJobsSeen)) {
          hasNewJob = true
          // Truncate title to 25 chars for device display
          newJobTitle = newestJob.title.length > 25 
            ? newestJob.title.substring(0, 23) + ".."
            : newestJob.title
          newJobReward = newestJob.reward
          console.log(`[Device Config] New job detected for device ${device.id}: "${newJobTitle}" (${newJobReward} sats)`)
          
          // Mark this job as "seen" so we don't notify again on next poll
          await supabase
            .from("devices")
            .update({ last_jobs_seen_at: newestJob.created_at })
            .eq("id", device.id)
        }
      }
    } catch (error) {
      console.warn("[Device Config] Error checking for new jobs:", error)
    }

    // Build config object - only include rejection fields if there's an actual rejection
    const config: Record<string, any> = {
      deviceId: device.id,
      petName: device.pet_name,
      petType: device.pet_type,
      userId: device.user_id,
      userName: profile?.name || "User",
      balance: profile?.balance || 0,
      coins: deviceCoins, // Per-device coin balance (synced with firmware's local balance)
      coinsEarnedSinceLastSync: coinsEarnedSinceLastSync, // Coins earned from transactions since last sync
      btcPrice: btcPrice,
      pollInterval: 30, // seconds
      serverUrl:
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3457",
      lastMessage: lastMessage, // Include the last transaction message
      lastMessageType: lastMessageType, // "fix" for fix rewards, "transfer" for transfers
      lastPostTitle: lastPostTitle, // Post title for fix rewards
      lastSenderName: lastSenderName, // Sender name for internal transfers
      // Pet care costs (configurable, defaults provided)
      // Based on 1k sats/day baseline - allows 10 games/day at 100 coins each
      petFeedCost: 100, // Default feed cost (can be overridden by food selection: 100, 200, 300, 400, 500)
      petHealCost: 200, // Coins to heal pet (not currently used)
      gameCost: 100, // Coins per game attempt (budgets 10 plays/day for 1k sats/day earnings)
      gameReward: 15, // Happiness increase per successful game
      // Economy parameters (time-based decay only, no cooldowns)
      hungerDecayPer24h: 40.0, // Points per 24 hours (needs 2-4 feeds/day)
      happinessDecayPer24h: 25.0, // Points per 24 hours (needs 1-2 plays/day)
      // New job notification
      hasNewJob: hasNewJob,
      newJobTitle: newJobTitle,
      newJobReward: newJobReward,
    }
    
    // Only include rejection fields if there's actually a rejection to show
    // This prevents Arduino from displaying "Fix rejected null" when there's no rejection
    if (device.last_rejection_id) {
      config.lastRejectionId = device.last_rejection_id
      config.rejectionMessage = device.rejection_message || "Try again!"
      config.rejectionPostTitle = rejectionPostTitle || "Issue"
    }

    // Return device configuration and user data with explicit no-cache headers
    const response = NextResponse.json({
      success: true,
      config,
    })
    
    // Add explicit no-cache headers to prevent Vercel edge caching
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response
  } catch (error) {
    console.error("Error in device config API:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    )
  }
}

