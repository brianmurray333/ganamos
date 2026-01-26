import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import crypto from "crypto"

// Verify GitHub webhook signature
function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  
  const hmac = crypto.createHmac("sha256", secret)
  const digest = "sha256=" + hmac.update(payload).digest("hex")
  
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text()
    const signature = request.headers.get("x-hub-signature-256")
    const event = request.headers.get("x-github-event")
    
    // Verify webhook secret if configured
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET
    if (webhookSecret) {
      if (!verifySignature(payload, signature, webhookSecret)) {
        console.error("GitHub webhook signature verification failed")
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    }
    
    const data = JSON.parse(payload)
    
    // Only handle pull request events
    if (event !== "pull_request") {
      return NextResponse.json({ message: "Event ignored" }, { status: 200 })
    }
    
    const { action, pull_request } = data
    
    if (!pull_request) {
      return NextResponse.json({ error: "Missing pull request data" }, { status: 400 })
    }
    
    const supabase = createServerSupabaseClient()
    
    // Determine status based on action
    let status = "open"
    let merged_at = null
    
    if (action === "closed") {
      if (pull_request.merged) {
        status = "merged"
        merged_at = pull_request.merged_at
      } else {
        status = "closed"
      }
    } else if (action === "reopened") {
      status = "open"
    }
    
    console.log(`GitHub webhook: Processing PR #${pull_request.number} action=${action} status=${status}`)
    
    // Try to save the PR record using select-then-update/insert pattern
    // This avoids issues with missing unique constraints
    try {
      // First check if the PR already exists
      const { data: existing, error: selectError } = await supabase
        .from("admin_pr_log")
        .select("id")
        .eq("pr_number", pull_request.number)
        .maybeSingle()
      
      if (selectError) {
        console.error("Error checking existing PR:", selectError.message)
        return NextResponse.json({ 
          success: false, 
          warning: "Database error - table may not exist yet",
          action, 
          pr_number: pull_request.number 
        }, { status: 200 })
      }
      
      if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
          .from("admin_pr_log")
          .update({
            pr_url: pull_request.html_url,
            title: pull_request.title,
            status,
            author: pull_request.user?.login || "unknown",
            merged_at,
          })
          .eq("id", existing.id)
        
        if (updateError) {
          console.error("Error updating PR:", updateError.message)
          return NextResponse.json({ 
            success: false, 
            warning: "Database update error",
            action, 
            pr_number: pull_request.number 
          }, { status: 200 })
        }
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from("admin_pr_log")
          .insert({
            pr_number: pull_request.number,
            pr_url: pull_request.html_url,
            title: pull_request.title,
            status,
            author: pull_request.user?.login || "unknown",
            created_at: pull_request.created_at,
            merged_at,
          })
        
        if (insertError) {
          console.error("Error inserting PR:", insertError.message)
          return NextResponse.json({ 
            success: false, 
            warning: "Database insert error",
            action, 
            pr_number: pull_request.number 
          }, { status: 200 })
        }
      }
    } catch (dbError) {
      console.error("Database exception:", dbError)
      // Return 200 to prevent retries
      return NextResponse.json({ 
        success: false, 
        warning: "Database exception",
        action, 
        pr_number: pull_request.number 
      }, { status: 200 })
    }
    
    console.log(`GitHub webhook: PR #${pull_request.number} saved successfully`)
    
    return NextResponse.json({ success: true, action, pr_number: pull_request.number })
  } catch (error) {
    console.error("Error processing GitHub webhook:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Allow GitHub to verify the endpoint
export async function GET() {
  return NextResponse.json({ status: "GitHub webhook endpoint ready" })
}

