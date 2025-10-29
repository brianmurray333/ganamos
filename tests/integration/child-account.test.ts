import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/child-account/route";

/**
 * Integration Tests for POST /api/child-account Endpoint
 *
 * Tests the complete child account creation workflow:
 * 1. Authentication and authorization
 * 2. Credential generation (UUID-based email, random password)
 * 3. Auth user creation with service role
 * 4. Profile creation/upsert with metadata
 * 5. Account linking via connected_accounts table
 *
 * These tests use mocks to validate the workflow without requiring a real database.
 */

// Mock Supabase clients
vi.mock("@supabase/auth-helpers-nextjs", () => ({
  createRouteHandlerClient: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("uuid", () => ({
  v4: vi.fn(),
}));

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createServerSupabaseClient } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

describe("POST /api/child-account Integration Tests", () => {
  let mockSupabaseClient: any;
  let mockAdminClient: any;
  const testParentUserId = "parent-user-123";
  const testChildUserId = "child-user-456";
  const testChildEmail = "child-test-uuid@ganamos.app";

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock regular Supabase client (with RLS)
    mockSupabaseClient = {
      auth: {
        getSession: vi.fn(),
      },
      from: vi.fn(),
    };

    // Mock admin Supabase client (service role)
    mockAdminClient = {
      auth: {
        admin: {
          createUser: vi.fn(),
          listUsers: vi.fn(),
          updateUserById: vi.fn(),
        },
      },
    };

    vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient);
    vi.mocked(createServerSupabaseClient).mockReturnValue(mockAdminClient);
    (vi.mocked(uuidv4) as any).mockReturnValueOnce("test-uuid").mockReturnValueOnce("test-password");
  });

  describe("Happy Path: Successful Child Account Creation", () => {
    it("should create a complete child account with all 5 workflow steps", async () => {
      // Arrange
      const username = "Test Child Alice";
      const avatarUrl = "https://example.com/alice.png";

      // Mock session
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: testParentUserId },
          },
        },
      });

      // Mock admin client - no existing users
      mockAdminClient.auth.admin.listUsers.mockResolvedValue({
        data: { users: [] },
      });

      // Mock admin client - create user
      mockAdminClient.auth.admin.createUser.mockResolvedValue({
        data: {
          user: {
            id: testChildUserId,
            email: testChildEmail,
          },
        },
        error: null,
      });

      // Mock profile upsert
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: testChildUserId,
                    name: username,
                    username: "test-child-alice",
                    email: testChildEmail,
                    avatar_url: avatarUrl,
                    balance: 0,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "connected_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      // Act
      const request = new Request("http://localhost:3000/api/child-account", {
        method: "POST",
        body: JSON.stringify({ username, avatarUrl }),
      });

      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Child account created successfully");
      expect(data.profile).toBeDefined();
      expect(data.profile.id).toBe(testChildUserId);
      expect(data.profile.email).toBe(testChildEmail);
      expect(data.profile.balance).toBe(0);

      // Verify auth user was created with correct metadata
      expect(mockAdminClient.auth.admin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: testChildEmail,
          email_confirm: true,
          user_metadata: expect.objectContaining({
            name: username,
            avatar_url: avatarUrl,
            is_child_account: true,
            primary_user_id: testParentUserId,
          }),
        })
      );
    });

    it("should generate a valid UUID-based email following the pattern child-{uuid}@ganamos.app", async () => {
      // Arrange
      const username = "Test Child";
      const avatarUrl = "https://example.com/avatar.png";

      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: testParentUserId } } },
      });

      mockAdminClient.auth.admin.listUsers.mockResolvedValue({
        data: { users: [] },
      });

      mockAdminClient.auth.admin.createUser.mockResolvedValue({
        data: {
          user: {
            id: testChildUserId,
            email: testChildEmail,
          },
        },
        error: null,
      });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { email: testChildEmail },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "connected_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      // Act
      const request = new Request("http://localhost:3000/api/child-account", {
        method: "POST",
        body: JSON.stringify({ username, avatarUrl }),
      });

      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.profile.email).toMatch(/^child-[a-z0-9-]+@ganamos\.app$/);
      expect(mockAdminClient.auth.admin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: expect.stringMatching(/^child-.*@ganamos\.app$/),
        })
      );
    });

    it("should generate a valid username slug (lowercase, hyphens, max 20 chars)", async () => {
      // Arrange
      const testCases = [
        { displayName: "Alice Smith", expectedUsername: "alice-smith" },
        { displayName: "Bob-O'Connor Jr.", expectedUsername: "bob-oconnor-jr" },
        {
          displayName: "Charlie With A Very Long Name That Exceeds Twenty Characters",
          expectedUsername: "charlie-with-a-very-", // Exactly 20 chars
        },
      ];

      for (const testCase of testCases) {
        mockSupabaseClient.auth.getSession.mockResolvedValue({
          data: { session: { user: { id: testParentUserId } } },
        });

        mockAdminClient.auth.admin.listUsers.mockResolvedValue({
          data: { users: [] },
        });

        mockAdminClient.auth.admin.createUser.mockResolvedValue({
          data: { user: { id: testChildUserId, email: testChildEmail } },
          error: null,
        });

        let capturedUsername = "";
        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === "profiles") {
            return {
              upsert: vi.fn().mockImplementation((data: any) => {
                capturedUsername = data.username;
                return Promise.resolve({ error: null });
              }),
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { username: capturedUsername },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "connected_accounts") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: null }),
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return {};
        });

        // Act
        const request = new Request("http://localhost:3000/api/child-account", {
          method: "POST",
          body: JSON.stringify({ username: testCase.displayName, avatarUrl: "https://example.com/avatar.png" }),
        });

        await POST(request);

        // Assert
        expect(capturedUsername).toBe(testCase.expectedUsername);
        expect(capturedUsername).toMatch(/^[a-z0-9-]+$/);
        expect(capturedUsername.length).toBeLessThanOrEqual(20);
      }
    });

    it("should initialize child account balance to 0", async () => {
      // Arrange
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: testParentUserId } } },
      });

      mockAdminClient.auth.admin.listUsers.mockResolvedValue({
        data: { users: [] },
      });

      mockAdminClient.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: testChildUserId, email: testChildEmail } },
        error: null,
      });

      let capturedBalance = -1;
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            upsert: vi.fn().mockImplementation((data: any) => {
              capturedBalance = data.balance;
              return Promise.resolve({ error: null });
            }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { balance: capturedBalance },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "connected_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      // Act
      const request = new Request("http://localhost:3000/api/child-account", {
        method: "POST",
        body: JSON.stringify({ username: "Test Child", avatarUrl: "https://example.com/avatar.png" }),
      });

      await POST(request);

      // Assert
      expect(capturedBalance).toBe(0);
    });

    it("should create connected_accounts relationship linking parent and child", async () => {
      // Arrange
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: testParentUserId } } },
      });

      mockAdminClient.auth.admin.listUsers.mockResolvedValue({
        data: { users: [] },
      });

      mockAdminClient.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: testChildUserId, email: testChildEmail } },
        error: null,
      });

      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: testChildUserId },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "connected_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
            insert: mockInsert,
          };
        }
        return {};
      });

      // Act
      const request = new Request("http://localhost:3000/api/child-account", {
        method: "POST",
        body: JSON.stringify({ username: "Test Child", avatarUrl: "https://example.com/avatar.png" }),
      });

      await POST(request);

      // Assert
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          primary_user_id: testParentUserId,
          connected_user_id: testChildUserId,
        })
      );
    });
  });

  describe("Idempotency: Duplicate Prevention", () => {
    it("should handle existing user gracefully (uses upsert for profile)", async () => {
      // Arrange
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: testParentUserId } } },
      });

      // Mock existing user
      mockAdminClient.auth.admin.listUsers.mockResolvedValue({
        data: {
          users: [{ id: testChildUserId, email: testChildEmail }],
        },
      });

      mockAdminClient.auth.admin.updateUserById.mockResolvedValue({
        data: { user: { id: testChildUserId } },
        error: null,
      });

      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            upsert: mockUpsert,
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: testChildUserId },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "connected_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      // Act
      const request = new Request("http://localhost:3000/api/child-account", {
        method: "POST",
        body: JSON.stringify({ username: "Test Child", avatarUrl: "https://example.com/avatar.png" }),
      });

      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalled();
      expect(mockAdminClient.auth.admin.updateUserById).toHaveBeenCalledWith(
        testChildUserId,
        expect.objectContaining({
          user_metadata: expect.objectContaining({
            is_child_account: true,
          }),
        })
      );
    });

    it("should not create duplicate connected_accounts relationships", async () => {
      // Arrange
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: testParentUserId } } },
      });

      mockAdminClient.auth.admin.listUsers.mockResolvedValue({
        data: { users: [] },
      });

      mockAdminClient.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: testChildUserId, email: testChildEmail } },
        error: null,
      });

      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: testChildUserId },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "connected_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                // Existing connection found
                data: {
                  primary_user_id: testParentUserId,
                  connected_user_id: testChildUserId,
                },
              }),
            }),
            insert: mockInsert,
          };
        }
        return {};
      });

      // Act
      const request = new Request("http://localhost:3000/api/child-account", {
        method: "POST",
        body: JSON.stringify({ username: "Test Child", avatarUrl: "https://example.com/avatar.png" }),
      });

      await POST(request);

      // Assert - insert should NOT be called since connection exists
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe("Error Cases: Validation and Authentication", () => {
    it("should require authentication (session check)", async () => {
      // Arrange
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
      });

      // Act
      const request = new Request("http://localhost:3000/api/child-account", {
        method: "POST",
        body: JSON.stringify({ username: "Test Child", avatarUrl: "https://example.com/avatar.png" }),
      });

      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data.error).toBe("Authentication required");
    });

    it("should require username parameter", async () => {
      // Act
      const request = new Request("http://localhost:3000/api/child-account", {
        method: "POST",
        body: JSON.stringify({ avatarUrl: "https://example.com/avatar.png" }),
      });

      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data.error).toBe("Username and avatar are required");
    });

    it("should require avatarUrl parameter", async () => {
      // Act
      const request = new Request("http://localhost:3000/api/child-account", {
        method: "POST",
        body: JSON.stringify({ username: "Test Child" }),
      });

      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data.error).toBe("Username and avatar are required");
    });

    it("should handle auth user creation failures gracefully", async () => {
      // Arrange
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: testParentUserId } } },
      });

      mockAdminClient.auth.admin.listUsers.mockResolvedValue({
        data: { users: [] },
      });

      mockAdminClient.auth.admin.createUser.mockResolvedValue({
        data: { user: null },
        error: {
          message: "Unable to validate email address: invalid format",
        },
      });

      // Act
      const request = new Request("http://localhost:3000/api/child-account", {
        method: "POST",
        body: JSON.stringify({ username: "Test Child", avatarUrl: "https://example.com/avatar.png" }),
      });

      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data.error).toContain("Error creating child account");
    });
  });

  describe("Metadata Validation", () => {
    it("should set is_child_account metadata flag to true", async () => {
      // Arrange
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: testParentUserId } } },
      });

      mockAdminClient.auth.admin.listUsers.mockResolvedValue({
        data: { users: [] },
      });

      mockAdminClient.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: testChildUserId, email: testChildEmail } },
        error: null,
      });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: testChildUserId },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "connected_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      // Act
      const request = new Request("http://localhost:3000/api/child-account", {
        method: "POST",
        body: JSON.stringify({ username: "Test Child", avatarUrl: "https://example.com/avatar.png" }),
      });

      await POST(request);

      // Assert
      expect(mockAdminClient.auth.admin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          user_metadata: expect.objectContaining({
            is_child_account: true,
          }),
        })
      );
    });

    it("should set primary_user_id metadata to parent user ID", async () => {
      // Arrange
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: testParentUserId } } },
      });

      mockAdminClient.auth.admin.listUsers.mockResolvedValue({
        data: { users: [] },
      });

      mockAdminClient.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: testChildUserId, email: testChildEmail } },
        error: null,
      });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: testChildUserId },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "connected_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      // Act
      const request = new Request("http://localhost:3000/api/child-account", {
        method: "POST",
        body: JSON.stringify({ username: "Test Child", avatarUrl: "https://example.com/avatar.png" }),
      });

      await POST(request);

      // Assert
      expect(mockAdminClient.auth.admin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          user_metadata: expect.objectContaining({
            primary_user_id: testParentUserId,
          }),
        })
      );
    });
  });
});
