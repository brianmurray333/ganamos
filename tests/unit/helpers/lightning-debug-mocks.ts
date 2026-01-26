import { vi } from "vitest";

/**
 * Helper function to create a mock successful Lightning node response
 */
export function createMockLightningNodeResponse(data?: Record<string, any>) {
  return {
    ok: true,
    json: async () => data || {},
    headers: new Headers(),
  } as Response;
}

/**
 * Helper function to create a mock failed Lightning node response
 */
export function createMockLightningErrorResponse(
  status: number,
  text: string = "Error"
) {
  return {
    ok: false,
    status,
    text: async () => text,
    headers: new Headers(),
  } as Response;
}

/**
 * Helper function to create a mock fetch spy that resolves successfully
 */
export function mockSuccessfulFetch(data?: Record<string, any>) {
  return vi.spyOn(global, "fetch").mockResolvedValue(
    createMockLightningNodeResponse(data)
  );
}

/**
 * Helper function to create a mock fetch spy that rejects with an error
 */
export function mockFailedFetch(error: Error | string) {
  return vi.spyOn(global, "fetch").mockRejectedValue(error);
}

/**
 * Helper function to create a mock fetch spy that returns an HTTP error
 */
export function mockHttpErrorFetch(status: number, text: string = "Error") {
  return vi
    .spyOn(global, "fetch")
    .mockResolvedValue(createMockLightningErrorResponse(status, text));
}

/**
 * Mock data for a typical Lightning node info response
 */
export const mockNodeData = {
  identity_pubkey: "03test1234567890abcdef",
  alias: "Test Lightning Node",
  version: "0.15.0-beta",
  synced_to_chain: true,
  block_height: 800000,
};

/**
 * Test environment variables for Lightning configuration
 */
export const testLightningConfig = {
  LND_REST_URL: "https://test-node.example.com:8080",
  LND_ADMIN_MACAROON: "0123456789abcdef0123456789abcdef0123456789abcdef",
};

/**
 * Helper function to set up Lightning test environment variables
 */
export function setupLightningEnv(overrides?: {
  url?: string;
  macaroon?: string;
  nodeEnv?: string;
}) {
  process.env.NODE_ENV = overrides?.nodeEnv || "development";
  process.env.LND_REST_URL =
    overrides?.url !== undefined
      ? overrides.url
      : testLightningConfig.LND_REST_URL;
  process.env.LND_ADMIN_MACAROON =
    overrides?.macaroon !== undefined
      ? overrides.macaroon
      : testLightningConfig.LND_ADMIN_MACAROON;
}
