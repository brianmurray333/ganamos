import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkRateLimit } from "@/lib/rate-limiter"
import { v4 as uuidv4 } from "uuid"

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

    if (game.status === "completed") {
      return NextResponse.json({
        success: true,
        alreadyCompleted: true,
      })
    }

    // Record final results
    const gameUpdate: Record<string, any> = {
      status: "completed",
      score_left: scoreLeft || 0,
      score_right: scoreRight || 0,
      winner_side: winnerSide,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const players = (game.players as any[]) || []
    const wagerAmount = game.wager_amount || 0
    const wagerStatus = game.wager_status || "none"
    let wagerSettled = false
    const payouts: Array<{ userId: string; petName: string; amount: number }> = []

    // Settle wager if active
    if (wagerAmount > 0 && wagerStatus === "active") {
      const loserSide = winnerSide === "left" ? "right" : "left"
      const winners = players.filter((p: any) => p.side === winnerSide && p.wagerAccepted !== false)
      const losers = players.filter((p: any) => p.side === loserSide && p.wagerAccepted !== false)

      if (winners.length > 0 && losers.length > 0) {
        const payoutPerWinner = Math.floor((wagerAmount * losers.length) / winners.length)

        // Distribute: pair each loser with winners proportionally
        // Each loser pays wagerAmount total, split across winners
        const amountPerLoserPerWinner = Math.floor(wagerAmount / winners.length)

        let allTransfersOk = true

        for (const loser of losers) {
          for (const winner of winners) {
            if (loser.userId === winner.userId) continue

            const transferAmount = amountPerLoserPerWinner
            if (transferAmount <= 0) continue

            const senderTxId = uuidv4()
            const receiverTxId = uuidv4()
            const now = new Date().toISOString()

            // Create pending transactions
            await supabase.from("transactions").insert({
              id: senderTxId,
              user_id: loser.userId,
              type: "internal",
              amount: -transferAmount,
              status: "pending",
              memo: `Pickleball wager lost`,
            })

            await supabase.from("transactions").insert({
              id: receiverTxId,
              user_id: winner.userId,
              type: "internal",
              amount: transferAmount,
              status: "pending",
              memo: `Pickleball wager won`,
            })

            // Execute atomic transfer
            const { data: transferResult, error: transferError } = await supabase.rpc(
              "atomic_transfer",
              {
                p_sender_id: loser.userId,
                p_receiver_id: winner.userId,
                p_amount: transferAmount,
                p_sender_tx_id: senderTxId,
                p_receiver_tx_id: receiverTxId,
              }
            )

            if (transferError || !transferResult?.success) {
              console.error(`[Pickleball] Transfer failed: ${loser.userId} → ${winner.userId}:`, transferError || transferResult)
              allTransfersOk = false
              // Mark failed transactions
              await supabase
                .from("transactions")
                .update({ status: "failed", updated_at: now })
                .in("id", [senderTxId, receiverTxId])
            }
          }
        }

        if (allTransfersOk) {
          // Create activity records
          const activities = []
          const now = new Date().toISOString()

          for (const winner of winners) {
            activities.push({
              id: uuidv4(),
              user_id: winner.userId,
              type: "pickleball_wager",
              related_id: gameId,
              related_table: "pickleball_games",
              timestamp: now,
              metadata: {
                amount: payoutPerWinner,
                result: "won",
                wagerAmount,
                scoreLeft: scoreLeft || 0,
                scoreRight: scoreRight || 0,
              },
            })
            payouts.push({ userId: winner.userId, petName: winner.petName, amount: payoutPerWinner })
          }

          for (const loser of losers) {
            activities.push({
              id: uuidv4(),
              user_id: loser.userId,
              type: "pickleball_wager",
              related_id: gameId,
              related_table: "pickleball_games",
              timestamp: now,
              metadata: {
                amount: -wagerAmount,
                result: "lost",
                wagerAmount,
                scoreLeft: scoreLeft || 0,
                scoreRight: scoreRight || 0,
              },
            })
            payouts.push({ userId: loser.userId, petName: loser.petName, amount: -wagerAmount })
          }

          await supabase.from("activities").insert(activities)

          gameUpdate.wager_status = "settled"
          wagerSettled = true

          console.log(`[Pickleball] Wager settled for game ${gameId}. ${winners.length} winners got ${payoutPerWinner} sats each.`)
        } else {
          console.error(`[Pickleball] Wager settlement had failures for game ${gameId}`)
        }
      }
    }

    await supabase
      .from("pickleball_games")
      .update(gameUpdate)
      .eq("id", gameId)

    console.log(`[Pickleball] Game ${gameId} completed. Score: L${scoreLeft}-R${scoreRight}. Winner: ${winnerSide}`)

    return NextResponse.json({
      success: true,
      scoreLeft,
      scoreRight,
      winnerSide,
      wagerSettled,
      payouts: payouts.length > 0 ? payouts : undefined,
    })
  } catch (error) {
    console.error("[Pickleball] Complete error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
