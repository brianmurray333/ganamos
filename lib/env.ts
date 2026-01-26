/**
 * Centralized environment variable management
 * Provides type-safe access to environment variables with runtime validation
 */

// Helper to check if we're on the server
const isServer = typeof window === "undefined";

// Helper to get required env var with validation
function getRequiredEnv(key: string, serverOnly = false): string {
  if (serverOnly && !isServer) {
    throw new Error(
      `${key} is server-only and cannot be accessed in the browser`
    );
  }

  const value = process.env[key];
  if (!value) {
    // More detailed error logging
    console.error(`Missing required environment variable: ${key}`);
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC')));
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Helper to get optional env var
function getOptionalEnv(key: string, serverOnly = false): string | undefined {
  if (serverOnly && !isServer) {
    return undefined;
  }
  return process.env[key];
}

// Helper to get env var with default
function getEnvWithDefault(
  key: string,
  defaultValue: string,
  serverOnly = false
): string {
  if (serverOnly && !isServer) {
    return defaultValue;
  }
  return process.env[key] || defaultValue;
}

// Helper for boolean flags
function getBooleanEnv(key: string, defaultValue = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() !== "false" && value !== "0";
}

// ============================================================================
// PUBLIC ENVIRONMENT VARIABLES (Available in browser)
// ============================================================================

export const publicEnv = {
  // Supabase
  supabase: {
    url: getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  },

  // App URLs
  appUrl: getOptionalEnv("NEXT_PUBLIC_APP_URL"),
  podUrl: getOptionalEnv("NEXT_PUBLIC_POD_URL"),
} as const;

// ============================================================================
// SERVER-ONLY ENVIRONMENT VARIABLES
// ============================================================================

const useMock = getBooleanEnv("USE_MOCKS");
const port = getEnvWithDefault("PORT", "3457", true);

export const serverEnv = isServer
  ? ({
      // Node environment
      nodeEnv: (process.env.NODE_ENV || "development") as
        | "development"
        | "production"
        | "test",
      isDevelopment: process.env.NODE_ENV === "development",
      isProduction: process.env.NODE_ENV === "production",
      isTest: process.env.NODE_ENV === "test",

      // Mock mode (globally accessible)
      useMock,

      // Vercel
      vercelUrl: getOptionalEnv("VERCEL_URL", true),

      // Supabase (server-side)
      supabase: {
        // Use SUPABASE_SECRET_API_KEY (required - matches Vercel production)
        serviceKey:
          getOptionalEnv("SUPABASE_SECRET_API_KEY", true) ||
          getOptionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", true) ||
          "",
      },

      // Lightning Network
      lightning: {
        useMock,
        mockAutoSettleMs: parseInt(
          getEnvWithDefault("MOCK_LIGHTNING_AUTO_SETTLE_MS", "5000", true)
        ),
        lndRestUrl: useMock
          ? `http://localhost:${port}/api/mock/lightning`
          : getOptionalEnv("LND_REST_URL", true),
        lndAdminMacaroon: useMock
          ? "aabb"
          : getOptionalEnv("LND_ADMIN_MACAROON", true),
        voltageApiKey: getOptionalEnv("VOLTAGE_API_KEY", true),
        voltageOrgId: getOptionalEnv("VOLTAGE_ORGANIZATION_ID", true),
        voltageEnvId: getOptionalEnv("VOLTAGE_ENVIRONMENT_ID", true),

        // Computed helper
        get isConfigured(): boolean {
          if (this.useMock) {
            return true; // Mock is always "configured"
          }
          return !!(this.lndRestUrl && this.lndAdminMacaroon);
        },
      },

      // External APIs
      apis: {
        googleMapsServer: getOptionalEnv("GOOGLE_MAPS_API_KEY", true), // Server-side only
        resend: getOptionalEnv("RESEND_API_KEY", true),
      },
      // GROQ AI Configuration
      groq: {
        useMock,
        apiKey: useMock
          ? "mock-groq-api-key"
          : getOptionalEnv("GROQ_API_KEY", true),
        
        get isConfigured(): boolean {
          return this.useMock || !!this.apiKey;
        },
      },

      // Google Maps (with mock support)
      googleMaps: {
        useMock,
        apiKey: useMock
          ? "mock-google-maps-key"
          : (getOptionalEnv("GOOGLE_MAPS_API_KEY", true) ||
             getOptionalEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", true)),

        // URL getters for geocoding and distance matrix
        getGeocodingUrl(latitude: number, longitude: number): string {
          if (this.useMock) {
            return `http://localhost:${port}/api/mock/maps/geocode?latlng=${latitude},${longitude}`
          }
          return `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${this.apiKey}`
        },

        getDistanceMatrixUrl(
          origin: string,
          destination: string,
          mode: string
        ): string {
          if (this.useMock) {
            return `http://localhost:${port}/api/mock/maps/distancematrix?origins=${origin}&destinations=${destination}&mode=${mode}`
          }
          return `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&mode=${mode}&key=${this.apiKey}`
        },

        /**
         * Get static map URL - always returns local proxy endpoint
         * The proxy handles mock vs real internally, keeping API keys server-side
         */
        getStaticMapUrl(params: {
          latitude: number
          longitude: number
          zoom?: string
          size?: string
          scale?: string
          maptype?: string
          markers?: string
          style?: string
        }): string {
          const {
            latitude,
            longitude,
            zoom = "15",
            size = "640x400",
            scale = "2",
            maptype = "roadmap",
            markers = `color:0xF7931A|${latitude},${longitude}`,
            style = "",
          } = params

          const queryParams = new URLSearchParams({
            latitude: latitude.toString(),
            longitude: longitude.toString(),
            zoom,
            size,
            scale,
            maptype,
            markers,
          })

          if (style) {
            queryParams.set("style", style)
          }

          return `/api/maps/staticmap?${queryParams.toString()}`
        },

        get isConfigured(): boolean {
          return this.useMock || !!this.apiKey
        },
      },

      // Security
      security: {
        cronSecret: getOptionalEnv("CRON_SECRET", true),
        l402RootKey: getEnvWithDefault(
          "L402_ROOT_KEY",
          "default-root-key-change-in-production",
          true
        ),
      },

      // Feature Flags
      features: {
        enableScheduler: getBooleanEnv("ENABLE_SCHEDULER"),
        enableSphinx: getBooleanEnv("ENABLE_SPHINX", true), // Default true, disable with 'false'
      },

      // Integrations
      integrations: {
        sphinx: {
          chatPubkey: useMock 
            ? "mock-sphinx-chat-pubkey-027f3516ddb207bbcdad71ca11" 
            : getOptionalEnv("SPHINX_CHAT_PUBKEY", true),
          botId: useMock
            ? "MOCK_BOT_ID"
            : getOptionalEnv("SPHINX_BOT_ID", true),
          botSecret: useMock
            ? "mock-sphinx-secret"
            : getOptionalEnv("SPHINX_BOT_SECRET", true),
          apiUrl: useMock
            ? `http://localhost:${port}/api/mock/sphinx/action`
            : "https://bots.v2.sphinx.chat/api/action",
          get isConfigured(): boolean {
            if (useMock) return true; // Mock is always configured
            return !!(this.chatPubkey && this.botId && this.botSecret);
          },
        },
        nostr: {
          useMock,
          
          // Mock mode: Use test private key (64-char hex string)
          mockPrivateKey: useMock
            ? "0000000000000000000000000000000000000000000000000000000000000001"
            : undefined,
          
          // Real mode: Use NOSTR_PRIVATE_KEY from environment
          privateKey: useMock
            ? undefined
            : getOptionalEnv("NOSTR_PRIVATE_KEY", true),
          
          // Get relay URLs based on mode
          relayGetter: (): string[] => {
            if (useMock) {
              return [] // No real relays in mock mode
            }
            return [
              "wss://relay.damus.io",
              "wss://nostr.wine",
              "wss://relay.snort.social",
              "wss://nos.lol",
              "wss://relay.primal.net",
            ]
          },
          
          // Check if Nostr is configured and usable
          get isConfigured(): boolean {
            if (this.useMock) return true // Mock is always configured
            return !!this.privateKey // Real mode requires private key
          },
        },
        github: {
          useMock,
          token: getOptionalEnv("GITHUB_TOKEN", true),
          repo: getEnvWithDefault(
            "GITHUB_REPO",
            "brianmurray333/ganamos",
            true
          ),

          getSearchUrl(query: string): string {
            const encodedQuery = encodeURIComponent(query);
            if (this.useMock) {
              return `http://localhost:${port}/api/mock/github/search/issues?q=${encodedQuery}`;
            }
            return `https://api.github.com/search/issues?q=${encodedQuery}`;
          },

          get isConfigured(): boolean {
            if (this.useMock) return true; // Mock is always configured
            return !!this.token && !!this.repo;
          },
        },
        qrServer: {
          useMock,
          getQrCodeUrl(data: string, size: string = "200x200"): string {
            const encodedData = encodeURIComponent(data);
            if (this.useMock) {
              return `http://localhost:${port}/api/mock/qr-server/create-qr-code?size=${size}&data=${encodedData}`;
            }
            return `https://api.qrserver.com/v1/create-qr-code/?size=${size}&data=${encodedData}`;
          },
          get isConfigured(): boolean {
            return true; // QR Server API doesn't require authentication
          },
        },
      },
    } as const)
  : null;

// Type guard for server environment
export function assertServerEnv(): asserts serverEnv is NonNullable<
  typeof serverEnv
> {
  if (!isServer) {
    throw new Error(
      "Server environment variables can only be accessed on the server"
    );
  }
}

// ============================================================================
// COMPUTED/DERIVED VALUES
// ============================================================================

export const env = {
  ...publicEnv,

  // Smart app URL that works in all environments
  getAppUrl(): string {
    if (publicEnv.appUrl) {
      return publicEnv.appUrl;
    }

    if (!isServer) {
      // Browser: use window.location.origin
      return typeof window !== "undefined" ? window.location.origin : "";
    }

    // Server: use environment-based defaults
    if (serverEnv?.vercelUrl) {
      return `https://${serverEnv.vercelUrl}`;
    }

    return serverEnv?.isProduction
      ? "https://www.ganamos.earth"
      : `http://localhost:${port}`;
  },
} as const;

// ============================================================================
// VALIDATION
// ============================================================================

// Validate configuration on module load (fail fast)
if (isServer) {
  console.log("✓ Environment configuration loaded");
  console.log(`  Mode: ${serverEnv?.nodeEnv}`);
  console.log(
    `  Lightning: ${serverEnv?.lightning.useMock ? "MOCK" : serverEnv?.lightning.isConfigured ? "✓ Real" : "✗ Not configured"}`
  );
  console.log(`  Email: ${serverEnv?.useMock ? "MOCK" : "✓ Real (Resend)"}`);
  console.log(
    `  Google Maps: ${serverEnv?.googleMaps.useMock ? "MOCK" : serverEnv?.googleMaps.isConfigured ? "✓ Real" : "✗ Not configured"}`
  );
  console.log(
    `  Sphinx: ${serverEnv?.integrations.sphinx.isConfigured ? "✓" : "✗"}`
  );
  console.log(
    `  GitHub: ${serverEnv?.integrations.github.useMock ? "MOCK" : serverEnv?.integrations.github.isConfigured ? "✓ Real" : "✗ Not configured"}`
  );
}

// Export types for TypeScript inference
export type PublicEnv = typeof publicEnv;
export type ServerEnv = NonNullable<typeof serverEnv>;
