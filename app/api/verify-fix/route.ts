import { type NextRequest, NextResponse } from "next/server"
import { verifyFixImages } from "@/lib/verify-fix"
import { serverEnv } from "@/lib/env"

export async function POST(request: NextRequest) {
  try {
    console.log("🤖 GROQ VERIFICATION - Starting fix verification request")

    const { beforeImage, afterImage, description, title } = await request.json()

    console.log("🤖 GROQ VERIFICATION - Request data:", {
      title,
      description,
      beforeImageLength: beforeImage?.length || 0,
      afterImageLength: afterImage?.length || 0,
    })

    if (!beforeImage || !afterImage || !description) {
      console.log("🤖 GROQ VERIFICATION - Missing required fields")
      return NextResponse.json(
        { error: "Missing required fields: beforeImage, afterImage, description" },
        { status: 400 },
      )
    }

    // Check configuration
    if (!serverEnv?.groq?.isConfigured) {
      return NextResponse.json({ error: "GROQ API is not configured" }, { status: 500 })
    }

    const { confidence, reasoning } = await verifyFixImages({ beforeImage, afterImage, title, description })

    console.log("🤖 GROQ VERIFICATION - Parsed response:", {
      confidence,
      reasoning,
    })

    return NextResponse.json({
      confidence,
      reasoning,
    })
  } catch (error) {
    console.error("🤖 GROQ VERIFICATION - Detailed error:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause,
    })

    // Return more specific error information
    return NextResponse.json(
      {
        error: "Failed to verify fix with AI",
        details: error.message,
        errorType: error.name,
      },
      { status: 500 },
    )
  }
}
