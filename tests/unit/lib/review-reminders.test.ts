import { describe, it, expect } from 'vitest'
import { reminderAvailability, parseDbTime, waitLabel, REMINDER_MAX } from '@/lib/review-reminders'

const now = new Date('2026-11-22T18:00:00Z')
const hoursAgo = (h: number, zoneless = true) => {
  const d = new Date(now.getTime() - h * 3600_000).toISOString()
  return zoneless ? d.replace('T', ' ').replace('Z', '') : d
}

describe('reminderAvailability (display mirror of record_fix_review_reminder)', () => {
  it('waits an hour after submitting', () => {
    const a = reminderAvailability({ submitted_fix_at: hoursAgo(0.5) }, now)
    expect(a).toMatchObject({ canRemind: false, reason: 'too_soon', sent: 0 })
    if (!a.canRemind && a.reason === 'too_soon') expect(a.nextAt.toISOString()).toBe('2026-11-22T18:30:00.000Z')
  })

  it('allows the first reminder after an hour', () => {
    expect(reminderAvailability({ submitted_fix_at: hoursAgo(2) }, now)).toEqual({ canRemind: true, sent: 0 })
  })

  it('waits 24h after the last reminder of this submission', () => {
    const sub = hoursAgo(30)
    expect(
      reminderAvailability({ submitted_fix_at: sub, review_reminder_for: sub, review_reminder_count: 1, review_reminder_last_at: hoursAgo(10, false) }, now)
    ).toMatchObject({ canRemind: false, reason: 'too_soon', sent: 1 })
    expect(
      reminderAvailability({ submitted_fix_at: sub, review_reminder_for: sub, review_reminder_count: 1, review_reminder_last_at: hoursAgo(25, false) }, now)
    ).toEqual({ canRemind: true, sent: 1 })
  })

  it('stops at the maximum', () => {
    const sub = hoursAgo(100)
    expect(
      reminderAvailability({ submitted_fix_at: sub, review_reminder_for: sub, review_reminder_count: REMINDER_MAX, review_reminder_last_at: hoursAgo(48, false) }, now)
    ).toMatchObject({ canRemind: false, reason: 'limit_reached' })
  })

  it('ignores counters from an earlier submission, and negative counts', () => {
    expect(
      reminderAvailability({ submitted_fix_at: hoursAgo(2), review_reminder_for: hoursAgo(50), review_reminder_count: 3, review_reminder_last_at: hoursAgo(1, false) }, now)
    ).toEqual({ canRemind: true, sent: 0 })
    const sub = hoursAgo(2)
    expect(reminderAvailability({ submitted_fix_at: sub, review_reminder_for: sub, review_reminder_count: -5 }, now)).toEqual({ canRemind: true, sent: 0 })
  })
})

describe('helpers', () => {
  it('parses zone-less timestamps as UTC', () => {
    expect(parseDbTime('2026-11-22 17:27:27.032611')?.toISOString()).toBe('2026-11-22T17:27:27.032Z')
    expect(parseDbTime('2026-11-22T17:27:27+00:00')?.toISOString()).toBe('2026-11-22T17:27:27.000Z')
    expect(parseDbTime(null)).toBeNull()
  })

  it('labels waits', () => {
    expect(waitLabel(new Date(now.getTime() + 25 * 60_000), now)).toBe('in 25m')
    expect(waitLabel(new Date(now.getTime() + 5.2 * 3600_000), now)).toBe('in 6h')
  })
})
