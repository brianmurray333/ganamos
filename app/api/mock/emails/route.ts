/**
 * Mock Email Debug Endpoint
 * View and manage mock emails sent during testing
 * Only active when USE_MOCKS=true
 */

import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { mockEmailStore, type EmailType } from "@/lib/mock-email-store";

export async function GET(request: NextRequest) {
  // Safety check: Only work in mock mode
  if (!serverEnv?.useMock) {
    return NextResponse.json(
      { error: "Mock mode is not enabled. Set USE_MOCKS=true" },
      { status: 403 }
    );
  }

  try {
    // Parse query parameters
    // Use URL constructor instead of nextUrl.searchParams to avoid static generation error
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as EmailType | null;
    const to = searchParams.get("to");
    const limit = searchParams.get("limit");

    // Build filter
    const filter: any = {};
    if (type) filter.type = type;
    if (to) filter.to = to;
    if (limit) filter.limit = parseInt(limit, 10);

    // Get emails
    const emails = mockEmailStore.getEmails(filter);

    console.log(`[Mock Email] Fetched ${emails.length} emails (filters: ${JSON.stringify(filter)})`);

    // Return simplified email data (without full HTML for readability)
    return NextResponse.json({
      success: true,
      count: emails.length,
      emails: emails.map(email => ({
        id: email.id,
        to: email.to,
        subject: email.subject,
        type: email.type,
        sentAt: email.sentAt,
        metadata: email.metadata,
        htmlPreview: email.html.substring(0, 100) + "...", // First 100 chars
      })),
    });
  } catch (error) {
    console.error("[Mock Email] Error fetching emails:", error);
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  // Safety check: Only work in mock mode
  if (!serverEnv?.useMock) {
    return NextResponse.json(
      { error: "Mock mode is not enabled. Set USE_MOCKS=true" },
      { status: 403 }
    );
  }

  try {
    mockEmailStore.clear();
    console.log("[Mock Email] Email store cleared");

    return NextResponse.json({
      success: true,
      message: "All mock emails cleared",
    });
  } catch (error) {
    console.error("[Mock Email] Error clearing emails:", error);
    return NextResponse.json(
      { error: "Failed to clear emails" },
      { status: 500 }
    );
  }
}

// OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
