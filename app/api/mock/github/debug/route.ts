/**
 * Mock GitHub Debug Endpoint
 * Provides debugging utilities for mock GitHub store
 * Only available when USE_MOCKS=true
 * 
 * GET /api/mock/github/debug - Retrieve all mock PRs and store stats
 * POST /api/mock/github/debug/reset - Reset store to initial state
 */

import { NextRequest, NextResponse } from "next/server";
import { mockGitHubStore } from "@/lib/mock-github-store";

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}

// Handle GET request to retrieve all PRs
export async function GET(request: NextRequest) {
  try {
    // Guard: Only available in mock mode
    if (process.env.USE_MOCKS !== "true") {
      return NextResponse.json(
        { error: "Mock mode not enabled" },
        { status: 401 }
      );
    }

    const store = mockGitHubStore.getInstance();
    const prs = store.getAllPRs();
    const stats = store.getStats();

    console.log(`[Mock GitHub Debug] Retrieved ${prs.length} PRs from store`);

    return NextResponse.json({
      count: prs.length,
      stats,
      generatedAt: new Date().toISOString(),
      prs,
    }, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[Mock GitHub Debug] Error retrieving PRs:", error);
    return NextResponse.json(
      { 
        error: "Failed to retrieve PRs",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// Handle POST request to reset store
export async function POST(request: NextRequest) {
  try {
    // Guard: Only available in mock mode
    if (process.env.USE_MOCKS !== "true") {
      return NextResponse.json(
        { error: "Mock mode not enabled" },
        { status: 401 }
      );
    }

    const store = mockGitHubStore.getInstance();
    store.resetStore();
    
    const newCount = store.getAllPRs().length;
    const stats = store.getStats();

    console.log(`[Mock GitHub Debug] Store reset - Generated ${newCount} new PRs`);

    return NextResponse.json({
      success: true,
      message: "Store reset to initial state with fresh auto-generated PRs",
      count: newCount,
      stats,
    }, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[Mock GitHub Debug] Error resetting store:", error);
    return NextResponse.json(
      { 
        error: "Failed to reset store",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
