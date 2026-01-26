import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limiter"
import { sendDeviceJobCompletionEmail } from "@/lib/transaction-emails"

// Force dynamic rendering and disable caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get("deviceId")
    
    // Parse body
    const body = await request.json()
    const { jobId } = body

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "Device ID required" },
        { status: 400 }
      )
    }

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "Job ID required" },
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
      console.log("[Device Job Complete] Device not found:", deviceId)
      return NextResponse.json(
        { success: false, error: "Device not found" },
        { status: 404 }
      )
    }

    const fixerUserId = device.user_id

    // Get the fixer's profile (username and name)
    const { data: fixerProfile, error: fixerError } = await supabase
      .from("profiles")
      .select("id, username, name")
      .eq("id", fixerUserId)
      .single()

    if (fixerError || !fixerProfile) {
      console.error("[Device Job Complete] Fixer profile not found:", fixerUserId)
      return NextResponse.json(
        { success: false, error: "User profile not found" },
        { status: 404 }
      )
    }

    // Get the job (post) details
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select(`
        id,
        title,
        description,
        reward,
        user_id,
        group_id,
        fixed,
        claimed,
        deleted_at
      `)
      .eq("id", jobId)
      .single()

    if (postError || !post) {
      console.log("[Device Job Complete] Post not found:", jobId)
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      )
    }

    // Validate the post is still open
    if (post.fixed) {
      return NextResponse.json(
        { success: false, error: "Job already completed" },
        { status: 400 }
      )
    }

    if (post.claimed) {
      return NextResponse.json(
        { success: false, error: "Job already claimed" },
        { status: 400 }
      )
    }

    if (post.deleted_at) {
      return NextResponse.json(
        { success: false, error: "Job has been deleted" },
        { status: 400 }
      )
    }

    // Validate the user is a member of the group
    if (post.group_id) {
      const { data: membership } = await supabase
        .from("group_members")
        .select("status")
        .eq("group_id", post.group_id)
        .eq("user_id", fixerUserId)
        .eq("status", "approved")
        .single()

      if (!membership) {
        return NextResponse.json(
          { success: false, error: "You are not a member of this group" },
          { status: 403 }
        )
      }
    }

    // Get the post owner's profile (for email)
    const { data: ownerProfile, error: ownerError } = await supabase
      .from("profiles")
      .select("id, email, name, username")
      .eq("id", post.user_id)
      .single()

    if (ownerError || !ownerProfile) {
      console.error("[Device Job Complete] Owner profile not found:", post.user_id)
      return NextResponse.json(
        { success: false, error: "Post owner not found" },
        { status: 404 }
      )
    }

    // Send email notification to the post owner
    if (ownerProfile.email && !ownerProfile.email.includes('@ganamos.app')) {
      try {
        await sendDeviceJobCompletionEmail({
          toEmail: ownerProfile.email,
          ownerName: ownerProfile.name || "User",
          issueTitle: post.title || "Your issue",
          fixerName: fixerProfile.name || fixerProfile.username || "Someone",
          fixerUsername: fixerProfile.username || "",
          fixerUserId: fixerUserId,
          rewardAmount: post.reward,
          date: new Date(),
          postId: jobId
        })
        console.log(`[Device Job Complete] Email sent to ${ownerProfile.email} for job ${jobId}`)
      } catch (emailError) {
        console.error("[Device Job Complete] Error sending email:", emailError)
        // Don't fail the request if email fails - still return success
      }
    } else {
      console.log("[Device Job Complete] Skipping email - owner has no valid email")
    }
    
    // Also send email to all other group admins (so any admin can approve)
    if (post.group_id) {
      try {
        const { data: groupAdmins } = await supabase
          .from('group_members')
          .select('user_id, profiles(email, name)')
          .eq('group_id', post.group_id)
          .eq('role', 'admin')
          .eq('status', 'approved')
          .neq('user_id', post.user_id) // Exclude post owner (already emailed)
        
        for (const admin of groupAdmins || []) {
          const profile = admin.profiles as { email: string; name: string } | null
          if (profile?.email && !profile.email.includes('@ganamos.app')) {
            sendDeviceJobCompletionEmail({
              toEmail: profile.email,
              ownerName: profile.name || "User",
              issueTitle: post.title || "A group issue",
              fixerName: fixerProfile.name || fixerProfile.username || "Someone",
              fixerUsername: fixerProfile.username || "",
              fixerUserId: fixerUserId,
              rewardAmount: post.reward,
              date: new Date(),
              postId: jobId
            }).catch(err => {
              console.error(`[Device Job Complete] Error sending email to group admin ${profile.email}:`, err)
            })
          }
        }
      } catch (adminEmailError) {
        console.error("[Device Job Complete] Error fetching group admins for email:", adminEmailError)
      }
    }

    console.log(`[Device Job Complete] User ${fixerUserId} (${fixerProfile.username}) marked job ${jobId} as complete`)

    return NextResponse.json({
      success: true,
      message: "Verification request sent to poster"
    })

  } catch (error) {
    console.error("[Device Job Complete] Error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

