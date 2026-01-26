import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// This endpoint is called by Vercel Cron every 30 minutes
// It fetches the current Bitcoin price from CoinMarketCap and stores it in the database

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron
    const authHeader = request.headers.get("authorization")

    // Check if request is from Vercel Cron (has x-vercel-id or x-vercel-cron header)
    const isVercelCron = request.headers.get('x-vercel-id') || request.headers.get('x-vercel-cron')

    // Allow Vercel Cron requests, or require CRON_SECRET for manual triggers
    if (!isVercelCron) {
      // Not from Vercel Cron, so we need to check Bearer token
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    // Fetch current Bitcoin price from DIA Data (free, no API key required)
    console.log("Fetching Bitcoin price from DIA Data...")
    const response = await fetch(
      "https://api.diadata.org/v1/assetQuotation/Bitcoin/0x0000000000000000000000000000000000000000",
      {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      }
    )

    if (!response.ok) {
      throw new Error(`DIA Data API request failed with status ${response.status}`)
    }

    const data = await response.json()
    const btcPrice = data.Price

    if (!btcPrice || typeof btcPrice !== 'number') {
      throw new Error(`Invalid price data received: ${btcPrice}`)
    }

    console.log(`Fetched BTC price: $${btcPrice.toFixed(2)}`)

    // Store the price in the database using service role
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SECRET_API_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Supabase configuration missing")
      return NextResponse.json(
        { error: "Database configuration missing" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Insert the new price record
    const { data: insertedPrice, error: insertError } = await supabase
      .from("bitcoin_prices")
      .insert({
        price: btcPrice,
        currency: "USD",
        source: "diadata.org",
      })
      .select()
      .single()

    if (insertError) {
      console.error("Error inserting Bitcoin price:", insertError)
      return NextResponse.json(
        { error: "Failed to store price", details: insertError.message },
        { status: 500 }
      )
    }

    console.log("Successfully stored Bitcoin price:", insertedPrice)

    // Optional: Clean up old prices (older than 30 days)
    try {
      const { data: cleanupResult, error: cleanupError } = await supabase.rpc(
        "cleanup_old_bitcoin_prices"
      )
      if (!cleanupError && cleanupResult > 0) {
        console.log(`Cleaned up ${cleanupResult} old price records`)
      }
    } catch (cleanupError) {
      // Don't fail the request if cleanup fails
      console.warn("Cleanup failed:", cleanupError)
    }

    return NextResponse.json({
      success: true,
      price: btcPrice,
      currency: "USD",
      timestamp: insertedPrice.created_at,
      message: "Bitcoin price updated successfully",
    })
  } catch (error) {
    console.error("Error in Bitcoin price cron job:", error)
    return NextResponse.json(
      {
        error: "Failed to update Bitcoin price",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

