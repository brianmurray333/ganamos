/**
 * Mock Lightning Payment Sending Endpoint
 * Mirrors LND REST API POST /v1/channels/transactions endpoint (SendPaymentSync)
 * Only active when USE_MOCKS=true
 */

import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { mockLightningStore } from "@/lib/mock-lightning-store";

export async function POST(request: NextRequest) {
  // Safety check: Only work in mock mode
  if (!serverEnv?.lightning.useMock) {
    return NextResponse.json(
      { error: "Mock Lightning is not enabled. Set USE_MOCKS=true" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    // Extract parameters (matching LND API format)
    const paymentRequest = body.payment_request;
    const amount = body.amt ? parseInt(body.amt, 10) : null;

    // Validation
    if (!paymentRequest) {
      return NextResponse.json(
        { payment_error: "Missing payment_request" },
        { status: 400 }
      );
    }

    // Basic BOLT11 format validation (should start with 'lnbc' or 'lntb' for testnet)
    if (!paymentRequest.startsWith("lnbc") && !paymentRequest.startsWith("lntb")) {
      return NextResponse.json(
        { payment_error: "Invalid BOLT11 invoice format" },
        { status: 400 }
      );
    }

    console.log(`[Mock Lightning] Paying invoice: ${paymentRequest.substring(0, 20)}...`);
    if (amount) {
      console.log(`[Mock Lightning] Amount specified: ${amount} sats`);
    }

    // Generate a mock payment hash (32 bytes hex)
    const paymentHash = generatePaymentHash();
    const paymentHashBase64 = hexToBase64(paymentHash);

    // Check if this is a mock invoice and settle it automatically
    // This enables round-trip testing (create invoice -> pay it -> check settled)
    if (paymentRequest.includes("1mock")) {
      console.log("[Mock Lightning] Detected mock invoice, attempting to settle...");

      // Try to find and settle the invoice
      const allInvoices = mockLightningStore.getAllInvoices();
      const matchingInvoice = allInvoices.find(
        inv => inv.paymentRequest === paymentRequest
      );

      if (matchingInvoice) {
        mockLightningStore.settleInvoice(matchingInvoice.rHash);
        console.log(`[Mock Lightning] Auto-settled mock invoice ${matchingInvoice.rHash.substring(0, 8)}...`);
      }
    }

    console.log(`[Mock Lightning] Payment successful, payment_hash: ${paymentHash.substring(0, 16)}...`);

    // Return response matching LND API format (SendPaymentSync response)
    return NextResponse.json({
      payment_error: "",
      payment_preimage: "", // Could generate a preimage if needed
      payment_route: null,
      payment_hash: paymentHashBase64,
    });
  } catch (error) {
    console.error("[Mock Lightning] Error sending payment:", error);
    return NextResponse.json(
      { payment_error: "Failed to send mock payment" },
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

// Helper function to generate a random payment hash
function generatePaymentHash(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for Node.js
    const nodeCrypto = require("crypto");
    nodeCrypto.randomFillSync(bytes);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Helper function to convert hex to base64
function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );
  return Buffer.from(bytes).toString("base64");
}
