import { createChatCompletion } from "@/lib/groq-wrapper"

/** Minimum AI confidence (1-10) for a fix to be approved without human review. */
export const AUTO_APPROVE_CONFIDENCE = 7

export interface FixVerification {
  confidence: number
  reasoning: string
}

/**
 * Ask the vision model whether the after image shows the issue in the before
 * image fixed. Server-side only. Throws if the model call fails.
 */
export async function verifyFixImages(params: {
  beforeImage: string
  afterImage: string
  title?: string | null
  description: string
}): Promise<FixVerification> {
  const { beforeImage, afterImage, title, description } = params

  const prompt = `You are an expert at analyzing before and after images to determine if community issues have been properly fixed.

TASK: Analyze these before/after images for the reported issue and provide a confidence score.

ISSUE TITLE: ${title ?? ""}
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

  const chatCompletion = await createChatCompletion({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "text", text: "BEFORE IMAGE (showing the original issue that needs to be fixed):" },
          { type: "image_url", image_url: { url: beforeImage } },
          { type: "text", text: "AFTER IMAGE (showing the fix attempt - compare this to the before image):" },
          { type: "image_url", image_url: { url: afterImage } },
        ],
      },
    ],
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    temperature: 0.1,
    max_completion_tokens: 1024,
  })

  const response = chatCompletion.choices[0]?.message?.content || ""
  const confidenceMatch = response.match(/CONFIDENCE:\s*(\d+)/)
  const reasoningMatch = response.match(/REASONING:\s*(.+)/)

  const parsed = confidenceMatch ? Number.parseInt(confidenceMatch[1]) : 5
  const confidence = Math.min(10, Math.max(1, Number.isFinite(parsed) ? parsed : 5))
  const reasoning = reasoningMatch ? reasoningMatch[1].trim() : "Unable to parse response"

  return { confidence, reasoning }
}
