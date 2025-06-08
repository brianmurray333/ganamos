import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL")
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey)

serve(async (_req) => {
  try {
    console.log("Process-notification-queue function started.")

    // 1. Read unprocessed notifications
    const { data: notifications, error: fetchError } = await supabase
      .from("notification_queue")
      .select("*")
      .is("processed_at", null) // Only get unprocessed notifications
      .order("created_at", { ascending: true }) // Process oldest first
      .limit(10) // Process in batches of 10 to avoid timeouts or long runs

    if (fetchError) {
      console.error("Error fetching notifications:", fetchError)
      return new Response(
        JSON.stringify({ success: false, error: `Error fetching notifications: ${fetchError.message}` }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    if (!notifications || notifications.length === 0) {
      console.log("No new notifications to process.")
      return new Response(JSON.stringify({ success: true, message: "No new notifications to process" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    console.log(`Found ${notifications.length} notifications to process.`)
    let processedCount = 0
    let errorCount = 0

    // 2. Call send-fix-notification edge function for each
    for (const notification of notifications) {
      console.log(`Processing notification ID: ${notification.id} for post ID: ${notification.post_id}`)
      try {
        const payload = {
          postId: notification.post_id,
          posterEmail: notification.poster_email,
          posterName: notification.poster_name,
          fixerName: notification.fixer_name,
          postTitle: notification.post_title,
        }
        console.log("Invoking send-fix-notification with payload:", payload)

        const { data: functionResponse, error: functionError } = await supabase.functions.invoke(
          "send-fix-notification", // Name of your existing email sending function
          { body: payload },
        )

        if (functionError) {
          console.error(`Error invoking send-fix-notification for notification ${notification.id}:`, functionError)
          // Update status to 'failed' but don't throw, try next notification
          await supabase
            .from("notification_queue")
            .update({
              processed_at: new Date().toISOString(),
              status: `failed: invoke error - ${functionError.message?.substring(0, 200)}`,
              last_attempted_at: new Date().toISOString(),
            })
            .eq("id", notification.id)
          errorCount++
          continue // Move to the next notification
        }

        console.log(`send-fix-notification response for notification ${notification.id}:`, functionResponse)

        // Check if the invoked function itself reported an error
        if (functionResponse && functionResponse.success === false) {
          console.error(
            `send-fix-notification function reported failure for notification ${notification.id}:`,
            functionResponse.error,
          )
          await supabase
            .from("notification_queue")
            .update({
              processed_at: new Date().toISOString(),
              status: `failed: function error - ${String(functionResponse.error)?.substring(0, 200)}`,
              last_attempted_at: new Date().toISOString(),
            })
            .eq("id", notification.id)
          errorCount++
          continue
        }

        // 3. Mark notification as processed
        await supabase
          .from("notification_queue")
          .update({
            processed_at: new Date().toISOString(),
            status: "processed",
            last_attempted_at: new Date().toISOString(),
          })
          .eq("id", notification.id)

        console.log(`Notification ID: ${notification.id} processed successfully.`)
        processedCount++
      } catch (processError) {
        console.error(`Error during processing loop for notification ${notification.id}:`, processError)
        await supabase
          .from("notification_queue")
          .update({
            processed_at: new Date().toISOString(),
            status: `failed: loop error - ${processError.message?.substring(0, 200)}`,
            last_attempted_at: new Date().toISOString(),
          })
          .eq("id", notification.id)
        errorCount++
      }
    }

    console.log(`Processing complete. Processed: ${processedCount}, Errors: ${errorCount}`)
    return new Response(JSON.stringify({ success: true, processedCount, errorCount }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Critical error in process-notification-queue function:", error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
