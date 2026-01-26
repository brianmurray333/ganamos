"use server"

import { createServerSupabaseClient } from "@/lib/supabase"
import { cookies } from "next/headers"

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL

// Helper to verify admin access
async function verifyAdmin() {
  const cookieStore = cookies()
  const supabase = createServerSupabaseClient({ cookieStore })
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return { authorized: false, supabase: null }
  }
  
  return { authorized: true, supabase }
}

// ==================== ORDERS ====================

export async function getAdminOrders() {
  const { authorized, supabase } = await verifyAdmin()
  if (!authorized || !supabase) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const { data: orders, error } = await supabase
      .from("pet_orders")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching orders:", error)
      return { success: false, error: error.message }
    }

    return { success: true, orders: orders || [] }
  } catch (error) {
    console.error("Error in getAdminOrders:", error)
    return { success: false, error: "Failed to fetch orders" }
  }
}

export async function updateOrderStatus(orderId: string, status: string, trackingNumber?: string) {
  const { authorized, supabase } = await verifyAdmin()
  if (!authorized || !supabase) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const updates: any = { status }
    
    if (status === "shipped") {
      updates.shipped_at = new Date().toISOString()
      if (trackingNumber) {
        updates.tracking_number = trackingNumber
      }
    }

    const { error } = await supabase
      .from("pet_orders")
      .update(updates)
      .eq("id", orderId)

    if (error) {
      console.error("Error updating order:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in updateOrderStatus:", error)
    return { success: false, error: "Failed to update order" }
  }
}

// ==================== NODE HEALTH ====================

export async function getNodeHealth() {
  const { authorized } = await verifyAdmin()
  if (!authorized) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    // Import lndRequest from lightning module
    const { lndRequest } = await import("@/lib/lightning")
    
    // Make parallel requests to LND
    const [infoResult, walletResult, channelsResult] = await Promise.all([
      lndRequest("/v1/getinfo").catch(() => ({ success: false as const })),
      lndRequest("/v1/balance/blockchain").catch(() => ({ success: false as const })),
      lndRequest("/v1/channels").catch(() => ({ success: false as const })),
    ])

    if (!infoResult.success || !('data' in infoResult)) {
      return { success: false, error: "Could not connect to Lightning node" }
    }

    const info = infoResult.data
    const walletBalance = walletResult.success && 'data' in walletResult ? walletResult.data : null
    const channelsData = channelsResult.success && 'data' in channelsResult ? channelsResult.data : null

    const activeChannels = channelsData?.channels?.filter((c: any) => c.active) || []
    const totalCapacity = activeChannels.reduce((sum: number, c: any) => sum + parseInt(c.capacity || 0), 0)
    const localBalance = activeChannels.reduce((sum: number, c: any) => sum + parseInt(c.local_balance || 0), 0)
    const remoteBalance = activeChannels.reduce((sum: number, c: any) => sum + parseInt(c.remote_balance || 0), 0)

    return {
      success: true,
      data: {
        online: true,
        alias: info.alias || "Unknown",
        publicKey: info.identity_pubkey || "",
        blockHeight: parseInt(info.block_height || 0),
        syncedToChain: info.synced_to_chain || false,
        syncedToGraph: info.synced_to_graph || false,
        numActiveChannels: parseInt(info.num_active_channels || 0),
        numPeers: parseInt(info.num_peers || 0),
        totalCapacity,
        localBalance,
        remoteBalance,
        pendingChannels: parseInt(info.num_pending_channels || 0),
        onchainBalance: parseInt(walletBalance?.confirmed_balance || 0),
        onchainUnconfirmed: parseInt(walletBalance?.unconfirmed_balance || 0),
      }
    }
  } catch (error) {
    console.error("Error in getNodeHealth:", error)
    return { success: false, error: "Failed to get node health" }
  }
}

// ==================== BALANCE AUDIT ====================

export async function getAuditStatus() {
  const { authorized, supabase } = await verifyAdmin()
  if (!authorized || !supabase) {
    return { success: false, error: "Unauthorized" }
  }

  // For now, return placeholder data
  // In production, this would fetch from an audit log table
  return {
    success: true,
    data: {
      lastRunAt: new Date().toISOString(),
      status: "passed" as const,
      totalUsers: 0,
      usersWithDiscrepancies: 0,
      totalDiscrepancy: 0,
      details: []
    }
  }
}

export async function triggerBalanceAudit() {
  const { authorized, supabase } = await verifyAdmin()
  if (!authorized || !supabase) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    // Get all users with their balances
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, balance")

    if (profilesError) {
      return { success: false, error: profilesError.message }
    }

    // Get all transactions to calculate expected balances
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("user_id, type, amount, status")
      .eq("status", "completed")

    if (txError) {
      return { success: false, error: txError.message }
    }

    // Calculate expected balances using the same logic as daily-summary.ts
    const expectedBalances: Record<string, number> = {}
    
    for (const tx of transactions || []) {
      if (!expectedBalances[tx.user_id]) {
        expectedBalances[tx.user_id] = 0
      }
      
      // Match the logic in daily-summary.ts:
      // - deposit: adds positive amount
      // - withdrawal: subtracts the amount
      // - internal: the amount already has the correct sign (positive = received, negative = sent)
      if (tx.type === 'deposit') {
        expectedBalances[tx.user_id] += tx.amount
      } else if (tx.type === 'withdrawal') {
        expectedBalances[tx.user_id] -= tx.amount
      } else if (tx.type === 'internal') {
        // For internal transfers, amount is already signed correctly
        expectedBalances[tx.user_id] += tx.amount
      }
      // Other transaction types (like rewards, etc.) are not directly balance-affecting
      // or are already captured in internal transfers
    }

    // Compare with actual balances
    const discrepancies: any[] = []
    let totalDiscrepancy = 0

    for (const profile of profiles || []) {
      const expected = expectedBalances[profile.id] || 0
      const actual = profile.balance || 0
      
      if (expected !== actual) {
        const diff = actual - expected
        discrepancies.push({
          userId: profile.id,
          username: profile.username,
          expectedBalance: expected,
          actualBalance: actual,
          difference: diff
        })
        totalDiscrepancy += Math.abs(diff)
      }
    }

    return {
      success: true,
      data: {
        lastRunAt: new Date().toISOString(),
        status: discrepancies.length === 0 ? "passed" as const : "failed" as const,
        totalUsers: profiles?.length || 0,
        usersWithDiscrepancies: discrepancies.length,
        totalDiscrepancy,
        details: discrepancies
      }
    }
  } catch (error) {
    console.error("Error in triggerBalanceAudit:", error)
    return { success: false, error: "Failed to run audit" }
  }
}

// ==================== USER SEARCH ====================

export async function searchUsers(query: string) {
  const { authorized, supabase } = await verifyAdmin()
  if (!authorized || !supabase) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const { data: users, error } = await supabase
      .from("profiles")
      .select("*")
      .or(`email.ilike.%${query}%,username.ilike.%${query}%,id.eq.${query}`)
      .limit(50)

    if (error) {
      console.error("Error searching users:", error)
      return { success: false, error: error.message }
    }

    return { success: true, users: users || [] }
  } catch (error) {
    console.error("Error in searchUsers:", error)
    return { success: false, error: "Failed to search users" }
  }
}

// ==================== POST SEARCH ====================

export async function searchPosts(query: string) {
  const { authorized, supabase } = await verifyAdmin()
  if (!authorized || !supabase) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const { data: posts, error } = await supabase
      .from("posts")
      .select(`
        *,
        author:user_id(id, name, username)
      `)
      .or(`title.ilike.%${query}%,location.ilike.%${query}%,id.eq.${query}`)
      .limit(50)

    if (error) {
      console.error("Error searching posts:", error)
      return { success: false, error: error.message }
    }

    return { success: true, posts: posts || [] }
  } catch (error) {
    console.error("Error in searchPosts:", error)
    return { success: false, error: "Failed to search posts" }
  }
}

// ==================== TRANSACTION SEARCH ====================

export async function searchTransactions(query: string) {
  const { authorized, supabase } = await verifyAdmin()
  if (!authorized || !supabase) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("id, type, amount, status, created_at, user_id, payment_hash, memo")
      .or(`id.eq.${query},payment_hash.ilike.%${query}%,user_id.eq.${query}`)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("Error searching transactions:", error)
      return { success: false, error: error.message }
    }

    return { success: true, transactions: transactions || [] }
  } catch (error) {
    console.error("Error in searchTransactions:", error)
    return { success: false, error: "Failed to search transactions" }
  }
}

// ==================== SERVICE STATUS ====================

export async function checkServiceStatus() {
  const { authorized } = await verifyAdmin()
  if (!authorized) {
    return { success: false, error: "Unauthorized" }
  }

  const services: any[] = []
  const now = new Date().toISOString()

  // Check Lightning Node
  try {
    const { lndRequest } = await import("@/lib/lightning")
    const start = Date.now()
    const result = await lndRequest("/v1/getinfo")
    const latency = Date.now() - start
    
    services.push({
      name: "Lightning Node",
      status: result.success ? "online" : "offline",
      latency,
      lastChecked: now,
      details: result.success && 'data' in result ? result.data?.alias : undefined
    })
  } catch {
    services.push({
      name: "Lightning Node",
      status: "offline",
      lastChecked: now
    })
  }

  // Check Supabase
  try {
    const supabase = createServerSupabaseClient()
    const start = Date.now()
    await supabase.from("profiles").select("id").limit(1)
    const latency = Date.now() - start
    
    services.push({
      name: "Supabase",
      status: "online",
      latency,
      lastChecked: now
    })
  } catch {
    services.push({
      name: "Supabase",
      status: "offline",
      lastChecked: now
    })
  }

  // Check Resend (just verify env var exists)
  services.push({
    name: "Resend Email",
    status: process.env.RESEND_API_KEY ? "online" : "offline",
    lastChecked: now,
    details: process.env.RESEND_API_KEY ? "API key configured" : "API key missing"
  })

  // Check Google Maps
  services.push({
    name: "Google Maps",
    status: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? "online" : "offline",
    lastChecked: now,
    details: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? "API key configured" : "API key missing"
  })

  // Check Groq
  services.push({
    name: "Groq AI",
    status: process.env.GROQ_API_KEY ? "online" : "offline",
    lastChecked: now,
    details: process.env.GROQ_API_KEY ? "API key configured" : "API key missing"
  })

  // Check GitHub
  services.push({
    name: "GitHub",
    status: process.env.GITHUB_TOKEN ? "online" : "offline",
    lastChecked: now,
    details: process.env.GITHUB_TOKEN ? "API token configured" : "API token missing"
  })

  return { success: true, services }
}

// ==================== PR LOG ====================

export async function getPRLog() {
  const { authorized, supabase } = await verifyAdmin()
  if (!authorized || !supabase) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const { data: prs, error } = await supabase
      .from("admin_pr_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) {
      // Table might not exist yet
      if (error.code === "42P01") {
        return { success: true, prs: [] }
      }
      console.error("Error fetching PRs:", error)
      return { success: false, error: error.message }
    }

    return { success: true, prs: prs || [] }
  } catch (error) {
    console.error("Error in getPRLog:", error)
    return { success: false, error: "Failed to fetch PR log" }
  }
}

// ==================== SYSTEM SETTINGS / KILL SWITCHES ====================

export async function getSystemSettings() {
  const { authorized, supabase } = await verifyAdmin()
  if (!authorized || !supabase) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("*")
      .eq("id", "main")
      .single()

    if (error) {
      console.error("Error fetching system settings:", error)
      return { success: false, error: error.message }
    }

    return { 
      success: true, 
      settings: {
        withdrawalsEnabled: data?.withdrawals_enabled ?? true,
        signupsEnabled: data?.signups_enabled ?? true,
        updatedAt: data?.updated_at,
        updatedBy: data?.updated_by
      }
    }
  } catch (error) {
    console.error("Error in getSystemSettings:", error)
    return { success: false, error: "Failed to fetch system settings" }
  }
}

export async function toggleWithdrawals(enabled: boolean, reason?: string) {
  const { authorized, supabase } = await verifyAdmin()
  if (!authorized || !supabase) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const { error } = await supabase
      .from("system_settings")
      .update({
        withdrawals_enabled: enabled,
        updated_at: new Date().toISOString(),
        updated_by: reason || (enabled ? "admin_enabled" : "admin_disabled")
      })
      .eq("id", "main")

    if (error) {
      console.error("Error toggling withdrawals:", error)
      return { success: false, error: error.message }
    }

    console.log(`[ADMIN] Withdrawals ${enabled ? 'ENABLED' : 'DISABLED'} by admin. Reason: ${reason || 'manual toggle'}`)
    
    return { success: true, enabled }
  } catch (error) {
    console.error("Error in toggleWithdrawals:", error)
    return { success: false, error: "Failed to toggle withdrawals" }
  }
}

export async function toggleSignups(enabled: boolean, reason?: string) {
  const { authorized, supabase } = await verifyAdmin()
  if (!authorized || !supabase) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const { error } = await supabase
      .from("system_settings")
      .update({
        signups_enabled: enabled,
        updated_at: new Date().toISOString(),
        updated_by: reason || (enabled ? "admin_enabled" : "admin_disabled")
      })
      .eq("id", "main")

    if (error) {
      console.error("Error toggling signups:", error)
      return { success: false, error: error.message }
    }

    console.log(`[ADMIN] Signups ${enabled ? 'ENABLED' : 'DISABLED'} by admin. Reason: ${reason || 'manual toggle'}`)
    
    return { success: true, enabled }
  } catch (error) {
    console.error("Error in toggleSignups:", error)
    return { success: false, error: "Failed to toggle signups" }
  }
}

// ==================== ADMIN STATS ====================

export async function getAdminStats() {
  const { authorized, supabase } = await verifyAdmin()
  if (!authorized || !supabase) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const [ordersResult, usersResult, postsResult, transactionsResult] = await Promise.all([
      supabase.from("pet_orders").select("id, status", { count: "exact" }),
      supabase.from("profiles").select("id", { count: "exact" }),
      supabase.from("posts").select("id", { count: "exact" }),
      supabase.from("transactions").select("id", { count: "exact" }),
    ])

    const orders = ordersResult.data || []
    const pendingOrders = orders.filter((o: any) => o.status === "pending").length

    return {
      success: true,
      stats: {
        totalOrders: ordersResult.count || 0,
        pendingOrders,
        totalUsers: usersResult.count || 0,
        totalPosts: postsResult.count || 0,
        totalTransactions: transactionsResult.count || 0,
      }
    }
  } catch (error) {
    console.error("Error in getAdminStats:", error)
    return { success: false, error: "Failed to fetch stats" }
  }
}

