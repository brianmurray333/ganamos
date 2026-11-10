import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { renderEmail, escapeHtml } from "@/lib/email-layout"

/**
 * Send email notification when a job is assigned to a specific person
 * Skips child accounts (emails ending with @ganamos.app)
 * 
 * Security: Validates the post exists and matches the claimed assignment
 * to prevent abuse/spam
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { postId, assignedToUserId, assignerUserId } = body

    if (!postId || !assignedToUserId || !assignerUserId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      )
    }

    // Use service role key for admin access to bypass RLS
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    // SECURITY: Verify the post exists and the assignment is legitimate
    const { data: post, error: postError } = await adminSupabase
      .from("posts")
      .select("id, user_id, assigned_to, title, description, reward")
      .eq("id", postId)
      .single()

    if (postError || !post) {
      console.log("[Job Assigned Email] Post not found:", postId)
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      )
    }

    // Verify the post was created by the claimed assigner
    if (post.user_id !== assignerUserId) {
      console.log("[Job Assigned Email] Assigner mismatch:", { postUserId: post.user_id, claimedAssigner: assignerUserId })
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      )
    }

    // Verify the post is actually assigned to the claimed user
    if (post.assigned_to !== assignedToUserId) {
      console.log("[Job Assigned Email] Assignment mismatch:", { postAssignedTo: post.assigned_to, claimedAssignee: assignedToUserId })
      return NextResponse.json(
        { success: false, error: "Assignment mismatch" },
        { status: 400 }
      )
    }

    // Use verified post data for the email
    const jobTitle = post.title
    const jobDescription = post.description
    const reward = post.reward

    // Get the assigned user's profile
    const { data: assignedProfile, error: assignedError } = await adminSupabase
      .from("profiles")
      .select("id, email, name, username")
      .eq("id", assignedToUserId)
      .single()

    if (assignedError || !assignedProfile) {
      console.log("[Job Assigned Email] Assigned user profile not found:", assignedToUserId)
      return NextResponse.json(
        { success: false, error: "Assigned user not found" },
        { status: 404 }
      )
    }

    // Check if this is a child account (skip email)
    if (assignedProfile.email?.endsWith("@ganamos.app")) {
      console.log("[Job Assigned Email] Skipping - child account:", assignedProfile.email)
      return NextResponse.json({
        success: true,
        skipped: true,
        message: "Skipped - child account does not receive emails"
      })
    }

    // Check if they have a valid email
    if (!assignedProfile.email) {
      console.log("[Job Assigned Email] Skipping - no email for user:", assignedToUserId)
      return NextResponse.json({
        success: true,
        skipped: true,
        message: "Skipped - user has no email"
      })
    }

    // Get the assigner's profile
    const { data: assignerProfile } = await adminSupabase
      .from("profiles")
      .select("name, username")
      .eq("id", assignerUserId)
      .single()

    const assignerName = assignerProfile?.name || assignerProfile?.username || "Someone"

    // Check if Resend is configured
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.log("[Job Assigned Email] Resend not configured, skipping email")
      return NextResponse.json({
        success: true,
        skipped: true,
        message: "Email service not configured"
      })
    }

    const { Resend } = await import("resend")
    const resend = new Resend(resendApiKey)

    const postUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://ganamos.earth"}/post/${postId}`
    const recipientName = assignedProfile.name || assignedProfile.username || "there"

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Ganamos <notifications@ganamos.earth>",
      to: assignedProfile.email,
      subject: `🎯 ${assignerName} assigned you a job!`,
      html: renderEmail({
        title: "New job assignment",
        preheader: `${assignerName} assigned you a job: ${jobTitle}`,
        greeting: escapeHtml(recipientName),
        paragraphs: [`<strong>${escapeHtml(assignerName)}</strong> has assigned you a job.`],
        details: [
          ["Job", escapeHtml(jobTitle)],
          ...(jobDescription && jobDescription !== jobTitle
            ? [["Details", escapeHtml(jobDescription.substring(0, 200) + (jobDescription.length > 200 ? "..." : ""))] as [string, string]]
            : []),
          ["Reward", `${reward.toLocaleString()} sats`],
        ],
        button: { label: "View Job Details", href: postUrl },
        afterParagraphs: ["Complete this job to earn the reward!"],
        footer: `You received this email because someone assigned a job to you on <a href="https://www.ganamos.earth" style="color:#16a34a;text-decoration:none;">Ganamos</a>.`,
      }),
    })

    console.log(`[Job Assigned Email] Sent to ${assignedProfile.email} for job ${postId}`)

    return NextResponse.json({
      success: true,
      message: "Email sent successfully"
    })

  } catch (error) {
    console.error("[Job Assigned Email] Error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to send email" },
      { status: 500 }
    )
  }
}

