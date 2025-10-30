import { NextResponse } from "next/server"
import { postToSphinx } from "@/lib/sphinx"

/**
 * API endpoint to publish a Ganamos post to Sphinx tribe
 * 
 * Accepts POST requests with post details and forwards them to the Sphinx bot API
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { title, description, location, city, reward, postId, imageUrl } = body

    // Validate required parameters
    if (!title || !description || !postId) {
      console.error("[SPHINX] Missing required parameters:", { title: !!title, description: !!description, postId: !!postId })
      return NextResponse.json(
        { success: false, error: "Missing required parameters: title, description, postId" },
        { status: 400 }
      )
    }

    // Validate reward is a number
    if (typeof reward !== 'number' || reward < 0) {
      console.error("[SPHINX] Invalid reward value:", reward)
      return NextResponse.json(
        { success: false, error: "Invalid reward value" },
        { status: 400 }
      )
    }

    console.log("[SPHINX] Received publish request for post:", postId)

    // Post to Sphinx
    const result = await postToSphinx({
      title,
      description,
      location,
      city,
      reward,
      postId,
      imageUrl
    })

    if (result.success) {
      return NextResponse.json({ success: true })
    } else {
      console.error("[SPHINX] Failed to publish:", result.error)
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("[SPHINX] Error in publish-post route:", error)
    return NextResponse.json(
      { success: false, error: "Failed to publish to Sphinx" },
      { status: 500 }
    )
  }
}
