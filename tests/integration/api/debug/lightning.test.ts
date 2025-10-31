import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/debug/lightning/route";
import {
  setupLightningEnv,
  mockSuccessfulFetch,
  mockFailedFetch,
  mockHttpErrorFetch,
  mockNodeData,
  testLightningConfig,
} from "../../helpers/lightning-debug-mocks";

describe("GET /api/debug/lightning", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let fetchMock: any;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };

    // Set default test environment variables
    setupLightningEnv();

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Restore all mocks
    vi.restoreAllMocks();
  });

  describe("Production Environment Protection", () => {
    it("should return 403 when NODE_ENV is production", async () => {
      process.env.NODE_ENV = "production";

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data).toEqual({
        error: "Not available in production",
      });
    });

    it("should not attempt connection test in production", async () => {
      process.env.NODE_ENV = "production";
      fetchMock = vi.spyOn(global, "fetch");

      await GET();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should not expose configuration in production", async () => {
      process.env.NODE_ENV = "production";

      const response = await GET();
      const data = await response.json();

      expect(data).not.toHaveProperty("config");
      expect(data).not.toHaveProperty("connectionTest");
      expect(data).not.toHaveProperty("timestamp");
    });
  });

  describe("Configuration Validation", () => {
    it("should report when both config values are set", async () => {
      fetchMock = mockSuccessfulFetch({
        identity_pubkey: "test-pubkey",
        alias: "test-node",
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.config.url.set).toBe(true);
      expect(data.config.macaroon.set).toBe(true);
    });

    it("should report when LND_REST_URL is missing", async () => {
      delete process.env.LND_REST_URL;

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.config.url.set).toBe(false);
      expect(data.config.url.value).toBeNull();
      expect(data.connectionTest.success).toBe(false);
      expect(data.connectionTest.error).toBe("Not attempted");
    });

    it("should report when LND_ADMIN_MACAROON is missing", async () => {
      delete process.env.LND_ADMIN_MACAROON;

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.config.macaroon.set).toBe(false);
      expect(data.config.macaroon.value).toBeNull();
      expect(data.connectionTest.success).toBe(false);
      expect(data.connectionTest.error).toBe("Not attempted");
    });

    it("should not attempt connection when config is incomplete", async () => {
      delete process.env.LND_ADMIN_MACAROON;
      fetchMock = vi.spyOn(global, "fetch");

      await GET();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("Credential Sanitization", () => {
    it("should truncate LND_REST_URL to first 10 characters", async () => {
      process.env.LND_REST_URL =
        "https://very-long-url-that-should-be-truncated.example.com:8080";
      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({}),
        headers: new Headers(),
      } as Response);

      const response = await GET();
      const data = await response.json();

      expect(data.config.url.value).toBe("https://ve...");
      expect(data.config.url.value?.length).toBe(13); // "https://ve" (10 chars) + "..." (3 chars)
    });

    it("should truncate LND_ADMIN_MACAROON to first 10 characters", async () => {
      process.env.LND_ADMIN_MACAROON =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({}),
        headers: new Headers(),
      } as Response);

      const response = await GET();
      const data = await response.json();

      expect(data.config.macaroon.value).toBe("0123456789...");
      expect(data.config.macaroon.value?.length).toBe(13); // 10 chars + "..."
    });

    it("should never expose full credentials in response", async () => {
      const fullUrl = "https://super-secret-node.example.com:8080";
      const fullMacaroon =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      process.env.LND_REST_URL = fullUrl;
      process.env.LND_ADMIN_MACAROON = fullMacaroon;

      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({}),
        headers: new Headers(),
      } as Response);

      const response = await GET();
      const responseText = await response.text();
      const data = JSON.parse(responseText);

      // Verify full credentials are NOT in response
      expect(responseText).not.toContain(fullUrl);
      expect(responseText).not.toContain(fullMacaroon);

      // Verify only truncated versions are present
      expect(data.config.url.value).toBe(fullUrl.substring(0, 10) + "...");
      expect(data.config.macaroon.value).toBe(
        fullMacaroon.substring(0, 10) + "..."
      );
    });
  });

  describe("Lightning Node Connection - Success Cases", () => {
    it("should successfully connect to Lightning node", async () => {
      const mockNodeData = {
        identity_pubkey: "03test1234567890abcdef",
        alias: "Test Lightning Node",
        version: "0.15.0-beta",
        synced_to_chain: true,
        block_height: 800000,
      };

      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockNodeData,
        headers: new Headers(),
      } as Response);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.connectionTest.success).toBe(true);
      expect(data.connectionTest.data).toEqual(mockNodeData);
      expect(data.connectionTest).not.toHaveProperty("error");
    });

    it("should call Lightning node with correct URL", async () => {
      const testUrl = "https://test-node.example.com:8080";
      process.env.LND_REST_URL = testUrl;

      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({}),
        headers: new Headers(),
      } as Response);

      await GET();

      expect(fetchMock).toHaveBeenCalledWith(
        `${testUrl}/v1/getinfo`,
        expect.objectContaining({
          method: "GET",
          cache: "no-store",
        })
      );
    });

    it("should include Grpc-Metadata-macaroon header in request", async () => {
      const testMacaroon = "0123456789abcdef";
      process.env.LND_ADMIN_MACAROON = testMacaroon;

      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({}),
        headers: new Headers(),
      } as Response);

      await GET();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            "Grpc-Metadata-macaroon": testMacaroon,
          },
        })
      );
    });

    it("should include timestamp in response", async () => {
      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({}),
        headers: new Headers(),
      } as Response);

      const beforeTime = new Date().toISOString();
      const response = await GET();
      const afterTime = new Date().toISOString();
      const data = await response.json();

      expect(data).toHaveProperty("timestamp");
      expect(data.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
      // Timestamp should be between before and after test execution
      expect(data.timestamp >= beforeTime).toBe(true);
      expect(data.timestamp <= afterTime).toBe(true);
    });
  });

  describe("Lightning Node Connection - Error Cases", () => {
    it("should handle network errors gracefully", async () => {
      const networkError = new Error("Network request failed");
      fetchMock = vi.spyOn(global, "fetch").mockRejectedValue(networkError);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.connectionTest.success).toBe(false);
      expect(data.connectionTest.error).toBe("Network request failed");
    });

    it("should handle non-Error exceptions", async () => {
      fetchMock = vi.spyOn(global, "fetch").mockRejectedValue("String error");

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.connectionTest.success).toBe(false);
      expect(data.connectionTest.error).toBe("String error");
    });

    it("should handle HTTP 500 error from Lightning node", async () => {
      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
        headers: new Headers(),
      } as Response);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.connectionTest.success).toBe(false);
      expect(data.connectionTest.error).toBe("Status: 500");
      expect(data.connectionTest).toHaveProperty("response");
    });

    it("should handle HTTP 401 unauthorized error", async () => {
      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
        headers: new Headers(),
      } as Response);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.connectionTest.success).toBe(false);
      expect(data.connectionTest.error).toBe("Status: 401");
    });

    it("should handle HTTP 404 not found error", async () => {
      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not Found",
        headers: new Headers(),
      } as Response);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.connectionTest.success).toBe(false);
      expect(data.connectionTest.error).toBe("Status: 404");
    });

    it("should truncate error response text to 200 characters", async () => {
      const longErrorMessage = "A".repeat(500);
      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => longErrorMessage,
        headers: new Headers(),
      } as Response);

      const response = await GET();
      const data = await response.json();

      expect(data.connectionTest.response?.length).toBe(200);
      expect(data.connectionTest.response).toBe("A".repeat(200));
    });

    it("should handle timeout errors", async () => {
      const timeoutError = new Error("Request timeout");
      fetchMock = vi.spyOn(global, "fetch").mockRejectedValue(timeoutError);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.connectionTest.success).toBe(false);
      expect(data.connectionTest.error).toBe("Request timeout");
    });

    it("should handle connection refused errors", async () => {
      const connectionError = new Error("ECONNREFUSED");
      fetchMock = vi.spyOn(global, "fetch").mockRejectedValue(connectionError);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.connectionTest.success).toBe(false);
      expect(data.connectionTest.error).toBe("ECONNREFUSED");
    });
  });

  describe("Response Structure", () => {
    it("should return correct response structure for success case", async () => {
      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ identity_pubkey: "test-pubkey" }),
        headers: new Headers(),
      } as Response);

      const response = await GET();
      const data = await response.json();

      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("config");
      expect(data).toHaveProperty("connectionTest");

      expect(data.config).toHaveProperty("url");
      expect(data.config).toHaveProperty("macaroon");

      expect(data.config.url).toHaveProperty("set");
      expect(data.config.url).toHaveProperty("value");
      expect(data.config.macaroon).toHaveProperty("set");
      expect(data.config.macaroon).toHaveProperty("value");

      expect(data.connectionTest).toHaveProperty("success");
    });

    it("should return correct response structure for error case", async () => {
      fetchMock = vi
        .spyOn(global, "fetch")
        .mockRejectedValue(new Error("Test error"));

      const response = await GET();
      const data = await response.json();

      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("config");
      expect(data).toHaveProperty("connectionTest");

      expect(data.connectionTest.success).toBe(false);
      expect(data.connectionTest).toHaveProperty("error");
    });

    it("should return correct response structure when config is missing", async () => {
      delete process.env.LND_REST_URL;
      delete process.env.LND_ADMIN_MACAROON;

      const response = await GET();
      const data = await response.json();

      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("config");
      expect(data).toHaveProperty("connectionTest");

      expect(data.config.url.set).toBe(false);
      expect(data.config.macaroon.set).toBe(false);
      expect(data.connectionTest.success).toBe(false);
      expect(data.connectionTest.error).toBe("Not attempted");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty string configuration values", async () => {
      process.env.LND_REST_URL = "";
      process.env.LND_ADMIN_MACAROON = "";

      const response = await GET();
      const data = await response.json();

      expect(data.config.url.set).toBe(false);
      expect(data.config.macaroon.set).toBe(false);
      expect(data.connectionTest.success).toBe(false);
    });

    it("should handle very short configuration values", async () => {
      process.env.LND_REST_URL = "http://x";
      process.env.LND_ADMIN_MACAROON = "123";

      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({}),
        headers: new Headers(),
      } as Response);

      const response = await GET();
      const data = await response.json();

      expect(data.config.url.value).toBe("http://x...");
      expect(data.config.macaroon.value).toBe("123...");
    });

    it("should handle configuration values exactly 10 characters", async () => {
      process.env.LND_REST_URL = "1234567890";
      process.env.LND_ADMIN_MACAROON = "abcdefghij";

      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({}),
        headers: new Headers(),
      } as Response);

      const response = await GET();
      const data = await response.json();

      expect(data.config.url.value).toBe("1234567890...");
      expect(data.config.macaroon.value).toBe("abcdefghij...");
    });

    it("should handle malformed JSON response from Lightning node", async () => {
      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
        headers: new Headers(),
      } as Response);

      const response = await GET();
      const data = await response.json();

      expect(data.connectionTest.success).toBe(false);
      expect(data.connectionTest.error).toBe("Invalid JSON");
    });

    it("should handle NODE_ENV undefined", async () => {
      delete process.env.NODE_ENV;

      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({}),
        headers: new Headers(),
      } as Response);

      const response = await GET();

      // Should allow access when NODE_ENV is not set (development default)
      expect(response.status).toBe(200);
    });

    it("should handle case-sensitive NODE_ENV", async () => {
      process.env.NODE_ENV = "PRODUCTION"; // uppercase

      const response = await GET();

      // Should only block when exactly 'production' (lowercase)
      expect(response.status).toBe(200);
    });

    it("should handle special characters in error messages", async () => {
      const specialError = new Error(
        "Error with \"quotes\" and 'apostrophes' and <tags>"
      );
      fetchMock = vi.spyOn(global, "fetch").mockRejectedValue(specialError);

      const response = await GET();
      const data = await response.json();

      expect(data.connectionTest.error).toBe(
        "Error with \"quotes\" and 'apostrophes' and <tags>"
      );
    });
  });

  describe("Security Validation", () => {
    it("should not leak credentials in error responses", async () => {
      const sensitiveUrl = "https://super-secret-node.example.com:8080";
      const sensitiveMacaroon = "secret-macaroon-0123456789abcdef";
      process.env.LND_REST_URL = sensitiveUrl;
      process.env.LND_ADMIN_MACAROON = sensitiveMacaroon;

      fetchMock = vi
        .spyOn(global, "fetch")
        .mockRejectedValue(new Error(`Failed to connect to ${sensitiveUrl}`));

      const response = await GET();
      const responseText = await response.text();

      // Error message might contain URL, but config should still be sanitized
      const data = JSON.parse(responseText);
      expect(data.config.url.value).not.toContain(sensitiveUrl);
      expect(data.config.macaroon.value).not.toContain(sensitiveMacaroon);
    });

    it("should not expose macaroon in fetch call errors", async () => {
      const sensitiveMacaroon = "secret-macaroon-0123456789abcdef";
      process.env.LND_ADMIN_MACAROON = sensitiveMacaroon;

      fetchMock = vi
        .spyOn(global, "fetch")
        .mockRejectedValue(new Error("Fetch failed"));

      const response = await GET();
      const responseText = await response.text();

      expect(responseText).not.toContain(sensitiveMacaroon);
    });

    it("should always return 200 status for debug information (except production)", async () => {
      // Success case
      fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({}),
        headers: new Headers(),
      } as Response);

      let response = await GET();
      expect(response.status).toBe(200);

      // Error case
      fetchMock.mockRejectedValue(new Error("Test error"));
      response = await GET();
      expect(response.status).toBe(200);

      // Missing config case
      delete process.env.LND_REST_URL;
      response = await GET();
      expect(response.status).toBe(200);
    });
  });
});
