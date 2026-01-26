/**
 * Mock Nostr Event API (Single Event)
 * 
 * Debug endpoint for retrieving a specific mock Nostr event by ID.
 * Only accessible when USE_MOCKS=true.
 * 
 * GET /api/mock/nostr/events/[id] - Retrieve single event
 */

import { NextRequest, NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'
import { mockNostrStore } from '@/lib/mock-nostr-store'

/**
 * Security check: Ensure mock mode is enabled
 * Returns 403 error response if mocks are not enabled
 */
function checkMockEnabled(): NextResponse | null {
  if (!serverEnv?.integrations.nostr.useMock) {
    return NextResponse.json(
      { error: 'Mock mode not enabled. Set USE_MOCKS=true in environment.' },
      { status: 403 }
    )
  }
  return null
}

/**
 * GET /api/mock/nostr/events/[id]
 * 
 * Retrieve a specific Nostr event by ID
 * 
 * Response:
 * - 200: NostrEvent object
 * - 404: { error: "Event not found" }
 * - 403: { error: "Mock mode not enabled" }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Check mock mode is enabled
  const error = checkMockEnabled()
  if (error) return error

  try {
    const event = mockNostrStore.retrieve(params.id)

    if (!event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(event)
  } catch (error) {
    console.error('[MOCK NOSTR] Error retrieving event:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve event' },
      { status: 500 }
    )
  }
}