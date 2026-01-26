import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestTransaction } from "../helpers/transaction-test-utils";
import {
  setupConsoleMocks,
  createBalanceCheckSupabaseMock,
  mockCalculateUserBalance,
} from "../helpers/balance-check-helpers";

// Mock the Supabase client
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

describe("calculateUserBalance - Script Function", () => {
  let mockSupabase: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let calculateUserBalance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup console mocks using helper
    const consoleMocks = setupConsoleMocks();
    consoleLogSpy = consoleMocks.consoleLogSpy;
    consoleErrorSpy = consoleMocks.consoleErrorSpy;

    // Create mock Supabase client using helper
    mockSupabase = createBalanceCheckSupabaseMock();

    // Get the mock implementation of calculateUserBalance
    calculateUserBalance = mockCalculateUserBalance(mockSupabase);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("Successful Balance Calculations", () => {
    it("should correctly calculate and display balance when profile matches transaction history", async () => {
      // Arrange
      const userId = "test-user-123";
      const userName = "Test User";
      const profile = { balance: 5000 };
      const transactions = [
        createTestTransaction({
          id: "tx-1",
          user_id: userId,
          type: "deposit",
          amount: 10000,
          status: "completed",
          created_at: "2024-01-01T00:00:00Z",
        }),
        createTestTransaction({
          id: "tx-2",
          user_id: userId,
          type: "withdrawal",
          amount: 5000,
          status: "completed",
          created_at: "2024-01-02T00:00:00Z",
        }),
      ];

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert - Verify database queries
      expect(mockSupabase.from).toHaveBeenCalledWith("profiles");
      expect(mockSupabase.from).toHaveBeenCalledWith("transactions");
      expect(mockSupabase.eq).toHaveBeenCalledWith("id", userId);
      expect(mockSupabase.eq).toHaveBeenCalledWith("user_id", userId);

      // Verify console output for successful balance match
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `🔍 Calculating balance for ${userName} (${userId})`
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "📊 Current Profile Balance:",
        5000
      );
      expect(consoleLogSpy).toHaveBeenCalledWith("  Calculated Balance: 5000");
      expect(consoleLogSpy).toHaveBeenCalledWith("✅ Balance is consistent!");
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("⚠️  WARNING")
      );
    });

    it("should correctly calculate balance with only deposit transactions", async () => {
      // Arrange
      const userId = "test-user-456";
      const userName = "Deposit User";
      const profile = { balance: 15000 };
      const transactions = [
        createTestTransaction({
          id: "tx-1",
          user_id: userId,
          type: "deposit",
          amount: 10000,
          status: "completed",
        }),
        createTestTransaction({
          id: "tx-2",
          user_id: userId,
          type: "deposit",
          amount: 5000,
          status: "completed",
        }),
      ];

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith("  Deposits: +15000");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Withdrawals: -0");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Calculated Balance: 15000");
      expect(consoleLogSpy).toHaveBeenCalledWith("✅ Balance is consistent!");
    });

    it("should correctly handle internal transfers with positive and negative amounts", async () => {
      // Arrange
      const userId = "test-user-789";
      const userName = "Internal User";
      const profile = { balance: 3500 };
      const transactions = [
        createTestTransaction({
          id: "tx-1",
          user_id: userId,
          type: "deposit",
          amount: 5000,
          status: "completed",
        }),
        createTestTransaction({
          id: "tx-2",
          user_id: userId,
          type: "internal",
          amount: 2000,
          status: "completed",
        }),
        createTestTransaction({
          id: "tx-3",
          user_id: userId,
          type: "internal",
          amount: -3500,
          status: "completed",
        }),
      ];

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith("  Internal: +-1500");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Calculated Balance: 3500");
      expect(consoleLogSpy).toHaveBeenCalledWith("✅ Balance is consistent!");
    });
  });

  describe("Balance Mismatch Detection", () => {
    it("should detect and warn when profile balance does not match calculated balance", async () => {
      // Arrange
      const userId = "mismatch-user-123";
      const userName = "Mismatch User";
      const profile = { balance: 8000 }; // Stored balance
      const transactions = [
        createTestTransaction({
          id: "tx-1",
          user_id: userId,
          type: "deposit",
          amount: 10000,
          status: "completed",
        }),
        createTestTransaction({
          id: "tx-2",
          user_id: userId,
          type: "withdrawal",
          amount: 5000,
          status: "completed",
        }),
      ]; // Calculated balance should be 5000

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith("📈 Summary:");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Profile Balance: 8000");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Calculated Balance: 5000");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Difference: 3000");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "⚠️  WARNING: Balance mismatch detected!"
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "   The profile balance (8000) does not match the calculated balance (5000)"
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        "✅ Balance is consistent!"
      );
    });

    it("should detect free sats promotional balance scenario (profile has balance but no transaction history)", async () => {
      // Arrange - Common scenario where users received promotional sats without transaction records
      const userId = "free-sats-user";
      const userName = "Free Sats User";
      const profile = { balance: 5000 }; // Promotional free sats
      const transactions: any[] = []; // No transaction history

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith("  Profile Balance: 5000");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Calculated Balance: 0");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Difference: 5000");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "⚠️  WARNING: Balance mismatch detected!"
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "   The profile balance (5000) does not match the calculated balance (0)"
      );
    });

    it("should detect negative discrepancy when calculated balance exceeds profile balance", async () => {
      // Arrange - Edge case where calculated balance is higher (possible data corruption)
      const userId = "negative-discrepancy-user";
      const userName = "Negative Discrepancy User";
      const profile = { balance: 3000 };
      const transactions = [
        createTestTransaction({
          id: "tx-1",
          user_id: userId,
          type: "deposit",
          amount: 10000,
          status: "completed",
        }),
      ]; // Calculated balance: 10000

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith("  Difference: -7000");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "⚠️  WARNING: Balance mismatch detected!"
      );
    });
  });

  describe("Transaction Status Filtering", () => {
    it("should only include completed transactions in balance calculation", async () => {
      // Arrange
      const userId = "status-filter-user";
      const userName = "Status Filter User";
      const profile = { balance: 5000 };
      const transactions = [
        createTestTransaction({
          id: "tx-1",
          user_id: userId,
          type: "deposit",
          amount: 5000,
          status: "completed",
        }),
        createTestTransaction({
          id: "tx-2",
          user_id: userId,
          type: "deposit",
          amount: 3000,
          status: "pending",
        }),
        createTestTransaction({
          id: "tx-3",
          user_id: userId,
          type: "withdrawal",
          amount: 1000,
          status: "failed",
        }),
      ];

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert - Should only count the completed deposit of 5000
      expect(consoleLogSpy).toHaveBeenCalledWith("  Calculated Balance: 5000");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Deposits: +5000");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Withdrawals: -0");
      expect(consoleLogSpy).toHaveBeenCalledWith("✅ Balance is consistent!");

      // Verify all transactions are logged (even non-completed ones)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("pending")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("failed")
      );
    });

    it("should display all transactions regardless of status in transaction log", async () => {
      // Arrange
      const userId = "display-all-user";
      const userName = "Display All User";
      const profile = { balance: 2000 };
      const transactions = [
        createTestTransaction({
          id: "tx-comp-1",
          user_id: userId,
          type: "deposit",
          amount: 2000,
          status: "completed",
          created_at: "2024-01-01T00:00:00Z",
        }),
        createTestTransaction({
          id: "tx-pend-1",
          user_id: userId,
          type: "deposit",
          amount: 5000,
          status: "pending",
          created_at: "2024-01-02T00:00:00Z",
        }),
        createTestTransaction({
          id: "tx-fail-1",
          user_id: userId,
          type: "withdrawal",
          amount: 1000,
          status: "failed",
          created_at: "2024-01-03T00:00:00Z",
        }),
      ];

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert - Verify all transactions are logged (IDs are truncated to first 8 chars)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("tx-comp-")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("tx-pend-")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("tx-fail-")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("completed")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("pending")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("failed")
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle profile fetch error gracefully", async () => {
      // Arrange
      const userId = "error-user-123";
      const userName = "Error User";
      const profileError = { message: "Profile not found", code: "404" };

      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: profileError,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `🔍 Calculating balance for ${userName} (${userId})`
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching profile:",
        profileError
      );

      // Should not proceed to transaction fetching
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("📋 All Transactions")
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("📈 Summary")
      );
    });

    it("should handle transaction fetch error gracefully", async () => {
      // Arrange
      const userId = "tx-error-user";
      const userName = "Transaction Error User";
      const profile = { balance: 5000 };
      const txError = {
        message: "Database connection timeout",
        code: "TIMEOUT",
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: null,
        error: txError,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "📊 Current Profile Balance:",
        5000
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching transactions:",
        txError
      );

      // Should not proceed to calculation
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("🧮 Balance Calculation")
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("📈 Summary")
      );
    });

    it("should handle unexpected errors with catch block", async () => {
      // Arrange
      const userId = "exception-user";
      const userName = "Exception User";
      const unexpectedError = new Error("Unexpected database exception");

      mockSupabase.single.mockRejectedValueOnce(unexpectedError);

      // Act
      await calculateUserBalance(userId, userName);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `🔍 Calculating balance for ${userName} (${userId})`
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error:", unexpectedError);
    });
  });

  describe("Edge Cases", () => {
    it("should handle user with empty transaction history", async () => {
      // Arrange
      const userId = "empty-history-user";
      const userName = "Empty History User";
      const profile = { balance: 0 };
      const transactions: any[] = [];

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith("  Calculated Balance: 0");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Deposits: +0");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Withdrawals: -0");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Internal: +0");
      expect(consoleLogSpy).toHaveBeenCalledWith("✅ Balance is consistent!");
    });

    it("should handle negative balance scenario (withdrawals exceed deposits)", async () => {
      // Arrange
      const userId = "negative-balance-user";
      const userName = "Negative Balance User";
      const profile = { balance: -2000 };
      const transactions = [
        createTestTransaction({
          id: "tx-1",
          user_id: userId,
          type: "deposit",
          amount: 3000,
          status: "completed",
        }),
        createTestTransaction({
          id: "tx-2",
          user_id: userId,
          type: "withdrawal",
          amount: 5000,
          status: "completed",
        }),
      ];

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith("  Calculated Balance: -2000");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Profile Balance: -2000");
      expect(consoleLogSpy).toHaveBeenCalledWith("✅ Balance is consistent!");
    });

    it("should handle large balance amounts (Bitcoin maximums)", async () => {
      // Arrange - Test with 0.21 BTC = 21,000,000 satoshis
      const userId = "large-balance-user";
      const userName = "Large Balance User";
      const profile = { balance: 21000000 };
      const transactions = [
        createTestTransaction({
          id: "tx-1",
          user_id: userId,
          type: "deposit",
          amount: 21000000,
          status: "completed",
        }),
      ];

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "  Calculated Balance: 21000000"
      );
      expect(consoleLogSpy).toHaveBeenCalledWith("  Profile Balance: 21000000");
      expect(consoleLogSpy).toHaveBeenCalledWith("✅ Balance is consistent!");
    });

    it("should handle transactions with memo field", async () => {
      // Arrange
      const userId = "memo-user";
      const userName = "Memo User";
      const profile = { balance: 5000 };
      const transactions = [
        createTestTransaction({
          id: "tx-1",
          user_id: userId,
          type: "deposit",
          amount: 5000,
          status: "completed",
          memo: "Test deposit memo",
        }),
      ];

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert - Verify memo is displayed in transaction log
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test deposit memo")
      );
    });

    it("should display N/A for transactions without memo field", async () => {
      // Arrange
      const userId = "no-memo-user";
      const userName = "No Memo User";
      const profile = { balance: 1000 };
      const transactions = [
        createTestTransaction({
          id: "tx-1",
          user_id: userId,
          type: "deposit",
          amount: 1000,
          status: "completed",
          // No memo field
        }),
      ];

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert - Verify N/A is displayed when memo is missing
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("N/A")
      );
    });
  });

  describe("Breakdown Validation", () => {
    it("should provide accurate breakdown with mixed transaction types", async () => {
      // Arrange
      const userId = "breakdown-user";
      const userName = "Breakdown User";
      const profile = { balance: 8500 };
      const transactions = [
        createTestTransaction({
          id: "tx-1",
          user_id: userId,
          type: "deposit",
          amount: 10000,
          status: "completed",
        }),
        createTestTransaction({
          id: "tx-2",
          user_id: userId,
          type: "deposit",
          amount: 5000,
          status: "completed",
        }),
        createTestTransaction({
          id: "tx-3",
          user_id: userId,
          type: "withdrawal",
          amount: 3000,
          status: "completed",
        }),
        createTestTransaction({
          id: "tx-4",
          user_id: userId,
          type: "internal",
          amount: 2000,
          status: "completed",
        }),
        createTestTransaction({
          id: "tx-5",
          user_id: userId,
          type: "internal",
          amount: -5500,
          status: "completed",
        }),
      ];

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert - Verify breakdown accuracy
      expect(consoleLogSpy).toHaveBeenCalledWith("  Deposits: +15000");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Withdrawals: -3000");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Internal: +-3500");
      expect(consoleLogSpy).toHaveBeenCalledWith("  Calculated Balance: 8500");
      expect(consoleLogSpy).toHaveBeenCalledWith("✅ Balance is consistent!");
    });
  });

  describe("Database Query Validation", () => {
    it("should query transactions ordered by created_at descending", async () => {
      // Arrange
      const userId = "order-test-user";
      const userName = "Order Test User";
      const profile = { balance: 1000 };
      const transactions = [
        createTestTransaction({
          id: "tx-1",
          user_id: userId,
          type: "deposit",
          amount: 1000,
          status: "completed",
          created_at: "2024-01-01T00:00:00Z",
        }),
      ];

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert - Verify order parameter
      expect(mockSupabase.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
    });

    it("should fetch all transaction fields with select(*)", async () => {
      // Arrange
      const userId = "select-all-user";
      const userName = "Select All User";
      const profile = { balance: 500 };
      const transactions = [
        createTestTransaction({
          id: "tx-1",
          user_id: userId,
          type: "deposit",
          amount: 500,
          status: "completed",
        }),
      ];

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: transactions,
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert - Verify select all fields for transactions
      expect(mockSupabase.from).toHaveBeenCalledWith("transactions");
      expect(mockSupabase.select).toHaveBeenCalledWith("*");
    });

    it("should fetch only balance field from profiles table", async () => {
      // Arrange
      const userId = "profile-select-user";
      const userName = "Profile Select User";
      const profile = { balance: 2000 };

      mockSupabase.single.mockResolvedValueOnce({
        data: profile,
        error: null,
      });

      mockSupabase.order.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      // Act
      await calculateUserBalance(userId, userName);

      // Assert - Verify only balance field is selected from profiles
      expect(mockSupabase.from).toHaveBeenCalledWith("profiles");
      expect(mockSupabase.select).toHaveBeenCalledWith("balance");
    });
  });
});
