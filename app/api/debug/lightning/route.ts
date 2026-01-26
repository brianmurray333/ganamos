// Create a new debug API endpoint to test the Lightning connection
import { NextResponse } from "next/server"

export async function GET() {
  // Only available in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 })
  }

  const LND_REST_URL = process.env.LND_REST_URL
  const LND_ADMIN_MACAROON = process.env.LND_ADMIN_MACAROON

  // Check if config is set
  const configStatus = {
    url: {
      set: !!LND_REST_URL,
      value: LND_REST_URL ? `${LND_REST_URL.substring(0, 10)}...` : null,
    },
    macaroon: {
      set: !!LND_ADMIN_MACAROON,
      value: LND_ADMIN_MACAROON ? `${LND_ADMIN_MACAROON.substring(0, 10)}...` : null,
    },
  }

  // Test connection
  let connectionTest = { success: false, error: "Not attempted" }

  if (LND_REST_URL && LND_ADMIN_MACAROON) {
    try {
      const headers: HeadersInit = {
        "Grpc-Metadata-macaroon": LND_ADMIN_MACAROON,
      }

      const response = await fetch(`${LND_REST_URL}/v1/getinfo`, {
        method: "GET",
        headers,
        cache: "no-store",
      })

      if (response.ok) {
        const data = await response.json()
        connectionTest = { success: true, data }
      } else {
        const text = await response.text()
        connectionTest = {
          success: false,
          error: `Status: ${response.status}`,
          response: text.substring(0, 200),
        }
      }
    } catch (error) {
      connectionTest = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    config: configStatus,
    connectionTest,
  })
}
