/**
 * Mock QR Server API Endpoint
 * Mimics api.qrserver.com/v1/create-qr-code/ for development/testing
 * Returns SVG QR code images without external API calls
 */

import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { mockQrStore } from '@/lib/mock-qr-server-store';

export async function GET(request: NextRequest) {
  try {
    // Validate mock mode is enabled
    if (!serverEnv?.useMock) {
      console.warn('[Mock QR Server] Attempted access with USE_MOCKS=false');
      return NextResponse.json(
        { error: 'Mock QR Server API is not enabled. Set USE_MOCKS=true to use this endpoint.' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const data = searchParams.get('data');
    const size = searchParams.get('size') || '200x200';

    // Validate required parameters
    if (!data) {
      console.error('[Mock QR Server] Missing required parameter: data');
      return NextResponse.json(
        { error: 'Missing required parameter: data' },
        { status: 400 }
      );
    }

    // Validate size format
    if (!/^\d+x\d+$/.test(size)) {
      console.error('[Mock QR Server] Invalid size format:', size);
      return NextResponse.json(
        { error: 'Invalid size format. Expected format: WIDTHxHEIGHT (e.g., 200x200)' },
        { status: 400 }
      );
    }

    console.log('[Mock QR Server] Generating QR code');
    console.log('[Mock QR Server] Size:', size);
    console.log('[Mock QR Server] Data length:', data.length, 'characters');

    // Generate SVG QR code
    const svg = mockQrStore.generateQrCode(data, size);

    // Return SVG with appropriate content-type (matches real API behavior)
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year (deterministic)
      },
    });

  } catch (error) {
    console.error('[Mock QR Server] Error generating QR code:', error);
    return NextResponse.json(
      { error: 'Internal server error generating QR code' },
      { status: 500 }
    );
  }
}

// Debug endpoint to view statistics
export async function POST(request: NextRequest) {
  try {
    if (!serverEnv?.useMock) {
      return NextResponse.json(
        { error: 'Mock QR Server API is not enabled' },
        { status: 403 }
      );
    }

    const stats = mockQrStore.getStats();
    const qrCodes = mockQrStore.getAllQrCodes();

    return NextResponse.json({
      success: true,
      stats,
      qrCodes: qrCodes.map(qr => ({
        id: qr.id,
        size: qr.size,
        dataPreview: qr.data,
        generatedAt: qr.generatedAt,
      })),
    });

  } catch (error) {
    console.error('[Mock QR Server] Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Reset endpoint for testing
export async function DELETE() {
  try {
    if (!serverEnv?.useMock) {
      return NextResponse.json(
        { error: 'Mock QR Server API is not enabled' },
        { status: 403 }
      );
    }

    mockQrStore.reset();

    return NextResponse.json({
      success: true,
      message: 'Mock QR Server store reset successfully',
    });

  } catch (error) {
    console.error('[Mock QR Server] Error resetting store:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}