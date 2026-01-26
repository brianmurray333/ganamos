import { NextRequest, NextResponse } from 'next/server';
import { mockGroqStore } from '@/lib/mock-groq-store';
import { serverEnv } from '@/lib/env';

/**
 * Debug endpoint to view all mock GROQ verifications
 * Only available when USE_MOCKS=true
 */

export async function GET(request: NextRequest) {
  if (!serverEnv?.useMock) {
    return NextResponse.json(
      { error: 'Mock endpoints only available when USE_MOCKS=true' },
      { status: 403 }
    );
  }

  const verifications = mockGroqStore.getAllVerifications();

  return NextResponse.json({
    count: verifications.length,
    verifications: verifications.map(v => ({
      ...v,
      beforeImage: '[truncated]',
      afterImage: '[truncated]',
    })),
  });
}

/**
 * Reset all verifications (for testing)
 */
export async function DELETE(request: NextRequest) {
  if (!serverEnv?.useMock) {
    return NextResponse.json(
      { error: 'Mock endpoints only available when USE_MOCKS=true' },
      { status: 403 }
    );
  }

  mockGroqStore.reset();

  return NextResponse.json({ message: 'All verifications cleared' });
}