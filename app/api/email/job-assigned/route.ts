import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"

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
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { text-align: center; padding: 20px 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 10px; }
              .job-card { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0; }
              .job-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 10px; }
              .job-description { color: #666; margin-bottom: 15px; }
              .reward { display: inline-block; background: #fef3c7; color: #d97706; padding: 6px 12px; border-radius: 20px; font-weight: bold; font-size: 14px; }
              .button { display: inline-block; background: #22c55e; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
              .footer { text-align: center; padding: 20px 0; color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="color: #ffffff !important;">🎯 New Job Assignment</h1>
              </div>
              <div class="content">
                <p>Hi ${recipientName}!</p>
                <p><strong>${assignerName}</strong> has assigned you a job:</p>
                
                <div class="job-card">
                  <div class="job-title">${jobTitle}</div>
                  ${jobDescription && jobDescription !== jobTitle ? `<div class="job-description">${jobDescription.substring(0, 200)}${jobDescription.length > 200 ? '...' : ''}</div>` : ''}
                  <div class="reward">⚡ ${reward.toLocaleString()} sats reward</div>
                </div>
                
                <p>Complete this job to earn the reward!</p>
                
                <div style="text-align: center;">
                  <a href="${postUrl}" class="button">View Job Details</a>
                </div>
              </div>
              <div class="footer">
                <p>You received this email because someone assigned a job to you on Ganamos.</p>
                <p><a href="https://ganamos.earth">ganamos.earth</a></p>
              </div>
            </div>
          </body>
        </html>
      `,
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

