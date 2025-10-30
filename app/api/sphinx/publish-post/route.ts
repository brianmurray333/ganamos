import { NextResponse } from "next/server"
import { postToSphinx } from "@/lib/sphinx"

/**
 * API route to publish a Ganamos post to Sphinx tribe
 * Called after a new post is successfully created
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { title, description, location, city, latitude, longitude, reward, postId, imageUrl } = body

    if (!title || !description || !postId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      )
    }

    // Publish to Sphinx
    const result = await postToSphinx({
      title,
      description,
      location,
      city,
      latitude,
      longitude,
      reward,
      postId,
      imageUrl
    })

    if (result.success) {
      console.log(`[SPHINX] Successfully published post ${postId} to Sphinx tribe`)
      return NextResponse.json({
        success: true
      })
    } else {
      console.error(`[SPHINX] Failed to publish post ${postId}:`, result.error)
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
