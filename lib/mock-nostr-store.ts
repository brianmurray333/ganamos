/**
 * Mock Nostr Relay Store
 * 
 * In-memory store for simulating Nostr relay publishing during development/testing.
 * Tracks published events without making real WebSocket connections.
 * 
 * Usage:
 * - Automatically used when USE_MOCKS=true
 * - Events stored in memory (reset on server restart)
 * - Access via /api/mock/nostr/events for debugging
 * - Simulates partial relay acceptance (4/5 relays succeed)
 */

import type { Event as NostrEvent } from 'nostr-tools'

export interface MockNostrStats {
  eventCount: number
  byKind: {
    [kind: number]: number
  }
  lastPublished: number | null
}

export interface NostrPublishResult {
  success: boolean
  eventId: string
  relaysPublished: number
  relaysFailed: number
  error?: string
}

export interface NostrEventFilter {
  kind?: number
  pubkey?: string
  since?: number
  until?: number
  limit?: number
}

class MockNostrStore {
  private events: Map<string, NostrEvent> = new Map()

  /**
   * Publish an event to the mock relay (mimics real relay publishing)
   * Simulates partial relay acceptance for realistic behavior
   * 
   * @param event - Signed Nostr event to publish
   * @returns Mock publish result matching real relay response shape
   */
  async publish(event: NostrEvent): Promise<NostrPublishResult> {
    try {
      // Store event in-memory
      this.events.set(event.id, event)

      // Simulate partial relay acceptance (4 out of 5 relays succeed)
      const relaysPublished = 4
      const relaysFailed = 1

      console.log('[MOCK NOSTR] Published event to mock relay:', event.id)
      console.log('[MOCK NOSTR] Event kind:', event.kind, '| Content length:', event.content.length)
      console.log(`[MOCK NOSTR] Published to ${relaysPublished}/5 relays (${relaysFailed} failed)`)

      return {
        success: true,
        eventId: event.id,
        relaysPublished,
        relaysFailed,
      }
    } catch (error) {
      console.error('[MOCK NOSTR] Error publishing event:', error)
      return {
        success: false,
        eventId: event.id || '',
        relaysPublished: 0,
        relaysFailed: 5,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Retrieve a specific event by ID
   * 
   * @param id - Event ID to retrieve
   * @returns Event if found, undefined otherwise
   */
  retrieve(id: string): NostrEvent | undefined {
    return this.events.get(id)
  }

  /**
   * Filter events by various criteria
   * 
   * @param filter - Filtering criteria (kind, pubkey, timestamps, limit)
   * @returns Array of matching events
   */
  filter(filter: NostrEventFilter = {}): NostrEvent[] {
    let events = Array.from(this.events.values())

    // Filter by kind (0=profile, 1=post)
    if (filter.kind !== undefined) {
      events = events.filter(e => e.kind === filter.kind)
    }

    // Filter by pubkey (publisher)
    if (filter.pubkey) {
      events = events.filter(e => e.pubkey === filter.pubkey)
    }

    // Filter by timestamp range
    if (filter.since) {
      events = events.filter(e => e.created_at >= filter.since!)
    }
    if (filter.until) {
      events = events.filter(e => e.created_at <= filter.until!)
    }

    // Sort by most recent first
    events.sort((a, b) => b.created_at - a.created_at)

    // Apply limit
    if (filter.limit) {
      events = events.slice(0, filter.limit)
    }

    return events
  }

  /**
   * Get all events (unfiltered)
   * 
   * @returns Array of all stored events
   */
  getAll(): NostrEvent[] {
    return Array.from(this.events.values())
  }

  /**
   * Get store statistics
   * 
   * @returns Statistics about stored events
   */
  getStats(): MockNostrStats {
    const events = Array.from(this.events.values())
    
    // Count events by kind
    const byKind: { [kind: number]: number } = {}
    let lastPublished: number | null = null

    for (const event of events) {
      byKind[event.kind] = (byKind[event.kind] || 0) + 1
      if (!lastPublished || event.created_at > lastPublished) {
        lastPublished = event.created_at
      }
    }

    return {
      eventCount: this.events.size,
      byKind,
      lastPublished,
    }
  }

  /**
   * Clear all stored events (for testing)
   */
  reset(): void {
    this.events.clear()
    console.log('[MOCK NOSTR] Store reset - all events cleared')
  }

  /**
   * Get event count
   * 
   * @returns Number of events in store
   */
  getEventCount(): number {
    return this.events.size
  }
}

// Ensure singleton across all Next.js contexts (API routes, server actions, etc.)
// This is necessary because Next.js can run code in different "realms" that don't share module state
const globalForNostr = globalThis as unknown as {
  mockNostrStore: MockNostrStore | undefined
}

export const mockNostrStore = globalForNostr.mockNostrStore ?? new MockNostrStore()

// Store in global during development to prevent issues with hot module reloading
if (process.env.NODE_ENV !== 'production') {
  globalForNostr.mockNostrStore = mockNostrStore
}