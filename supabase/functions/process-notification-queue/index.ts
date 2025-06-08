import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL")
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (_req) => {
  try {
    console.log("Processing notification queue...")

    // 1. Read unprocessed notifications
    const { data: notifications, error: fetchError } = await supabase
      .from("notification_queue")
      .select("*")
      .is("processed_at", null) // Only get unprocessed notifications
      .order("created_at", { ascending: true }) // Process oldest first
      .limit(10) // Process in batches of 10 to avoid timeouts

    if (fetchError) {
      console.error("Error fetching notifications:", fetchError)
      throw fetchError
    }

    if (!notifications || notifications.length === 0) {
      console.log("No notifications to process.")
      return new Response(JSON.stringify({ success: true, message: "No notifications to process" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    console.log(`Found ${notifications.length} notifications to process.`)

    // 2. Call send-fix-notification edge function for each
    for (const notification of notifications) {
      console.log(`Processing notification ID: ${notification.id} for post ID: ${notification.post_id}`)
      try {
        const { data: functionResponse, error: functionError } = await supabase.functions.invoke(
          "send-fix-notification", // Name of your existing email sending function
          {
            body: {
              postId: notification.post_id,
              posterEmail: notification.poster_email,
              posterName: notification.poster_name,
              fixerName: notification.fixer_name,
              postTitle: notification.post_title,
            },
          },
        )

        if (functionError) {
          console.error(`Error invoking send-fix-notification for notification ${notification.id}:`, functionError)
          // Update status to 'failed' but don't throw, try next notification
          await supabase
            .from("notification_queue")
            .update({ processed_at: new Date().toISOString(), status: `failed: ${functionError.message}` })
            .eq("id", notification.id)
          continue // Move to the next notification
        }

        console.log(`send-fix-notification response for notification ${notification.id}:`, functionResponse)

        // 3. Mark notification as processed
        await supabase
          .from("notification_queue")
          .update({ processed_at: new Date().toISOString(), status: "processed" })
          .eq("id", notification.id)

        console.log(`Notification ID: ${notification.id} processed successfully.`)
      } catch (processError) {
        console.error(`Error processing notification ${notification.id}:`, processError)
        // Update status to 'failed'
        await supabase
          .from("notification_queue")
          .update({ processed_at: new Date().toISOString(), status: `failed: ${processError.message}` })
          .eq("id", notification.id)
      }
    }

    return new Response(JSON.stringify({ success: true, processedCount: notifications.length }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Error processing notification queue:", error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
