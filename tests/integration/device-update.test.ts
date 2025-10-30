/**
 * Integration Tests: POST /api/device/update
 *
 * Tests the device update endpoint for:
 * - Authentication and authorization
 * - Input validation (required fields, pet type enum)
 * - Ownership enforcement via RLS policies
 * - Input sanitization (trimming)
 * - Timestamp updates
 * - Error handling (401, 400, 404, 500)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createMockDevice,
  createMockUser,
  VALID_PET_TYPES,
} from "../fixtures/devices";

// Mock Next.js headers/cookies
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

// Mock Supabase auth helpers
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
};

vi.mock("@supabase/auth-helpers-nextjs", () => ({
  createRouteHandlerClient: vi.fn(() => mockSupabaseClient),
}));

// Import the route handler after mocks are set up
import { POST } from "@/app/api/device/update/route";

describe("POST /api/device/update", () => {
  let mockRequest: NextRequest;
  const mockUser = createMockUser();
  const mockDevice = createMockDevice({ user_id: mockUser.id });

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset Supabase client mock chain
    mockSupabaseClient.from = vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(),
    }));
  });

  /**
   * Helper to create mock request with JSON body
   */
  function createMockRequest(body: any): NextRequest {
    return {
      json: vi.fn().mockResolvedValue(body),
    } as unknown as NextRequest;
  }

  /**
   * Helper to mock successful authentication
   */
  function mockAuthenticatedUser() {
    mockSupabaseClient.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });
  }

  /**
   * Helper to mock authentication failure
   */
  function mockUnauthenticatedUser() {
    mockSupabaseClient.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "Unauthorized" },
    });
  }

  /**
   * Helper to mock successful database update
   */
  function mockSuccessfulUpdate(device = mockDevice) {
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: device,
        error: null,
      }),
    };
    mockSupabaseClient.from = vi.fn(() => updateChain);
    return updateChain;
  }

  /**
   * Helper to mock database error
   */
  function mockDatabaseError(errorMessage = "Database error") {
    const errorChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: errorMessage },
      }),
    };
    mockSupabaseClient.from = vi.fn(() => errorChain);
    return errorChain;
  }

  /**
   * Helper to mock device not found (ownership check failure)
   */
  function mockDeviceNotFound() {
    const notFoundChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };
    mockSupabaseClient.from = vi.fn(() => notFoundChain);
    return notFoundChain;
  }

  describe("Authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      mockUnauthenticatedUser();
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
        petType: "cat",
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Unauthorized");
    });

    it("should proceed with update when user is authenticated", async () => {
      mockAuthenticatedUser();
      mockSuccessfulUpdate();
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Updated Pet",
        petType: "dog",
      });

      const response = await POST(mockRequest);

      expect(response.status).toBe(200);
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledTimes(1);
    });
  });

  describe("Input Validation - Required Fields", () => {
    beforeEach(() => {
      mockAuthenticatedUser();
    });

    it("should return 400 when deviceId is missing", async () => {
      mockRequest = createMockRequest({
        petName: "Test Pet",
        petType: "cat",
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Missing required fields");
    });

    it("should return 400 when petName is missing", async () => {
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petType: "cat",
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Missing required fields");
    });

    it("should return 400 when petType is missing", async () => {
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Missing required fields");
    });

    it("should return 400 when all required fields are missing", async () => {
      mockRequest = createMockRequest({});

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Missing required fields");
    });
  });

  describe("Input Validation - Pet Type Enum", () => {
    beforeEach(() => {
      mockAuthenticatedUser();
    });

    it.each(VALID_PET_TYPES)(
      "should accept valid pet type: %s",
      async (petType) => {
        mockSuccessfulUpdate(createMockDevice({ pet_type: petType }));
        mockRequest = createMockRequest({
          deviceId: mockDevice.id,
          petName: "Test Pet",
          petType,
        });

        const response = await POST(mockRequest);

        expect(response.status).toBe(200);
      }
    );

    it("should return 400 for invalid pet type", async () => {
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
        petType: "dragon", // Invalid type
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Invalid pet type");
    });

    it("should return 400 for empty string pet type (treated as missing)", async () => {
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
        petType: "",
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      // Empty string is treated as missing field (falsy check in API)
      expect(data.error).toBe("Missing required fields");
    });
  });

  describe("Input Sanitization", () => {
    beforeEach(() => {
      mockAuthenticatedUser();
    });

    it("should trim whitespace from petName before update", async () => {
      const updateChain = mockSuccessfulUpdate();
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "  Fluffy  ", // Leading and trailing spaces
        petType: "cat",
      });

      await POST(mockRequest);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pet_name: "Fluffy", // Should be trimmed
        })
      );
    });

    it("should trim whitespace from petName with newlines", async () => {
      const updateChain = mockSuccessfulUpdate();
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "\n\tMittens\n\t",
        petType: "cat",
      });

      await POST(mockRequest);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pet_name: "Mittens",
        })
      );
    });
  });

  describe("Ownership Validation", () => {
    beforeEach(() => {
      mockAuthenticatedUser();
    });

    it("should return 404 when device does not exist", async () => {
      mockDeviceNotFound();
      mockRequest = createMockRequest({
        deviceId: "non-existent-device",
        petName: "Test Pet",
        petType: "cat",
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Device not found or you don't have permission");
    });

    it("should return 404 when user does not own the device", async () => {
      // Mock returns no device (ownership check failure)
      mockDeviceNotFound();
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
        petType: "cat",
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Device not found or you don't have permission");
    });

    it('should enforce ownership via .eq("user_id", user.id) filter', async () => {
      const updateChain = mockSuccessfulUpdate();
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
        petType: "cat",
      });

      await POST(mockRequest);

      // Verify ownership filter is applied in query chain
      expect(updateChain.eq).toHaveBeenCalledWith("id", mockDevice.id);
      expect(updateChain.eq).toHaveBeenCalledWith("user_id", mockUser.id);
    });
  });

  describe("Successful Update", () => {
    beforeEach(() => {
      mockAuthenticatedUser();
    });

    it("should successfully update device with valid data", async () => {
      const updatedDevice = createMockDevice({
        pet_name: "New Name",
        pet_type: "dog",
        updated_at: new Date().toISOString(),
      });
      mockSuccessfulUpdate(updatedDevice);

      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "New Name",
        petType: "dog",
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.device).toMatchObject({
        pet_name: "New Name",
        pet_type: "dog",
      });
      expect(data.message).toBe("Pet settings updated successfully");
    });

    it("should update pet_name field in database", async () => {
      const updateChain = mockSuccessfulUpdate();
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Updated Name",
        petType: "cat",
      });

      await POST(mockRequest);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pet_name: "Updated Name",
        })
      );
    });

    it("should update pet_type field in database", async () => {
      const updateChain = mockSuccessfulUpdate();
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
        petType: "rabbit",
      });

      await POST(mockRequest);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pet_type: "rabbit",
        })
      );
    });

    it("should set updated_at timestamp on update", async () => {
      const updateChain = mockSuccessfulUpdate();
      const beforeUpdate = new Date().toISOString();

      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
        petType: "cat",
      });

      await POST(mockRequest);

      const updateCall = updateChain.update.mock.calls[0][0];
      expect(updateCall).toHaveProperty("updated_at");
      expect(typeof updateCall.updated_at).toBe("string");
      expect(new Date(updateCall.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeUpdate).getTime()
      );
    });

    it("should query devices table", async () => {
      mockSuccessfulUpdate();
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
        petType: "cat",
      });

      await POST(mockRequest);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith("devices");
    });

    it("should call select() and single() to retrieve updated device", async () => {
      const updateChain = mockSuccessfulUpdate();
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
        petType: "cat",
      });

      await POST(mockRequest);

      expect(updateChain.select).toHaveBeenCalled();
      expect(updateChain.single).toHaveBeenCalled();
    });
  });

  describe("Database Error Handling", () => {
    beforeEach(() => {
      mockAuthenticatedUser();
    });

    it("should return 500 when database update fails", async () => {
      mockDatabaseError("Connection timeout");
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
        petType: "cat",
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Failed to update device");
    });

    it("should handle unexpected errors gracefully", async () => {
      mockAuthenticatedUser();
      // Force an error by making json() throw
      mockRequest = {
        json: vi.fn().mockRejectedValue(new Error("Invalid JSON")),
      } as unknown as NextRequest;

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Internal server error");
    });
  });

  describe("Integration with User/Device Records", () => {
    beforeEach(() => {
      mockAuthenticatedUser();
    });

    it("should maintain referential integrity with user_id", async () => {
      const updateChain = mockSuccessfulUpdate();
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
        petType: "cat",
      });

      await POST(mockRequest);

      // Verify user_id from auth is used in ownership check
      expect(updateChain.eq).toHaveBeenCalledWith("user_id", mockUser.id);
    });

    it("should not modify user_id during update", async () => {
      const updateChain = mockSuccessfulUpdate();
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
        petType: "cat",
      });

      await POST(mockRequest);

      const updateData = updateChain.update.mock.calls[0][0];
      expect(updateData).not.toHaveProperty("user_id");
      expect(updateData).not.toHaveProperty("id");
    });

    it("should only update pet_name, pet_type, and updated_at fields", async () => {
      const updateChain = mockSuccessfulUpdate();
      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "Test Pet",
        petType: "cat",
      });

      await POST(mockRequest);

      const updateData = updateChain.update.mock.calls[0][0];
      const keys = Object.keys(updateData);
      expect(keys).toHaveLength(3);
      expect(keys).toContain("pet_name");
      expect(keys).toContain("pet_type");
      expect(keys).toContain("updated_at");
    });
  });

  describe("Complete Request Flow", () => {
    it("should execute complete update flow successfully", async () => {
      mockAuthenticatedUser();
      const updateChain = mockSuccessfulUpdate();

      mockRequest = createMockRequest({
        deviceId: mockDevice.id,
        petName: "  Mr. Whiskers  ",
        petType: "cat",
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      // Verify authentication
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled();

      // Verify database interaction
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("devices");
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pet_name: "Mr. Whiskers", // Trimmed
          pet_type: "cat",
        })
      );

      // Verify ownership enforcement
      expect(updateChain.eq).toHaveBeenCalledWith("id", mockDevice.id);
      expect(updateChain.eq).toHaveBeenCalledWith("user_id", mockUser.id);

      // Verify response
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.device).toBeDefined();
      expect(data.message).toBe("Pet settings updated successfully");
    });
  });
});
