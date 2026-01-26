import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limiter"

// Force dynamic rendering and disable caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get("deviceId")

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "Device ID required" },
        { status: 400 }
      )
    }

    // Rate limiting
    const rateLimit = checkRateLimit(deviceId, RATE_LIMITS.DEVICE_CONFIG)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded" },
        { status: 429 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Find the device and get user_id
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("id, user_id")
      .eq("id", deviceId)
      .eq("status", "paired")
      .single()

    if (deviceError || !device) {
      console.log("[Device Jobs] Device not found:", deviceId)
      return NextResponse.json(
        { success: false, error: "Device not found" },
        { status: 404 }
      )
    }

    const userId = device.user_id

    // Get all groups where user is an approved member
    const { data: memberships, error: membershipError } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId)
      .eq("status", "approved")

    if (membershipError) {
      console.error("[Device Jobs] Error fetching memberships:", membershipError)
      return NextResponse.json(
        { success: false, error: "Failed to fetch group memberships" },
        { status: 500 }
      )
    }

    const groupIds = memberships?.map(m => m.group_id) || []

    // Fetch open jobs from two sources:
    // 1. Jobs from user's groups
    // 2. Jobs directly assigned to this user
    let allPosts: any[] = []

    // Fetch group jobs (if user has any group memberships)
    if (groupIds.length > 0) {
      const { data: groupPosts, error: groupPostsError } = await supabase
        .from("posts")
        .select(`
          id,
          title,
          description,
          reward,
          location,
          created_at,
          group_id,
          assigned_to,
          groups:group_id(
            id,
            name
          )
        `)
        .in("group_id", groupIds)
        .eq("fixed", false)
        .eq("claimed", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(10)

      if (groupPostsError) {
        console.error("[Device Jobs] Error fetching group posts:", groupPostsError)
      } else {
        allPosts = [...(groupPosts || [])]
      }
    }

    // Fetch jobs directly assigned to this user
    const { data: assignedPosts, error: assignedPostsError } = await supabase
      .from("posts")
      .select(`
        id,
        title,
        description,
        reward,
        location,
        created_at,
        group_id,
        assigned_to,
        groups:group_id(
          id,
          name
        )
      `)
      .eq("assigned_to", userId)
      .eq("fixed", false)
      .eq("claimed", false)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10)

    if (assignedPostsError) {
      console.error("[Device Jobs] Error fetching assigned posts:", assignedPostsError)
    } else {
      // Merge assigned posts, avoiding duplicates
      const existingIds = new Set(allPosts.map(p => p.id))
      for (const post of (assignedPosts || [])) {
        if (!existingIds.has(post.id)) {
          allPosts.push(post)
        }
      }
    }

    // Sort all posts by created_at descending and limit
    allPosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const limitedPosts = allPosts.slice(0, 10)

    // Transform posts to jobs format for device
    const jobs = limitedPosts.map(post => ({
      id: post.id,
      title: post.title,
      reward: post.reward,
      location: post.location || "",
      createdAt: post.created_at,
      groupName: post.assigned_to ? "Assigned to you" : ((post.groups as any)?.name || "")
    }))

    console.log(`[Device Jobs] Returning ${jobs.length} jobs for device ${deviceId}`)

    // Update last_jobs_seen_at to mark that device has seen current jobs
    // This prevents repeated "new job" notifications
    await supabase
      .from("devices")
      .update({ last_jobs_seen_at: new Date().toISOString() })
      .eq("id", deviceId)

    const response = NextResponse.json({
      success: true,
      jobs,
      totalCount: jobs.length
    })

    // No-cache headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    
    return response

  } catch (error) {
    console.error("[Device Jobs] Error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

