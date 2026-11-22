/**
 * Review reminder limits, mirrored for display from the SQL that enforces
 * them (public.record_fix_review_reminder, 20261122030000): a fixer may
 * remind reviewers once the fix has waited 1 hour, then at most once every
 * 24 hours, up to 3 times in any 30 days. The server counts from a log users
 * can't write; posts.review_reminder_count/last_at are its display copy.
 */

export const REMINDER_MIN_WAIT_MS = 60 * 60 * 1000
export const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000
export const REMINDER_MAX = 3
export const REMINDER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export type ReminderFields = {
  submitted_fix_at: string | null
  review_reminder_count?: number | null
  review_reminder_last_at?: string | null
}

/** Parse a timestamp; zone-less values (submitted_fix_at) are UTC. */
export function parseDbTime(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T")
  const d = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export type ReminderAvailability =
  | { canRemind: true; sent: number }
  | { canRemind: false; sent: number; reason: "too_soon"; nextAt: Date }
  | { canRemind: false; sent: number; reason: "limit_reached" }

export function reminderAvailability(row: ReminderFields, now = new Date()): ReminderAvailability {
  const last = parseDbTime(row.review_reminder_last_at)
  const recent = !!last && now.getTime() - last.getTime() < REMINDER_WINDOW_MS
  const sent = recent ? Math.max(0, row.review_reminder_count ?? 0) : 0
  if (sent >= REMINDER_MAX) return { canRemind: false, sent, reason: "limit_reached" }

  const submitted = parseDbTime(row.submitted_fix_at) ?? now
  let next = submitted.getTime() + REMINDER_MIN_WAIT_MS
  if (last) next = Math.max(next, last.getTime() + REMINDER_INTERVAL_MS)
  if (next > now.getTime()) return { canRemind: false, sent, reason: "too_soon", nextAt: new Date(next) }
  return { canRemind: true, sent }
}

/** "in 3h", "in 25m", "tomorrow" style wait label */
export function waitLabel(until: Date, now = new Date()): string {
  const mins = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60000))
  if (mins < 60) return `in ${mins}m`
  const hrs = Math.ceil(mins / 60)
  return `in ${hrs}h`
}
