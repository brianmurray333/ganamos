"use server"

import { createServerSupabaseClient } from "@/lib/supabase"
import { createInvoice, checkInvoice, payInvoice } from "@/lib/lightning"
import { serverEnv } from "@/lib/env"
import { revalidatePath } from "next/cache"
import { v4 as uuidv4 } from "uuid"
import { sendBitcoinReceivedEmail } from "@/lib/transaction-emails"
import { alertLargeDeposit } from "@/lib/sms-alerts"

// Dynamic import for cookies to avoid issues with pages directory
async function getCookieStore() {
  const { cookies } = await import("next/headers")
  return cookies()
}

/**
 * Create a deposit invoice for a user
 */
export async function createDepositInvoice(amount: number, userId: string) {
  try {
    console.log("Creating deposit invoice for user:", userId, "Amount:", amount)

    // Create a Supabase client with the user's session
    const cookieStore = await getCookieStore()
    // Use auth helpers version for proper session handling in Server Actions
    const supabase = createServerSupabaseClient({ cookieStore })

    // Get the current user (auth helpers version reads from cookies)
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      console.error("Session error:", sessionError)
      return { success: false, error: "Authentication error", details: sessionError.message }
    }

    // SECURITY: Verify userId is either the authenticated user OR a connected account
    const authenticatedUserId = session?.user?.id

    // Allow userId fallback when no session exists (for server-side operations)
    let effectiveUserId: string
    if (authenticatedUserId) {
      // Session exists - verify authorization
      const isOwnAccount = authenticatedUserId === userId
      let isAuthorized = isOwnAccount

      if (!isOwnAccount) {
        // Check if userId is a connected account
        const { data: connectedAccount } = await supabase
          .from('connected_accounts')
          .select('id')
          .eq('primary_user_id', authenticatedUserId)
          .eq('connected_user_id', userId)
          .maybeSingle()

        isAuthorized = !!connectedAccount
      }

      if (!isAuthorized) {
        console.error('SECURITY ALERT: User attempted to create deposit for another account', {
          authenticatedUserId,
          requestedUserId: userId
        })
        return { success: false, error: "Unauthorized: Cannot create deposit for another user" }
      }

      effectiveUserId = userId
      console.log("Creating invoice for user:", userId, "(authenticated as:", authenticatedUserId, ")")
    } else {
      // No session - use userId fallback if provided
      if (!userId) {
        console.error("No authenticated session and no userId provided")
        return { success: false, error: "Not authenticated" }
      }
      effectiveUserId = userId
      console.log("Creating invoice for user:", userId, "(no session - using userId fallback)")
    }

    // Use service role key for admin access to bypass RLS
    const adminSupabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    // Check if the transactions table exists
    const { error: tableCheckError } = await adminSupabase.from("transactions").select("id").limit(1)

    if (tableCheckError) {
      console.error("Transactions table check error:", tableCheckError)
      return { success: false, error: "Transactions table not found. Please run the database migrations." }
    }

    // Create a memo for the invoice
    const memo = amount > 0 ? `Deposit ${amount} sats to Ganamos!` : `Deposit to Ganamos!`

    // Create the invoice using the Lightning API
    // If amount is 0, create a no-value invoice that allows sender to specify amount
    const invoiceResult = await createInvoice(amount, memo)

    if (!invoiceResult.success) {
      return {
        success: false,
        error: "Failed to create invoice",
        details: invoiceResult.error || invoiceResult.details,
      }
    }

    // Convert binary r_hash to hex string if needed
    let rHashStr = invoiceResult.rHash
    if (typeof rHashStr === "object" && rHashStr !== null) {
      // If it's a Buffer or similar binary object, convert to hex string
      rHashStr = Buffer.from(rHashStr).toString("hex")
    }

    // Store the invoice in the database with explicit data types
    const { data, error } = await adminSupabase
      .from("transactions")
      .insert({
        user_id: effectiveUserId,
        type: "deposit",
        amount: amount,
        status: "pending",
        r_hash_str: rHashStr || null,
        payment_request: invoiceResult.paymentRequest || null,
        memo: memo || null,
      })
      .select()

    if (error) {
      console.error("Error storing invoice:", error)
      return { success: false, error: "Failed to store invoice: " + error.message }
    }

    console.log("Invoice created successfully:", rHashStr)

    return {
      success: true,
      paymentRequest: invoiceResult.paymentRequest,
      rHash: rHashStr,
    }
  } catch (error) {
    console.error("Unexpected error in createDepositInvoice:", error)
    return {
      success: false,
      error: "An unexpected error occurred",
      details: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Check if a deposit invoice has been paid
 * SECURITY: Requires live session and verifies transaction ownership
 */
export async function checkDepositStatus(rHash: string) {
  try {
    console.log("[checkDepositStatus] Starting for rHash:", rHash?.substring(0, 16) + "...")

    const cookieStore = await getCookieStore()
    const supabase = createServerSupabaseClient({ cookieStore })

    // SECURITY: Require live session - no fallback to userId parameter
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    console.log("[checkDepositStatus] Session check:", {
      hasSession: !!session,
      sessionError: sessionError?.message || null,
    })

    if (sessionError || !session) {
      console.error("[checkDepositStatus] Session error:", sessionError)
      return { success: false, error: "Not authenticated", sessionError: sessionError?.message }
    }

    const userId = session.user.id

    // Check the invoice status
    console.log("[checkDepositStatus] Calling checkInvoice...")
    const invoiceStatus = await checkInvoice(rHash)
    console.log("[checkDepositStatus] checkInvoice result:", JSON.stringify(invoiceStatus))

    if (!invoiceStatus.success) {
      console.error("[checkDepositStatus] Invoice check failed:", invoiceStatus.error)
      return { success: false, error: "Failed to check invoice status", details: invoiceStatus.error || invoiceStatus.details }
    }

    console.log("[checkDepositStatus] Invoice status:", {
      settled: invoiceStatus.settled,
      amountPaid: invoiceStatus.amountPaid,
      state: invoiceStatus.state,
    })

    // If the invoice is settled, update the transaction and user balance
    if (invoiceStatus.settled && invoiceStatus.settled === true) {
      console.log("Invoice is settled! Processing payment for user:", userId)
      console.log("Actual amount paid:", invoiceStatus.amountPaid, "sats")

      // Use service role key for admin access to bypass RLS
      const adminSupabase = createServerSupabaseClient({
        supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
      })

      // SECURITY: Get the transaction and verify it belongs to the authenticated user
      const { data: transaction } = await adminSupabase
        .from("transactions")
        .select("*")
        .eq("r_hash_str", rHash)
        .eq("status", "pending")
        .single()

      if (!transaction) {
        console.log("Transaction not found or already processed - checking if it was already completed")
        
        // Check if transaction was already completed
        const { data: completedTransaction } = await adminSupabase
          .from("transactions")
          .select("*")
          .eq("r_hash_str", rHash)
          .eq("status", "completed")
          .single()
          
        if (completedTransaction) {
          // SECURITY: Verify this transaction belongs to the authenticated user
          if (completedTransaction.user_id !== userId) {
            console.error("SECURITY ALERT: User attempted to access transaction belonging to another user", {
              userId,
              transactionUserId: completedTransaction.user_id,
              rHash
            })
            return { success: false, error: "Unauthorized" }
          }
          
          console.log("Transaction was already completed successfully")
          return { 
            success: true, 
            settled: true, 
            amount: completedTransaction.amount,
            newBalance: null // Don't update balance again
          }
        }
        
        return { success: false, error: "Transaction not found or already processed" }
      }

      // SECURITY: Verify the transaction belongs to the authenticated user
      if (transaction.user_id !== userId) {
        console.error("SECURITY ALERT: User attempted to credit transaction belonging to another user", {
          userId,
          transactionUserId: transaction.user_id,
          rHash,
          transactionId: transaction.id
        })
        return { success: false, error: "Unauthorized: Transaction does not belong to authenticated user" }
      }

      // CRITICAL: Use the actual amount paid, not the pre-specified amount
      const actualAmountPaid = parseInt(invoiceStatus.amountPaid || transaction.amount)
      console.log("Found transaction:", transaction.id, "Pre-specified amount:", transaction.amount, "Actual amount paid:", actualAmountPaid)
      
      
      // SECURITY: Log amount mismatches for monitoring
      if (transaction.amount !== actualAmountPaid) {
        console.warn("SECURITY ALERT: Amount mismatch detected!", {
          transactionId: transaction.id,
          preSpecifiedAmount: transaction.amount,
          actualAmountPaid: actualAmountPaid,
          userId: userId,
          rHash: rHash
        })
      }

      // Get the user's current balance and pet_coins
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("balance, pet_coins")
        .eq("id", userId)
        .single()

      if (!profile) {
        console.error("User profile not found")
        return { success: false, error: "User profile not found" }
      }

      console.log("Current balance:", profile.balance, "Type:", typeof profile.balance)
      console.log("Current pet_coins:", profile.pet_coins, "Type:", typeof profile.pet_coins)
      const newBalance = parseInt(profile.balance) + actualAmountPaid
      // When user earns sats (deposit), also add to pet_coins (1:1 conversion)
      const currentCoins = parseInt(profile.pet_coins || "0")
      const newCoins = currentCoins + actualAmountPaid
      console.log("New balance will be:", newBalance, "New coins will be:", newCoins, "Adding:", actualAmountPaid)

      // Update transaction status AND amount with actual amount paid
      const { error: txError } = await adminSupabase
        .from("transactions")
        .update({
          status: "completed",
          amount: actualAmountPaid, // Update with actual amount paid
          updated_at: new Date().toISOString(),
        })
        .eq("id", transaction.id)

      if (txError) {
        console.error("Error updating transaction:", txError)
        return { success: false, error: "Failed to update transaction" }
      }

      console.log("Transaction updated successfully")

      // Update user balance and pet_coins
      const { error: balanceError } = await adminSupabase
        .from("profiles")
        .update({
          balance: newBalance,
          pet_coins: newCoins,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)

      if (balanceError) {
        console.error("Error updating balance:", balanceError)
        return { success: false, error: "Failed to update balance" }
      }

      console.log("Balance updated successfully to:", newBalance, "Coins updated to:", newCoins)

      // Revalidate the profile page to show updated balance
      revalidatePath("/profile")
      revalidatePath("/dashboard")
      revalidatePath("/wallet")

      // Add activity for deposit (only if amount > 0)
      if (actualAmountPaid > 0) {
        await adminSupabase.from("activities").insert({
          id: uuidv4(),
          user_id: userId,
          type: "deposit",
          related_id: transaction.id,
          related_table: "transactions",
          timestamp: new Date().toISOString(),
          metadata: { amount: actualAmountPaid, status: "completed" },
        })
      }

      // Send email notification (only if user has verified email)
      const { data: recipientProfile } = await adminSupabase
        .from("profiles")
        .select("email, name")
        .eq("id", userId)
        .single()

      if (recipientProfile?.email && !recipientProfile.email.includes('@ganamos.app')) {
        // Send email asynchronously (don't block on email sending)
        sendBitcoinReceivedEmail({
          toEmail: recipientProfile.email,
          userName: recipientProfile.name || "User",
          amountSats: actualAmountPaid,
          date: new Date(),
          transactionType: 'deposit'
        }).catch(error => {
          console.error("Error sending Bitcoin received email:", error)
          // Don't fail the transaction if email fails
        })
      }

      // SECURITY: Send SMS alert for large deposits
      alertLargeDeposit(userId, actualAmountPaid, recipientProfile?.email)
        .catch(err => console.error("[Security Alert] SMS for large deposit failed:", err))

      return {
        success: true,
        settled: true,
        amount: actualAmountPaid,
        newBalance,
      }
    }

    return {
      success: true,
      settled: false,
    }
  } catch (error) {
    console.error("Unexpected error in checkDepositStatus:", error)
    return {
      success: false,
      error: "An unexpected error occurred",
      details: error instanceof Error ? error.message : String(error),
    }
  }
}
