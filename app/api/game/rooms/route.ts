import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import {
  authenticateGameDevice,
  callGameRpc,
  gameError,
  isGameType,
  normaliseMac,
  BET_SIZES,
} from "@/lib/game-rooms"

export const dynamic = "force-dynamic"

/**
 * GET /api/game/rooms?game=flappy
 * Open rooms this device may join (family and shared Ganamos groups), the
 * device's spendable balance, and the room it is already in, if any.
 * Headers: X-Device-Id, X-Device-Secret.
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const auth = await authenticateGameDevice(request, supabase)
  if ("response" in auth) return auth.response

  const game = request.nextUrl.searchParams.get("game")
  if (game !== null && !isGameType(game)) return gameError("invalid_game")

  const [list, current] = await Promise.all([
    supabase.rpc("game_room_list", { p_device: auth.device.id, p_game: game }),
    supabase.rpc("game_room_current", { p_device: auth.device.id }),
  ])
  if (list.error || current.error) {
    console.error("[game-rooms] list failed:", list.error?.message || current.error?.message)
    return gameError("server_error")
  }
  return NextResponse.json({ success: true, ...list.data, current: current.data ?? null })
}

/**
 * POST /api/game/rooms  { game, bet, mac? }
 * Open a room as host. A bet is held from the host's balance right away.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const auth = await authenticateGameDevice(request, supabase)
  if ("response" in auth) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return gameError("invalid_request")
  }
  const { game, bet } = body
  if (!isGameType(game)) return gameError("invalid_game")
  if (typeof bet !== "number" || !(BET_SIZES as readonly number[]).includes(bet)) return gameError("invalid_bet")
  const mac = normaliseMac(body.mac)
  if (game === "pickleball" && !mac) return gameError("invalid_request")

  return callGameRpc(supabase, "game_room_create", {
    p_device: auth.device.id,
    p_game: game,
    p_bet: bet,
    p_mac: mac,
  })
}
