/**
 * Mock GROQ History Endpoint
 * View verification history during testing
 * Only active when USE_MOCKS=true
 */

import { type NextRequest, NextResponse } from "next/server"
import { serverEnv } from "@/lib/env"
import { mockGroqStore } from "@/lib/mock-groq-store"

export async function GET(request: NextRequest) {
  // Safety check: Only work in mock mode
  if (!serverEnv?.useMock) {
    return NextResponse.json(
      { error: "Mock mode is not enabled. Set USE_MOCKS=true" },
      { status: 403 },
    )
  }

  try {
    // Use URL constructor instead of nextUrl.searchParams to avoid static generation error
    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get("limit") || "10", 10)

    const history = mockGroqStore.getHistory(limit)
    const count = mockGroqStore.getCount()

    return NextResponse.json({
      success: true,
      totalRequests: count,
      history: history.map((req) => ({
        title: req.title,
        description: req.description.substring(0, 100) + "...",
        timestamp: req.timestamp,
        hasBeforeImage: !!req.beforeImage,
        hasAfterImage: !!req.afterImage,
      })),
    })
  } catch (error) {
    console.error("[Mock GROQ] Error fetching history:", error)
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  // Safety check: Only work in mock mode
  if (!serverEnv?.useMock) {
    return NextResponse.json(
      { error: "Mock mode is not enabled. Set USE_MOCKS=true" },
      { status: 403 },
    )
  }

  try {
    mockGroqStore.clear()
    return NextResponse.json({
      success: true,
      message: "GROQ history cleared",
    })
  } catch (error) {
    console.error("[Mock GROQ] Error clearing history:", error)
    return NextResponse.json({ error: "Failed to clear history" }, { status: 500 })
  }
}
