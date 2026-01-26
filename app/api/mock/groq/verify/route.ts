import { NextRequest, NextResponse } from 'next/server';
import { mockGroqStore } from '@/lib/mock-groq-store';
import { serverEnv } from '@/lib/env';

/**
 * Mock GROQ Vision API - Verify Fix Endpoint
 * 
 * Simulates GROQ's image analysis capabilities for fix verification.
 * Only available when USE_MOCKS=true.
 */

export async function POST(request: NextRequest) {
  // Ensure mock mode is enabled
  if (!serverEnv?.useMock) {
    return NextResponse.json(
      { error: 'Mock endpoints only available when USE_MOCKS=true' },
      { status: 403 }
    );
  }

  try {
    const { beforeImage, afterImage, description, title } = await request.json();

    // Validate required fields
    if (!beforeImage || !afterImage || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: beforeImage, afterImage, description' },
        { status: 400 }
      );
    }

    // Simulate API processing delay (200-500ms)
    const delay = 200 + Math.random() * 300;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Generate verification result
    const result = mockGroqStore.verifyFix(
      beforeImage,
      afterImage,
      description,
      title || 'Untitled Issue'
    );

    // Return in same format as real GROQ API response
    return NextResponse.json({
      confidence: result.confidence,
      reasoning: result.reasoning,
    });

  } catch (error) {
    console.error('[MOCK GROQ] Error processing verification:', error);
    return NextResponse.json(
      { 
        error: 'Failed to verify fix',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}