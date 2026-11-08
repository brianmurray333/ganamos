import { timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"

/**
 * Authorize a cron/admin-automation request.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET
 * env var is set, so that header is the only thing we trust. Headers like
 * `x-vercel-cron` / `x-vercel-id` are NOT proof (anyone can send the former;
 * Vercel adds the latter to every request). Fails closed if CRON_SECRET is unset.
 */
export function isAuthorizedCronRequest(request: NextRequest | Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[cron-auth] CRON_SECRET is not configured; rejecting request")
    return false
  }
  const header = request.headers.get("authorization") || ""
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(header)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
