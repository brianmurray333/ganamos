/**
 * Claim tokens for anonymous fixers (browser-side storage).
 *
 * When an anonymous fix is recorded, the server returns a secret that proves
 * this browser submitted it. It's required later to set a payout address,
 * claim the reward into an account, or link the fix to a new account.
 */
const key = (postId: string) => `ganamos_anon_claim_${postId}`

export function saveClaimToken(postId: string | null | undefined, token: string | null | undefined): void {
  if (!postId || !token) return
  try {
    localStorage.setItem(key(postId), token)
  } catch {
    // Storage unavailable (private mode); the fixer can still use Lightning right away
  }
}

export function getClaimToken(postId: string | null | undefined): string | null {
  if (!postId) return null
  try {
    return localStorage.getItem(key(postId))
  } catch {
    return null
  }
}

export function clearClaimToken(postId: string | null | undefined): void {
  if (!postId) return
  try {
    localStorage.removeItem(key(postId))
  } catch {
    // ignore
  }
}
