/**
 * Mock Nostr Events API
 * 
 * Debug endpoints for inspecting and managing mock Nostr relay events.
 * Only accessible when USE_MOCKS=true.
 * 
 * GET  /api/mock/nostr/events - List/filter stored events
 * DELETE /api/mock/nostr/events - Reset store (clear all events)
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
 * GET /api/mock/nostr/events
 * 
 * List and filter stored Nostr events
 * 
 * Query parameters:
 * - kind: Filter by event kind (0=profile, 1=post)
 * - pubkey: Filter by publisher public key
 * - since: Filter by creation timestamp (unix timestamp)
 * - until: Filter by creation timestamp (unix timestamp)
 * - limit: Maximum number of events to return (default 100)
 * 
 * Response:
 * {
 *   events: NostrEvent[],
 *   stats: {
 *     eventCount: number,
 *     byKind: { [kind: number]: number },
 *     lastPublished: number | null
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  // Check mock mode is enabled
  const error = checkMockEnabled()
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)

    // Parse query parameters
    const kindParam = searchParams.get('kind')
    const pubkey = searchParams.get('pubkey') || undefined
    const sinceParam = searchParams.get('since')
    const untilParam = searchParams.get('until')
    const limitParam = searchParams.get('limit')

    const kind = kindParam ? parseInt(kindParam) : undefined
    const since = sinceParam ? parseInt(sinceParam) : undefined
    const until = untilParam ? parseInt(untilParam) : undefined
    const limit = limitParam ? parseInt(limitParam) : 100

    // Filter events
    const events = mockNostrStore.filter({
      kind,
      pubkey,
      since,
      until,
      limit,
    })

    // Get statistics
    const stats = mockNostrStore.getStats()

    return NextResponse.json({
      events,
      stats,
    })
  } catch (error) {
    console.error('[MOCK NOSTR] Error retrieving events:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve events' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/mock/nostr/events
 * 
 * Reset the mock Nostr store (clear all events)
 * 
 * Response:
 * {
 *   message: "Store reset",
 *   deletedCount: number
 * }
 */
export async function DELETE(request: NextRequest) {
  // Check mock mode is enabled
  const error = checkMockEnabled()
  if (error) return error

  try {
    const count = mockNostrStore.getEventCount()
    mockNostrStore.reset()

    return NextResponse.json({
      message: 'Store reset',
      deletedCount: count,
    })
  } catch (error) {
    console.error('[MOCK NOSTR] Error resetting store:', error)
    return NextResponse.json(
      { error: 'Failed to reset store' },
      { status: 500 }
    )
  }
}