import { NextResponse } from 'next/server'
import { mockSphinxStore } from '@/lib/mock-sphinx-store'

/**
 * Mock Sphinx Messages Debug Endpoint
 * 
 * Provides utilities for inspecting and managing the mock Sphinx store
 * during development and testing.
 * 
 * GET /api/mock/sphinx/messages - View all messages
 * DELETE /api/mock/sphinx/messages - Reset the store
 */

/**
 * Get all mock Sphinx messages
 * 
 * Returns a list of all messages that have been "broadcasted" in mock mode,
 * with content preview to avoid overwhelming the response.
 */
export async function GET() {
  const messages = mockSphinxStore.getAllMessages()
  
  console.log('[MOCK SPHINX] Debug endpoint accessed - returning', messages.length, 'messages')

  return NextResponse.json({
    success: true,
    count: messages.length,
    messages: messages.map(m => ({
      messageId: m.messageId,
      chatId: m.chatId,
      chatPubkey: m.chatPubkey.substring(0, 16) + '...',
      botId: m.botId,
      action: m.action,
      timestamp: m.timestamp.toISOString(),
      contentPreview: m.content.length > 100 
        ? m.content.substring(0, 100) + '...' 
        : m.content,
      contentLength: m.content.length,
    }))
  })
}

/**
 * Reset the mock Sphinx store
 * 
 * Clears all messages and resets the message counter.
 * Useful for cleaning up between test runs.
 */
export async function DELETE() {
  const previousCount = mockSphinxStore.getMessageCount()
  
  mockSphinxStore.reset()
  
  console.log('[MOCK SPHINX] Debug endpoint - store reset, cleared', previousCount, 'messages')

  return NextResponse.json({ 
    success: true, 
    message: 'Mock Sphinx store reset',
    previousCount 
  })
}

/**
 * Handle unsupported methods
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed. Use GET to view messages or DELETE to reset.'
    },
    { status: 405 }
  )
}