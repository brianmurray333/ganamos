import { vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Helper utilities for testing the balance-check script
 * Provides reusable mocks and setup functions
 */

/**
 * Sets up console spies for capturing console.log and console.error output
 * @returns Object containing spies for log and error
 */
export function setupConsoleMocks() {
  const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  
  return { consoleLogSpy, consoleErrorSpy };
}

/**
 * Creates a mock Supabase client with chainable methods for balance-check testing
 * @returns Mock Supabase client object
 */
export function createBalanceCheckSupabaseMock() {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };

  // Mock createClient to return our mock
  (createClient as any).mockReturnValue(mockSupabase);
  
  return mockSupabase;
}

/**
 * Mock implementation of calculateUserBalance that mirrors the actual script
 * This can be used to test the balance calculation logic without executing the real script
 */
export const mockCalculateUserBalance = (mockSupabase: any) => 
  async (userId: string, userName: string) => {
    console.log(`🔍 Calculating balance for ${userName} (${userId})`);
    console.log("");

    try {
      // Get current profile balance
      const { data: profile, error: profileError } = await mockSupabase
        .from("profiles")
        .select("balance")
        .eq("id", userId)
        .single();

      if (profileError) {
        console.error("Error fetching profile:", profileError);
        return;
      }

      console.log("📊 Current Profile Balance:", profile.balance);
      console.log("");

      // Get all transactions
      const { data: transactions, error: txError } = await mockSupabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (txError) {
        console.error("Error fetching transactions:", txError);
        return;
      }

      console.log("📋 All Transactions:");
      console.log("ID | Type | Amount | Status | Created At | Memo");
      console.log("---|------|--------|--------|------------|-----");

      transactions.forEach((tx: any) => {
        const date = new Date(tx.created_at).toLocaleDateString();
        console.log(
          `${tx.id.substring(0, 8)}... | ${tx.type} | ${tx.amount} | ${tx.status} | ${date} | ${tx.memo || "N/A"}`
        );
      });

      console.log("");

      // Calculate balance from transactions
      let calculatedBalance = 0;
      const breakdown = {
        deposits: 0,
        withdrawals: 0,
        internal: 0,
      };

      transactions.forEach((tx: any) => {
        if (tx.status === "completed") {
          if (tx.type === "deposit") {
            calculatedBalance += tx.amount;
            breakdown.deposits += tx.amount;
          } else if (tx.type === "withdrawal") {
            calculatedBalance -= tx.amount;
            breakdown.withdrawals += tx.amount;
          } else if (tx.type === "internal") {
            calculatedBalance += tx.amount;
            breakdown.internal += tx.amount;
          }
        }
      });

      console.log("🧮 Balance Calculation:");
      console.log(`  Deposits: +${breakdown.deposits}`);
      console.log(`  Withdrawals: -${breakdown.withdrawals}`);
      console.log(`  Internal: +${breakdown.internal}`);
      console.log(`  Calculated Balance: ${calculatedBalance}`);
      console.log("");

      console.log("📈 Summary:");
      console.log(`  Profile Balance: ${profile.balance}`);
      console.log(`  Calculated Balance: ${calculatedBalance}`);
      console.log(`  Difference: ${profile.balance - calculatedBalance}`);

      if (profile.balance !== calculatedBalance) {
        console.log("⚠️  WARNING: Balance mismatch detected!");
        console.log(
          `   The profile balance (${profile.balance}) does not match the calculated balance (${calculatedBalance})`
        );
      } else {
        console.log("✅ Balance is consistent!");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

/**
 * Sets up profile mock response
 * @param mockSupabase Mock Supabase client
 * @param profile Profile data to return
 * @param error Optional error to return
 */
export function mockProfileResponse(
  mockSupabase: any,
  profile: { balance: number } | null,
  error: any = null
) {
  mockSupabase.single.mockResolvedValueOnce({
    data: profile,
    error,
  });
}

/**
 * Sets up transactions mock response
 * @param mockSupabase Mock Supabase client
 * @param transactions Transaction data to return
 * @param error Optional error to return
 */
export function mockTransactionsResponse(
  mockSupabase: any,
  transactions: any[] | null,
  error: any = null
) {
  mockSupabase.order.mockResolvedValueOnce({
    data: transactions,
    error,
  });
}
