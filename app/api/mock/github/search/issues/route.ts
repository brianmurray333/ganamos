/**
 * Mock GitHub Search Issues API Endpoint
 * Mimics GitHub's Search Issues API for local development and testing
 * Only active when USE_MOCKS=true
 * 
 * Endpoint: /api/mock/github/search/issues?q={query}
 * Format: https://docs.github.com/en/rest/search#search-issues-and-pull-requests
 */

import { NextRequest, NextResponse } from "next/server";
import { mockGitHubStore } from "@/lib/mock-github-store";

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}

// Handle GET request for search queries
export async function GET(request: NextRequest) {
  try {
    // Guard: Only available in mock mode
    if (process.env.USE_MOCKS !== "true") {
      console.error("[Mock GitHub API] Attempt to access mock endpoint when USE_MOCKS is not enabled");
      return NextResponse.json(
        { 
          message: "Mock GitHub API is not enabled. Set USE_MOCKS=true in environment.",
          error: "Mock mode not enabled" 
        },
        { status: 401 }
      );
    }

    // Parse query parameter
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json(
        { 
          message: "Missing required query parameter 'q'",
          error: "Bad request" 
        },
        { status: 400 }
      );
    }

    console.log(`[Mock GitHub API] Received search request with query: "${query}"`);

    // Get mock store instance and search
    const store = mockGitHubStore.getInstance();
    const response = store.searchPRs(query);

    // Return GitHub Search Issues API format
    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[Mock GitHub API] Error processing search request:", error);
    return NextResponse.json(
      { 
        message: "Internal server error processing search request",
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}
