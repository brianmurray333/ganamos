import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"

// This endpoint now reads from cached Bitcoin price in database
// Updated by cron job every 30 minutes to reduce API calls

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()

    // Get the latest Bitcoin price from database
    // Try using the function first, fallback to direct query if it fails
    let data, error
    
    try {
      const result = await supabase.rpc("get_latest_bitcoin_price", {
        p_currency: "USD",
      })
      data = result.data
      error = result.error
    } catch (rpcError) {
      console.warn("Function call failed, trying direct query:", rpcError)
      // Fallback: Query the table directly
      const result = await supabase
        .from("bitcoin_prices")
        .select("*")
        .eq("currency", "USD")
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
      
      if (result.data) {
        // Calculate age manually
        const created = new Date(result.data.created_at)
        const now = new Date()
        const ageMinutes = Math.floor((now.getTime() - created.getTime()) / 60000)
        
        data = [{
          price: result.data.price,
          currency: result.data.currency,
          source: result.data.source,
          created_at: result.data.created_at,
          age_minutes: ageMinutes
        }]
      }
      error = result.error
    }

    if (error) {
      console.error("Error fetching Bitcoin price from database:", error)
      throw new Error("Failed to fetch price from database")
    }

    // Check if we have a price
    if (!data || data.length === 0) {
      console.error("No Bitcoin price found in database")
      return NextResponse.json(
        { error: "No price data available. Price update pending." },
        { status: 503 }
      )
    }

    const priceData = data[0]
    const ageMinutes = priceData.age_minutes || 0

    // Warn if price data is stale (> 60 minutes old)
    if (ageMinutes > 60) {
      console.warn(`Bitcoin price is stale: ${ageMinutes} minutes old`)
    }

    const jsonResponse = NextResponse.json({
      price: parseFloat(priceData.price),
      currency: priceData.currency,
      source: priceData.source,
      timestamp: priceData.created_at,
      ageMinutes: ageMinutes,
      isStale: ageMinutes > 60,
    })

    // Add CORS headers for development only
    if (process.env.NODE_ENV === "development") {
      jsonResponse.headers.set("Access-Control-Allow-Origin", "*")
      jsonResponse.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")
      jsonResponse.headers.set("Access-Control-Allow-Headers", "Content-Type")
    }

    return jsonResponse
  } catch (error) {
    console.error("Error in Bitcoin price API:", error)
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack")
    console.error("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "Set" : "Missing")
    console.error("Service Key:", process.env.SUPABASE_SECRET_API_KEY ? "Set" : "Missing")
    
    const errorResponse = NextResponse.json(
      {
        error: "Failed to fetch current price",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.stack : null) : undefined,
      },
      { status: 500 }
    )

    // Add CORS headers for development only
    if (process.env.NODE_ENV === "development") {
      errorResponse.headers.set("Access-Control-Allow-Origin", "*")
      errorResponse.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")
      errorResponse.headers.set("Access-Control-Allow-Headers", "Content-Type")
    }

    return errorResponse
  }
}

// Handle CORS preflight requests (development only)
export async function OPTIONS() {
  if (process.env.NODE_ENV === 'development') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }
  
  return new NextResponse(null, { status: 204 })
}
