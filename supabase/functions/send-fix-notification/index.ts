import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  try {
    const { postId, posterEmail, posterName, fixerName, postTitle } = await req.json()

    const resendApiKey = Deno.env.get("RESEND_API_KEY")
    const fromEmail = Deno.env.get("FROM_EMAIL") || "noreply@ganamos.app"
    const siteUrl = Deno.env.get("SITE_URL") || "https://ganamos.vercel.app"

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured")
    }

    console.log(`Sending fix notification email to ${posterEmail} for post ${postId}`)

    const emailData = {
      from: fromEmail,
      to: [posterEmail],
      subject: `Fix submitted for: ${postTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #16a34a;">Someone submitted a fix for your issue! 🔧</h2>
          <p>Hi ${posterName},</p>
          <p><strong>${fixerName}</strong> has submitted a fix for your issue:</p>
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

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    })

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
