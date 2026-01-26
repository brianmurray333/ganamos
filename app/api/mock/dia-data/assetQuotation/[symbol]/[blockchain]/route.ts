import { NextRequest, NextResponse } from "next/server"
import { mockBitcoinPriceStore } from "@/lib/mock-bitcoin-price-store"

/**
 * Mock DIA Data API Endpoint
 * 
 * Simulates the DIA Data asset quotation endpoint for local development.
 * Only available when USE_MOCKS=true.
 * 
 * Path: /api/mock/dia-data/assetQuotation/[symbol]/[blockchain]
 * Example: /api/mock/dia-data/assetQuotation/Bitcoin/0x0000000000000000000000000000000000000000
 * 
 * Returns: { Price: number }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string; blockchain: string } }
) {
  // Safety check: Only work in mock mode (check USE_MOCKS env var)
  const useMocks = process.env.USE_MOCKS === "true"
  if (!useMocks) {
    return NextResponse.json(
      { error: "Mock mode is not enabled. Set USE_MOCKS=true" },
      { status: 403 }
    )
  }

  try {
    const { symbol, blockchain } = params

    console.log(
      `[Mock DIA Data] Asset quotation request for ${symbol} on blockchain ${blockchain}`
    )

    // Get mock Bitcoin price from store
    const priceData = mockBitcoinPriceStore.getPrice()

    // Return format matching real DIA Data API
    return NextResponse.json(priceData)
  } catch (error) {
    console.error("[Mock DIA Data] Error generating price:", error)
    return NextResponse.json(
      { error: "Failed to generate mock price" },
      { status: 500 }
    )
  }
}
