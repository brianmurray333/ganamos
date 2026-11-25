/**
 * Game rooms (multiplayer Pickleball, Flappy Pet, Sat Catcher with bets).
 *
 * Devices authenticate every game call with their id plus a per-device secret
 * (X-Device-Id + X-Device-Secret). The id alone is not enough: ids used to be
 * shared with other players. The pet generates the secret and claims it once
 * through the device config endpoint (see claimGameSecret); only its sha256 is
 * stored.
 *
 * All money moves inside the database functions in
 * supabase/migrations/20261126000000_game_rooms.sql; these helpers only
 * authenticate, call them, and translate their errors.
 */
import { NextRequest, NextResponse } from "next/server"
import { createHash, timingSafeEqual } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { checkRateLimit } from "@/lib/rate-limiter"

export const GAME_TYPES = ["pickleball", "flappy", "satcatcher"] as const
export type GameType = (typeof GAME_TYPES)[number]
export const BET_SIZES = [0, 10, 50, 100, 500] as const

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SECRET_RE = /^[0-9a-f]{64}$/

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v)
}

export function isGameType(v: unknown): v is GameType {
  return typeof v === "string" && (GAME_TYPES as readonly string[]).includes(v)
}

export function hashGameSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex")
}

function secretsMatch(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashGameSecret(secret), "hex")
  const b = Buffer.from(storedHash, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * A device claims its game secret: the pet generates it and sends it in the
 * config request (X-Game-Secret-Claim). The first claim is stored (as a hash);
 * repeating the same secret is accepted (safe to retry if a response is lost);
 * a different secret is refused unless the device is pairing again
 * (pairing-code auth), which replaces it. The server never sends a secret.
 */
export async function claimGameSecret(
  supabase: SupabaseClient,
  deviceId: string,
  secret: string,
  opts: { rotate: boolean }
): Promise<boolean> {
  if (!SECRET_RE.test(secret)) return false
  const hash = hashGameSecret(secret)
  const { data: device } = await supabase.from("devices").select("game_secret_hash").eq("id", deviceId).maybeSingle()
  if (!device) return false
  if (device.game_secret_hash && !opts.rotate) {
    const a = Buffer.from(hash, "hex")
    const b = Buffer.from(device.game_secret_hash, "hex")
    return a.length === b.length && timingSafeEqual(a, b)
  }
  let q = supabase
    .from("devices")
    .update({ game_secret_hash: hash, game_secret_issued_at: new Date().toISOString() })
    .eq("id", deviceId)
  // Without a new pairing, only the first claim may set it (no race to overwrite)
  if (!opts.rotate) q = q.is("game_secret_hash", null)
  const { data, error } = await q.select("id")
  return !error && !!data && data.length === 1
}

export type GameDevice = { id: string; user_id: string; pet_name: string }

/** Authenticate a game call. Returns the device, or a ready error response. */
export async function authenticateGameDevice(
  request: NextRequest,
  supabase: SupabaseClient
): Promise<{ device: GameDevice } | { response: NextResponse }> {
  const deviceId = request.headers.get("x-device-id")?.trim() || ""
  const secret = request.headers.get("x-device-secret")?.trim().toLowerCase() || ""
  if (!isUuid(deviceId) || !SECRET_RE.test(secret)) {
    return { response: gameError("unauthorized") }
  }
  const rl = checkRateLimit(`game-rooms-${deviceId}`, { maxRequests: 120, windowMs: 60 * 1000 })
  if (!rl.allowed) return { response: gameError("rate_limited") }

  const { data: device } = await supabase
    .from("devices")
    .select("id, user_id, pet_name, status, game_secret_hash")
    .eq("id", deviceId)
    .maybeSingle()
  if (!device || device.status !== "paired" || !device.game_secret_hash || !secretsMatch(secret, device.game_secret_hash)) {
    return { response: gameError("unauthorized") }
  }
  return { device: { id: device.id, user_id: device.user_id, pet_name: device.pet_name } }
}

// What a device shows for each failure. Short: the screen fits ~21 characters a line.
const ERRORS: Record<string, { status: number; message: string }> = {
  unauthorized: { status: 401, message: "Update your pet to play with friends" },
  rate_limited: { status: 429, message: "Slow down a moment" },
  invalid_game: { status: 400, message: "Unknown game" },
  invalid_bet: { status: 400, message: "Bets are Free, 10, 50, 100 or 500 sats" },
  invalid_score: { status: 400, message: "Invalid score" },
  invalid_result: { status: 400, message: "Invalid result" },
  invalid_request: { status: 400, message: "Invalid request" },
  insufficient_balance: { status: 402, message: "Not enough sats" },
  already_in_room: { status: 409, message: "Already in a room" },
  room_not_found: { status: 404, message: "Room not found" },
  room_closed: { status: 409, message: "Room is closed" },
  room_full: { status: 409, message: "Room is full" },
  not_in_room: { status: 409, message: "Not in this room" },
  not_host: { status: 403, message: "Only the host can start" },
  need_two_players: { status: 409, message: "Need 2 players" },
  game_in_progress: { status: 409, message: "Game in progress" },
  not_your_turn: { status: 409, message: "Not your turn" },
  turn_not_started: { status: 409, message: "Turn not started" },
  implausible_score: { status: 422, message: "Score not accepted" },
  turn_expired: { status: 409, message: "Time ran out" },
  device_not_found: { status: 404, message: "Pet not found" },
}

export function gameError(code: string): NextResponse {
  const e = ERRORS[code] || { status: 500, message: "Something went wrong" }
  return NextResponse.json({ success: false, error: code, message: e.message }, { status: e.status })
}

/** Call a game_room_* database function; map its exception to an error response. */
export async function callGameRpc(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<NextResponse> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    const code = Object.keys(ERRORS).find((k) => error.message === k || error.message?.includes(k))
    if (!code) console.error(`[game-rooms] ${fn} failed:`, error.message)
    return gameError(code || "server_error")
  }
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    const code = String((data as Record<string, unknown>).error)
    return NextResponse.json({ success: false, error: code, message: ERRORS[code]?.message || "Something went wrong", room: data }, { status: 409 })
  }
  return NextResponse.json({ success: true, room: data ?? null })
}

/** Normalise a MAC like aa:bb:cc:dd:ee:ff, or null. */
export function normaliseMac(v: unknown): string | null {
  if (typeof v !== "string") return null
  const m = v.trim().toUpperCase()
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(m) ? m : null
}
