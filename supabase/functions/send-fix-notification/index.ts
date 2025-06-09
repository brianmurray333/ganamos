import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  try {
    console.log("=== EDGE FUNCTION CALLED ===")
    console.log("Request method:", req.method)
    console.log("Full URL:", req.url)

    const url = new URL(req.url)
    let postId, posterEmail, posterName, fixerName, postTitle, emailSubject

    // Handle both POST (JSON body) and GET (URL parameters) requests
    if (req.method === "POST") {
      const body = await req.json()
      postId = body.postId
      posterEmail = body.posterEmail
      posterName = body.posterName
      fixerName = body.fixerName
      postTitle = body.postTitle
      emailSubject = body.emailSubject // NEW: Extract custom subject
    } else if (req.method === "GET") {
      postId = url.searchParams.get("postId")
      posterEmail = url.searchParams.get("posterEmail")
      posterName = url.searchParams.get("posterName")
      fixerName = url.searchParams.get("fixerName")
      postTitle = url.searchParams.get("postTitle")
      emailSubject = url.searchParams.get("emailSubject") // NEW: Extract custom subject
    }

    console.log("Received parameters:", { postId, posterEmail, posterName, fixerName, postTitle, emailSubject })

    // If this is just a test call, return success
    if (url.searchParams.get("test")) {
      console.log("Test call - returning success")
      return new Response(JSON.stringify({ success: true, message: "Test successful" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    // Skip email sending if any required parameter is missing
    if (!postId || !posterEmail || !posterName || !postTitle) {
      console.log("Missing required parameters - skipping email")
      return new Response(JSON.stringify({ success: false, error: "Missing required parameters" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY")
    const fromEmail = Deno.env.get("FROM_EMAIL") || "noreply@ganamos.earth"
    const siteUrl = Deno.env.get("SITE_URL") || "https://ganamos.vercel.app"

    console.log("Email config:", { fromEmail, hasResendKey: !!resendApiKey })

    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured")
      throw new Error("RESEND_API_KEY not configured")
    }

    console.log(`Attempting to send email to ${posterEmail} for post ${postId}`)

    // NEW: Use custom subject if provided, otherwise use default
    const finalSubject = emailSubject || `Fix submitted for: ${postTitle}`
    console.log("Using email subject:", finalSubject)

    const emailData = {
      from: fromEmail,
      to: [posterEmail],
      subject: finalSubject, // NEW: Use dynamic subject
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #16a34a;">Someone submitted a fix for your issue! 🔧</h2>
          <p>Hi ${posterName},</p>
          <p><strong>${fixerName || "Someone"}</strong> has submitted a fix for your issue:</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <h3 style="margin: 0; color: #374151;">${postTitle}</h3>
          </div>
          <p>Please review and approve or reject the fix in the app.</p>
          <a href="${siteUrl}/post/${postId}" 
             style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Issue
          </a>
          <hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px;">
            This email was sent because someone submitted a fix for your issue on Ganamos!
          </p>
        </div>
      `,
    }

    console.log("Calling Resend API...")

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    })

    console.log("Resend API response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Resend API error:", response.status, errorText)
      throw new Error(`Resend API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    console.log("Email sent successfully:", result.id)

    return new Response(JSON.stringify({ success: true, emailId: result.id }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Email sending failed:", error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
