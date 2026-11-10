import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkRateLimit } from "@/lib/rate-limiter"
import { v4 as uuidv4 } from "uuid"
import { createHash } from "crypto"

export const dynamic = "force-dynamic"

/**
 * POST /api/game/pickleball/complete
 * Called by host device when game finishes to record results and settle wagers.
 * 
 * Body: { gameId, deviceId, scoreLeft, scoreRight, winnerSide }
 * Returns: { success, wagerSettled?, payouts[]? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { gameId, deviceId, scoreLeft, scoreRight, winnerSide } = body

    if (!gameId || !deviceId) {
      return NextResponse.json(
        { success: false, error: "gameId and deviceId required" },
        { status: 400 }
      )
    }

    if (winnerSide !== "left" && winnerSide !== "right") {
      return NextResponse.json(
        { success: false, error: "winnerSide must be 'left' or 'right'" },
        { status: 400 }
      )
    }

    const rateLimit = checkRateLimit(`pickleball-complete-${deviceId}`, {
      maxRequests: 5,
      windowMs: 60 * 1000,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded" },
        { status: 429 }
      )
    }

    const supabase = createServerSupabaseClient()

    const { data: game, error: gameError } = await supabase
      .from("pickleball_games")
      .select("*")
      .eq("id", gameId)
      .eq("host_device_id", deviceId)
      .single()

    if (gameError || !game) {
      return NextResponse.json(
        { success: false, error: "Game not found or not host" },
        { status: 404 }
      )
    }

    const players = (game.players as any[]) || []
    const wagerAmount = Number(game.wager_amount || 0)

    // A completed game whose wager isn't settled yet (a transfer failed last
    // time) resumes settlement with the STORED result; otherwise it's done.
    if (game.status === "completed") {
      if (game.wager_status === "active" && wagerAmount > 0 && (game.winner_side === "left" || game.winner_side === "right")) {
        const settlement = await settleWager(supabase, game, players, wagerAmount, game.winner_side, game.score_left ?? 0, game.score_right ?? 0)
        return NextResponse.json({ success: true, alreadyCompleted: true, ...settlement })
      }
      return NextResponse.json({
        success: true,
        alreadyCompleted: true,
      })
    }

    // Claim the completion atomically, recording the result in the same
    // update: only one request completes a game. A wager stays 'active'
    // until every transfer has gone through, so failures can be retried.
    const wasPlayed = game.status === "playing"
    const hasWager = wasPlayed && wagerAmount > 0 && game.wager_status === "active"
    const nowIso = new Date().toISOString()
    const { data: claimedGame } = await supabase
      .from("pickleball_games")
      .update({
        status: "completed",
        score_left: scoreLeft || 0,
        score_right: scoreRight || 0,
        winner_side: winnerSide,
        completed_at: nowIso,
        updated_at: nowIso,
        // A wager is only settled for a game that was actually played
        ...(hasWager ? {} : { wager_status: "none" }),
      })
      .eq("id", gameId)
      .eq("host_device_id", deviceId)
      .eq("status", game.status)
      .neq("status", "completed")
      .select("id")
    if (!claimedGame?.length) {
      return NextResponse.json({ success: true, alreadyCompleted: true })
    }

    let settlement: { wagerSettled: boolean; payouts?: Array<{ userId: string; petName: string; amount: number }> } = { wagerSettled: false }
    if (hasWager) {
      settlement = await settleWager(supabase, game, players, wagerAmount, winnerSide, scoreLeft || 0, scoreRight || 0)
    }

    console.log(`[Pickleball] Game ${gameId} completed. Score: L${scoreLeft}-R${scoreRight}. Winner: ${winnerSide}`)

    return NextResponse.json({
      success: true,
      scoreLeft,
      scoreRight,
      winnerSide,
      wagerSettled: settlement.wagerSettled,
      payouts: settlement.payouts,
    })
  } catch (error) {
    console.error("[Pickleball] Complete error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

/** Stable UUID (v5-style) so each wager transfer has fixed ledger ids. */
function stableUuid(name: string): string {
  const h = createHash("sha1").update(`ganamos-pickleball:${name}`).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString("hex")
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

/**
 * Move each loser's stake to the winners, idempotently: every loser→winner
 * transfer has deterministic ledger ids, so a retry skips transfers that
 * already completed and can never pay one twice. Only when all transfers are
 * done is the wager marked settled (compare-and-swap) and activities written.
 */
async function settleWager(
  supabase: any,
  game: any,
  players: any[],
  wagerAmount: number,
  winnerSide: "left" | "right",
  scoreLeft: number,
  scoreRight: number,
): Promise<{ wagerSettled: boolean; payouts?: Array<{ userId: string; petName: string; amount: number }> }> {
  const gameId = game.id
  const loserSide = winnerSide === "left" ? "right" : "left"
  // Never settle a wager for implicit/undefined consent.
  const winners = players.filter((p: any) => p.side === winnerSide && p.wagerAccepted === true)
  const losers = players.filter((p: any) => p.side === loserSide && p.wagerAccepted === true)

  if (winners.length === 0 || losers.length === 0) {
    await supabase.from("pickleball_games").update({ wager_status: "none", updated_at: new Date().toISOString() })
      .eq("id", gameId).eq("wager_status", "active")
    return { wagerSettled: false }
  }

  const payoutPerWinner = Math.floor((wagerAmount * losers.length) / winners.length)
  const amountPerLoserPerWinner = Math.floor(wagerAmount / winners.length)
  const generation = Number(game.match_generation || 0)
  let allTransfersOk = true

  for (const loser of losers) {
    for (const winner of winners) {
      if (loser.userId === winner.userId || amountPerLoserPerWinner <= 0) continue

      const key = `${gameId}:${generation}:${loser.userId}:${winner.userId}`
      const senderTxId = stableUuid(`${key}:sender`)
      const receiverTxId = stableUuid(`${key}:receiver`)

      const { data: existing } = await supabase.from("transactions").select("id, status").eq("id", senderTxId).maybeSingle()
      if (existing?.status === "completed") continue // already transferred

      if (!existing) {
        const { error: insertError } = await supabase.from("transactions").insert([
          { id: senderTxId, user_id: loser.userId, type: "internal", amount: -amountPerLoserPerWinner, status: "pending", memo: "Pickleball wager lost" },
          { id: receiverTxId, user_id: winner.userId, type: "internal", amount: amountPerLoserPerWinner, status: "pending", memo: "Pickleball wager won" },
        ])
        if (insertError) {
          // Another request is settling this transfer right now
          allTransfersOk = false
          continue
        }
      }

      const { data: transferResult, error: transferError } = await supabase.rpc("atomic_transfer", {
        p_sender_id: loser.userId,
        p_receiver_id: winner.userId,
        p_amount: amountPerLoserPerWinner,
        p_sender_tx_id: senderTxId,
        p_receiver_tx_id: receiverTxId,
      })

      if (transferError || !transferResult?.success) {
        console.error(`[Pickleball] Transfer failed: ${loser.userId} → ${winner.userId}:`, transferError || transferResult)
        allTransfersOk = false
        // Remove our pending rows so a retry can try this transfer again
        await supabase.from("transactions").delete().in("id", [senderTxId, receiverTxId]).eq("status", "pending")
      }
    }
  }

  if (!allTransfersOk) {
    console.error(`[Pickleball] Wager settlement incomplete for game ${gameId}; it will resume on the next completion call`)
    return { wagerSettled: false }
  }

  // Exactly one request marks the wager settled and writes the activities.
  const nowIso = new Date().toISOString()
  const { data: settled } = await supabase
    .from("pickleball_games")
    .update({ wager_status: "settled", updated_at: nowIso })
    .eq("id", gameId)
    .eq("wager_status", "active")
    .select("id")
  if (!settled?.length) return { wagerSettled: true }

  const payouts: Array<{ userId: string; petName: string; amount: number }> = []
  const activities: any[] = []
  for (const winner of winners) {
    activities.push({
      id: uuidv4(), user_id: winner.userId, type: "pickleball_wager", related_id: gameId,
      related_table: "pickleball_games", timestamp: nowIso,
      metadata: { amount: payoutPerWinner, result: "won", wagerAmount, scoreLeft, scoreRight },
    })
    payouts.push({ userId: winner.userId, petName: winner.petName, amount: payoutPerWinner })
  }
  for (const loser of losers) {
    activities.push({
      id: uuidv4(), user_id: loser.userId, type: "pickleball_wager", related_id: gameId,
      related_table: "pickleball_games", timestamp: nowIso,
      metadata: { amount: -wagerAmount, result: "lost", wagerAmount, scoreLeft, scoreRight },
    })
    payouts.push({ userId: loser.userId, petName: loser.petName, amount: -wagerAmount })
  }
  await supabase.from("activities").insert(activities)

  console.log(`[Pickleball] Wager settled for game ${gameId}. ${winners.length} winners got ${payoutPerWinner} sats each.`)
  return { wagerSettled: true, payouts }
}
