import { NextRequest } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { authenticateGameDevice, callGameRpc, gameError, isUuid, normaliseMac } from "@/lib/game-rooms"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ roomId: string }> }

/**
 * GET /api/game/rooms/:roomId — room state for this device (polled).
 * Never includes other players' device or account ids.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  if (!isUuid(roomId)) return gameError("room_not_found")
  const supabase = createServerSupabaseClient()
  const auth = await authenticateGameDevice(request, supabase)
  if ("response" in auth) return auth.response
  return callGameRpc(supabase, "game_room_state", { p_room: roomId, p_device: auth.device.id })
}

/**
 * POST /api/game/rooms/:roomId  { action, ... }
 *   join   { mac? }                 bet is held when you join
 *   leave                           before the start: bet returned (host leaving closes the room)
 *   start                           host only, 2+ players
 *   turn_begin                      Flappy / Sat Catcher: your turn's run starts now
 *   turn_submit { score }           Flappy / Sat Catcher: your run's score
 *   report { winner, left, right }  Pickleball: the result your pet saw
 *   abandon                         Pickleball: the match didn't finish; every bet goes back
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  if (!isUuid(roomId)) return gameError("room_not_found")
  const supabase = createServerSupabaseClient()
  const auth = await authenticateGameDevice(request, supabase)
  if ("response" in auth) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return gameError("invalid_request")
  }
  const base = { p_room: roomId, p_device: auth.device.id }

  switch (body.action) {
    case "join":
      return callGameRpc(supabase, "game_room_join", { ...base, p_mac: normaliseMac(body.mac) })
    case "leave":
      return callGameRpc(supabase, "game_room_leave", base)
    case "start":
      return callGameRpc(supabase, "game_room_start", base)
    case "turn_begin":
      return callGameRpc(supabase, "game_room_turn_begin", base)
    case "turn_submit": {
      const score = body.score
      if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100000) {
        return gameError("invalid_score")
      }
      return callGameRpc(supabase, "game_room_turn_submit", { ...base, p_score: score })
    }
    case "report": {
      const { winner, left, right } = body
      if ((winner !== "left" && winner !== "right") || !Number.isInteger(left) || !Number.isInteger(right)) {
        return gameError("invalid_result")
      }
      return callGameRpc(supabase, "game_room_report", { ...base, p_winner: winner, p_left: left, p_right: right })
    }
    case "abandon":
      return callGameRpc(supabase, "game_room_abandon", base)
    default:
      return gameError("invalid_request")
  }
}
