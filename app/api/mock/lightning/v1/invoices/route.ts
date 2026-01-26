/**
 * Mock Lightning Invoice Creation Endpoint
 * Mirrors LND REST API /v1/invoices endpoint
 * Only active when USE_MOCK_LIGHTNING=true
 */

import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { mockLightningStore } from "@/lib/mock-lightning-store";

export async function POST(request: NextRequest) {
  // Safety check: Only work in mock mode
  if (!serverEnv?.lightning.useMock) {
    return NextResponse.json(
      { error: "Mock Lightning is not enabled. Set USE_MOCK_LIGHTNING=true" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    // Extract parameters (matching LND API format)
    const value = parseInt(body.value || "0", 10);
    const memo = body.memo || "";
    const expiry = body.expiry || "3600";

    // Validation
    // if (value <= 0) {
    //   return NextResponse.json(
    //     { error: 'Invalid invoice amount' },
    //     { status: 400 }
    //   )
    // }

    // Create mock invoice
    const invoice = mockLightningStore.createInvoice(value, memo);

    console.log(`[Mock Lightning] Created invoice: ${value} sats - "${memo}"`);
    console.log(`[Mock Lightning] Payment request: ${invoice.paymentRequest}`);
    console.log(`[Mock Lightning] r_hash: ${invoice.rHash}`);
    console.log(
      `[Mock Lightning] Will auto-settle in ${serverEnv.lightning.mockAutoSettleMs}ms`
    );

    // Return response matching LND API format
    return NextResponse.json({
      r_hash: invoice.rHashBase64, // LND returns base64
      r_hash_str: invoice.rHash, // Also return hex string for easier lookups
      payment_request: invoice.paymentRequest,
      add_index: invoice.addIndex,
      payment_addr: invoice.rHashBase64, // Mock payment address
    });
  } catch (error) {
    console.error("[Mock Lightning] Error creating invoice:", error);
    return NextResponse.json(
      { error: "Failed to create mock invoice" },
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Grpc-Metadata-macaroon",
    },
  });
}
