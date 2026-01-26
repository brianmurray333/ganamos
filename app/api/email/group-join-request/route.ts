import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { sendGroupJoinRequestEmail, sendGroupJoinRequestConfirmationEmail } from "@/lib/transaction-emails"
import { v4 as uuidv4 } from "@/lib/uuid"

/**
 * Send email notification to group admins when someone requests to join
 * Also creates activities for the requester and admins
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { groupId, requesterId } = body

    if (!groupId || !requesterId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      )
    }

    // Use service role key for admin access to bypass RLS
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

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
    const { data: requesterProfile, error: requesterError } = await adminSupabase
      .from("profiles")
      .select("id, name, email")
      .eq("id", requesterId)
      .single()

    if (requesterError) {
      console.error("Error fetching requester profile:", requesterError)
    }

    const requesterName = requesterProfile?.name || "Someone"

    // Get all admin members of the group
    const { data: adminMembers, error: adminsError } = await adminSupabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("role", "admin")
      .eq("status", "approved")

    if (adminsError) {
      console.error("Error fetching admin members:", adminsError)
      return NextResponse.json(
        { success: false, error: "Failed to fetch admins" },
        { status: 500 }
      )
    }

    if (!adminMembers?.length) {
      return NextResponse.json(
        { success: false, error: "No admins found for group" },
        { status: 404 }
      )
    }

    // Get admin profiles with emails
    const adminIds = adminMembers.map((m) => m.user_id)
    const { data: adminProfiles, error: profilesError } = await adminSupabase
      .from("profiles")
      .select("id, email, name")
      .in("id", adminIds)

    if (profilesError) {
      console.error("Error fetching admin profiles:", profilesError)
      return NextResponse.json(
        { success: false, error: "Failed to fetch admin profiles" },
        { status: 500 }
      )
    }

    const requestDate = new Date()
    const nowIso = requestDate.toISOString()
    const emailPromises: Promise<any>[] = []
    const activityPromises: Promise<any>[] = []

    // Create activity for the requester
    activityPromises.push(
      adminSupabase.from("activities").insert({
        id: uuidv4(),
        user_id: requesterId,
        type: "group_join_requested",
        related_id: groupId,
        related_table: "groups",
        timestamp: nowIso,
        metadata: {
          group_name: group.name,
          status: "pending",
        },
      }).then(({ error }) => {
        if (error) console.error("Error creating requester activity:", error)
      })
    )

    // Create activity for each admin
    for (const admin of adminProfiles || []) {
      activityPromises.push(
        adminSupabase.from("activities").insert({
          id: uuidv4(),
          user_id: admin.id,
          type: "group_join_request_received",
          related_id: groupId,
          related_table: "groups",
          timestamp: nowIso,
          metadata: {
            group_name: group.name,
            requester_name: requesterName,
            requester_id: requesterId,
            status: "pending",
          },
        }).then(({ error }) => {
          if (error) console.error("Error creating admin activity:", error)
        })
      )
    }

    // Send email to each admin (only if they have a valid email)
    for (const admin of adminProfiles || []) {
      // Skip child accounts (emails ending with @ganamos.app) and null emails
      if (!admin.email || admin.email.includes("@ganamos.app")) {
        continue
      }

      emailPromises.push(
        sendGroupJoinRequestEmail({
          toEmail: admin.email,
          adminName: admin.name || "Admin",
          requesterName,
          groupName: group.name,
          groupId: group.id,
          date: requestDate,
        }).catch((error) => {
          console.error(`Error sending email to ${admin.email}:`, error)
        })
      )
    }

    // Send confirmation email to the requester
    if (requesterProfile?.email && !requesterProfile.email.includes("@ganamos.app")) {
      emailPromises.push(
        sendGroupJoinRequestConfirmationEmail({
          toEmail: requesterProfile.email,
          requesterName,
          groupName: group.name,
          date: requestDate,
        }).catch((error) => {
          console.error(`Error sending confirmation email to ${requesterProfile.email}:`, error)
        })
      )
    }

    // Send all emails and create activities in parallel
    await Promise.all([...emailPromises, ...activityPromises])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error sending group join request emails:", error)
    return NextResponse.json(
      { success: false, error: "Failed to send email notifications" },
      { status: 500 }
    )
  }
}

