import { type NextRequest, NextResponse } from "next/server"
import { Groq } from "groq-sdk"

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

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

    const prompt = `You are an expert at analyzing before and after images to determine if community issues have been properly fixed.

TASK: Analyze these before/after images for the reported issue and provide a confidence score.

ISSUE TITLE: ${title}
ISSUE DESCRIPTION: ${description}

Please examine both images carefully and rate your confidence (1-10) that the reported issue was actually addressed and fixed in the after image.

SCORING GUIDE:
- 1-3: Issue clearly NOT fixed or made worse
- 4-6: Unclear, partial fix, or insufficient evidence  
- 7-8: Issue appears to be fixed with good confidence
- 9-10: Issue is clearly and completely fixed

IMPORTANT: Respond in this exact format:
CONFIDENCE: [number 1-10]
REASONING: [your explanation]`

    console.log("🤖 GROQ VERIFICATION - Sending request to Groq with prompt:", prompt.substring(0, 200) + "...")
    console.log("🤖 GROQ VERIFICATION - API Key exists:", !!process.env.GROQ_API_KEY)

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: beforeImage,
              },
            },
            {
              type: "image_url",
              image_url: {
                url: afterImage,
              },
            },
          ],
        },
      ],
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.1,
      max_completion_tokens: 1024,
      top_p: 1,
      stream: false,
    })

    const response = chatCompletion.choices[0]?.message?.content || ""
    console.log("🤖 GROQ VERIFICATION - Raw response from Groq:", response)

    // Parse the structured response
    const confidenceMatch = response.match(/CONFIDENCE:\s*(\d+)/)
    const reasoningMatch = response.match(/REASONING:\s*(.+)/)

    const confidence = confidenceMatch ? Number.parseInt(confidenceMatch[1]) : 5
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : "Unable to parse response"

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
