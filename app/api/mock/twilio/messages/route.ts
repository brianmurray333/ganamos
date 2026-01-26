import { NextRequest, NextResponse } from 'next/server';
import { mockTwilioStore } from '@/lib/mock-twilio-store';
import { serverEnv } from '@/lib/env';

/**
 * Mock Twilio Messages Inspection Endpoint
 * 
 * Admin endpoint for viewing and managing mock SMS messages.
 * 
 * GET - List all messages (optional ?phone=XXX filter)
 * DELETE - Clear all messages
 * 
 * Only active when USE_MOCKS is true.
 */

export async function GET(request: NextRequest) {
  // Restrict to mock mode only
  if (!serverEnv.USE_MOCKS) {
    return NextResponse.json(
      { error: 'Mock inspection endpoint not available in production mode' },
      { status: 400 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const phoneFilter = searchParams.get('phone');

    let messages;
    if (phoneFilter) {
      messages = mockTwilioStore.getMessagesByPhone(phoneFilter);
    } else {
      messages = mockTwilioStore.getAllMessages();
    }

    return NextResponse.json({
      success: true,
      count: messages.length,
      messages: messages
    });

  } catch (error) {
    console.error('[Mock Twilio Inspector] Error retrieving messages:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve messages' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  // Restrict to mock mode only
  if (!serverEnv.USE_MOCKS) {
    return NextResponse.json(
      { error: 'Mock inspection endpoint not available in production mode' },
      { status: 400 }
    );
  }

  try {
    const countBefore = mockTwilioStore.getMessageCount();
    mockTwilioStore.reset();

    return NextResponse.json({
      success: true,
      message: `Cleared ${countBefore} messages from mock store`
    });

  } catch (error) {
    console.error('[Mock Twilio Inspector] Error clearing messages:', error);
    return NextResponse.json(
      { error: 'Failed to clear messages' },
      { status: 500 }
    );
  }
}
