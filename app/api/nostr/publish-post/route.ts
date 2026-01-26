import { NextResponse } from "next/server"
import { postToNostr } from "@/lib/nostr"

/**
 * API route to publish a Ganamos post to Nostr
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

    // Publish to Nostr asynchronously
    const result = await postToNostr({
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
      console.log(`[NOSTR] Successfully published post ${postId} to Nostr`)
      return NextResponse.json({
        success: true,
        eventId: result.eventId,
        relaysPublished: result.relaysPublished
      })
    } else {
      console.error(`[NOSTR] Failed to publish post ${postId}:`, result.error)
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("[NOSTR] Error in publish-post route:", error)
    return NextResponse.json(
      { success: false, error: "Failed to publish to Nostr" },
      { status: 500 }
    )
  }
}

