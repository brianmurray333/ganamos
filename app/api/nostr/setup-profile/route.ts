import { NextRequest, NextResponse } from 'next/server'
import { setupGanamosProfile } from '@/lib/nostr'

export async function POST(req: NextRequest) {
  try {
    console.log('[NOSTR] Setting up Ganamos profile...')
    
    const result = await setupGanamosProfile()
    
    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        eventId: result.eventId,
        relaysPublished: result.relaysPublished 
      })
    } else {
      return NextResponse.json({ 
        success: false, 
        error: result.error 
      }, { status: 500 })
    }
  } catch (error) {
    console.error('[NOSTR] Error setting up profile:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'An unexpected error occurred' 
    }, { status: 500 })
  }
}
