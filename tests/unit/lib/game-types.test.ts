import { describe, it, expect } from 'vitest'
import { parseGameType } from '@/lib/game-types'

describe('parseGameType', () => {
  it('treats a missing game as Flappy (older firmware)', () => {
    expect(parseGameType(undefined)).toBe('flappy')
    expect(parseGameType(null)).toBe('flappy')
    expect(parseGameType('')).toBe('flappy')
  })

  it('accepts each pet game', () => {
    expect(parseGameType('flappy')).toBe('flappy')
    expect(parseGameType('pickleball')).toBe('pickleball')
    expect(parseGameType('satcatcher')).toBe('satcatcher')
  })

  it('rejects unknown or non-string values', () => {
    expect(parseGameType('tetris')).toBeNull()
    expect(parseGameType('FLAPPY')).toBeNull()
    expect(parseGameType(3)).toBeNull()
    expect(parseGameType({})).toBeNull()
  })
})
