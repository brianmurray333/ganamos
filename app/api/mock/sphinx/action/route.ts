import { NextRequest, NextResponse } from 'next/server'
import { mockSphinxStore } from '@/lib/mock-sphinx-store'

/**
 * Mock Sphinx Chat API endpoint
 * 
 * Mimics the real Sphinx Chat Bot API for development/testing:
 * https://bots.v2.sphinx.chat/api/action
 * 
 * Accepts POST requests with the same payload structure as the real API
 * and returns compatible responses.
 * 
 * POST /api/mock/sphinx/action
 * Body:
 * {
 *   chat_pubkey: string,
 *   bot_id: string,
 *   bot_secret: string,
 *   content: string,
 *   action: 'broadcast' | 'message'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const { chat_pubkey, bot_id, bot_secret, content, action } = body

    console.log('[MOCK SPHINX] Received request to /api/mock/sphinx/action')

    // Validate required fields
    if (!chat_pubkey || !bot_id || !bot_secret || !content) {
      console.error('[MOCK SPHINX] Missing required fields')
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: chat_pubkey, bot_id, bot_secret, content'
        },
        { status: 400 }
      )
    }

    // Validate action (default to 'broadcast' if not specified)
    const messageAction = action || 'broadcast'
    if (messageAction !== 'broadcast' && messageAction !== 'message') {
      console.error('[MOCK SPHINX] Invalid action:', messageAction)
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid action. Must be "broadcast" or "message"'
        },
        { status: 400 }
      )
    }

    // Mock authentication check
    // In mock mode, we accept any bot_secret for simplicity
    console.log('[MOCK SPHINX] Authentication accepted (mock mode)')
    console.log('[MOCK SPHINX] Bot ID:', bot_id)
    console.log('[MOCK SPHINX] Action:', messageAction)

    // Auto-create message in mock store
    const message = mockSphinxStore.broadcastMessage(
      chat_pubkey,
      bot_id,
      content
    )

    // Return response matching real Sphinx API format
    // Real API returns: { success: true, message_id, chat_id }
    const response = {
      success: true,
      message_id: message.messageId,
      chat_id: message.chatId,
      timestamp: message.timestamp.toISOString(),
    }

    console.log('[MOCK SPHINX] Response:', {
      message_id: response.message_id,
      chat_id: response.chat_id
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error('[MOCK SPHINX] Error processing request:', error)
    
    // Return error response matching real API format
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

/**
 * Handle unsupported methods
 */
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'Method not allowed. Use POST to broadcast messages.'
    },
    { status: 405 }
  )
}