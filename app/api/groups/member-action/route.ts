import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { createServerSupabaseClient } from "@/lib/supabase"
import { v4 as uuidv4 } from "@/lib/uuid"

/**
 * Handle group member approval/rejection
 * Creates activities for both the requester and the admin
 * 
 * Note: Only the authenticated user (when logged in as themselves) can approve/reject.
 * Parents viewing as child accounts cannot approve requests for groups they admin.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { groupMemberId, action, groupId } = body

    if (!groupMemberId || !action || !groupId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      )
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 }
      )
    }

    // Use the official Supabase Next.js helper for proper session extraction in Route Handlers
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Use service role key for admin operations after authorization
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    // Verify the authenticated user is an admin of this group
    // Note: This intentionally uses user.id (not effectiveUserId) - only the actual
    // admin can approve/reject, not parents viewing as child accounts
    const { data: callerMembership, error: membershipError } = await adminSupabase
      .from("group_members")
      .select("role, status")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single()

    if (membershipError || !callerMembership) {
      console.error("Caller is not a member of the group")
      return NextResponse.json(
        { success: false, error: "You are not a member of this group" },
        { status: 403 }
      )
    }

    if (callerMembership.role !== "admin" || callerMembership.status !== "approved") {
      console.error("Caller is not an approved admin of the group")
      return NextResponse.json(
        { success: false, error: "Only group admins can approve or reject members" },
        { status: 403 }
      )
    }

    // Get the group member record
    const { data: memberRecord, error: memberError } = await adminSupabase
      .from("group_members")
      .select("id, user_id, group_id, status")
      .eq("id", groupMemberId)
      .single()

    if (memberError || !memberRecord) {
      console.error("Error fetching member record:", memberError)
      return NextResponse.json(
        { success: false, error: "Member record not found" },
        { status: 404 }
      )
    }

    // Get group details
    const { data: group, error: groupError } = await adminSupabase
      .from("groups")
      .select("id, name")
      .eq("id", groupId)
      .single()

    if (groupError || !group) {
      console.error("Error fetching group:", groupError)
      return NextResponse.json(
        { success: false, error: "Group not found" },
        { status: 404 }
      )
    }

    // Get requester profile
    const { data: requesterProfile } = await adminSupabase
      .from("profiles")
      .select("id, name")
      .eq("id", memberRecord.user_id)
      .single()

    const requesterName = requesterProfile?.name || "Someone"

    // Update the member status
    const newStatus = action === "approve" ? "approved" : "rejected"
    const { error: updateError } = await adminSupabase
      .from("group_members")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", groupMemberId)

    if (updateError) {
      console.error("Error updating member status:", updateError)
      return NextResponse.json(
        { success: false, error: "Failed to update member status" },
        { status: 500 }
      )
    }

    const nowIso = new Date().toISOString()

    // Create activity for the requester (approved or rejected)
    await adminSupabase.from("activities").insert({
      id: uuidv4(),
      user_id: memberRecord.user_id,
      type: action === "approve" ? "group_join_approved" : "group_join_rejected",
      related_id: groupId,
      related_table: "groups",
      timestamp: nowIso,
      metadata: {
        group_name: group.name,
        status: newStatus,
      },
    })

    return NextResponse.json({ 
      success: true, 
      status: newStatus,
      memberName: requesterName
    })
  } catch (error) {
    console.error("Error handling member action:", error)
    return NextResponse.json(
      { success: false, error: "Failed to process member action" },
      { status: 500 }
    )
  }
}

