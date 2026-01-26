import { NextRequest, NextResponse } from 'next/server';
import { mockTwilioStore } from '@/lib/mock-twilio-store';
import { serverEnv } from '@/lib/env';

/**
 * Mock Twilio Messages API Endpoint
 * 
 * Simulates Twilio's POST /2010-04-01/Accounts/{AccountSid}/Messages.json endpoint
 * for sending SMS messages during testing.
 * 
 * Only active when USE_MOCKS is true.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: { accountSid: string } }
) {
  // Validate mock mode
  if (!serverEnv.USE_MOCKS) {
    return NextResponse.json(
      { error: 'Mock endpoint not available in production mode' },
      { status: 400 }
    );
  }

  const accountSid = params.accountSid;

  try {
    // Parse form data (Twilio uses application/x-www-form-urlencoded)
    const formData = await request.formData();
    const to = formData.get('To') as string;
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string;

    // Validate required fields
    if (!to || !from || !body) {
      return NextResponse.json(
        {
          code: 21602,
          message: 'Message body is required',
          status: 400
        },
        { status: 400 }
      );
    }

    // Validate phone number format (basic check)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(to.replace(/\s/g, ''))) {
      return NextResponse.json(
        {
          code: 21211,
          message: 'The \'To\' number is not a valid phone number',
          status: 400
        },
        { status: 400 }
      );
    }

    // Send message through mock store
    const message = mockTwilioStore.sendMessage({
      accountSid,
      to,
      from,
      body
    });

    // Return Twilio-compatible response
    return NextResponse.json(message, { status: 201 });

  } catch (error) {
    console.error('[Mock Twilio API] Error processing message:', error);
    return NextResponse.json(
      {
        code: 20003,
        message: 'Internal Server Error',
        status: 500
      },
      { status: 500 }
    );
  }
}
