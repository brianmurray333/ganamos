/**
 * Mock GROQ Chat Completions Endpoint
 * Mirrors groq-sdk chat.completions.create() response format
 * Only active when USE_MOCKS=true
 */

import { type NextRequest, NextResponse } from "next/server"
import { serverEnv } from "@/lib/env"
import { mockGroqStore } from "@/lib/mock-groq-store"

export async function POST(request: NextRequest) {
  // Safety check: Only work in mock mode
  if (!serverEnv?.useMock) {
    return NextResponse.json(
      { error: "Mock mode is not enabled. Set USE_MOCKS=true" },
      { status: 403 },
    )
  }

  try {
    const body = await request.json()

    console.log("[Mock GROQ] Received chat completion request")

    // Extract data from request
    const messages = body.messages || []
    const userMessage = messages.find((m: any) => m.role === "user")

    if (!userMessage) {
      return NextResponse.json({ error: "No user message found" }, { status: 400 })
    }

    // Extract content parts
    const content = userMessage.content || []
    const textContent = content.find((c: any) => c.type === "text")
    const imageContents = content.filter((c: any) => c.type === "image_url")

    const prompt = textContent?.text || ""
    const beforeImage = imageContents[0]?.image_url?.url || ""
    const afterImage = imageContents[1]?.image_url?.url || ""

    // Parse title and description from prompt
    const titleMatch = prompt.match(/ISSUE TITLE:\s*(.+)/)
    const descMatch = prompt.match(/ISSUE DESCRIPTION:\s*(.+)/)

    const title = titleMatch ? titleMatch[1].trim() : "Unknown Issue"
    const description = descMatch ? descMatch[1].trim() : ""

    console.log("[Mock GROQ] Extracted data:", {
      title: title.substring(0, 50),
      description: description.substring(0, 50),
      hasBeforeImage: !!beforeImage,
      hasAfterImage: !!afterImage,
    })

    // Generate mock verification
    const result = mockGroqStore.verifyFix(beforeImage, afterImage, title, description)

    // Format response like GROQ API
    const formattedResponse = `CONFIDENCE: ${result.confidence}\nREASONING: ${result.reasoning}`

    // Return response matching GROQ SDK format
    return NextResponse.json({
      id: `chatcmpl-mock-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: formattedResponse,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    })
  } catch (error) {
    console.error("[Mock GROQ] Error:", error)
    return NextResponse.json(
      { error: "Failed to process mock GROQ request" },
      { status: 500 },
    )
  }
}
