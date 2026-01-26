/**
 * Check routing fees earned by the LND node
 * Run with: npx tsx scripts/check-routing-fees.ts
 */

import 'dotenv/config'

async function lndRequest(endpoint: string) {
  const LND_REST_URL = process.env.LND_REST_URL
  const LND_ADMIN_MACAROON = process.env.LND_ADMIN_MACAROON

  if (!LND_REST_URL || !LND_ADMIN_MACAROON) {
    throw new Error("LND_REST_URL and LND_ADMIN_MACAROON must be set")
  }

  let baseUrl = LND_REST_URL
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    baseUrl = `https://${baseUrl}`
  }
  baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl

  const url = `${baseUrl}${endpoint}`
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Grpc-Metadata-macaroon": LND_ADMIN_MACAROON,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LND request failed: ${response.status} - ${text}`)
  }

  return response.json()
}

async function main() {
  console.log("🔍 Checking LND routing fees...\n")

  try {
    // Get fee report (total fees earned)
    console.log("📊 Fee Report:")
    const feeReport = await lndRequest("/v1/fees")
    console.log(`   Day fees:   ${feeReport.day_fee_sum || 0} sats`)
    console.log(`   Week fees:  ${feeReport.week_fee_sum || 0} sats`)
    console.log(`   Month fees: ${feeReport.month_fee_sum || 0} sats`)
    console.log("")

    // Note: Forwarding history endpoint may not be available on all LND configurations
    console.log("⚡ Forwarding history: (skipped - may not be available on Voltage)")
    console.log("   Fee report above shows routing fees are 0 sats")

    // Get channel balances for reference
    console.log("\n💰 Current Balances:")
    const channelBalance = await lndRequest("/v1/balance/channels")
    const walletBalance = await lndRequest("/v1/balance/blockchain")
    
    console.log(`   Channel balance: ${channelBalance.balance || 0} sats`)
    console.log(`   Pending open:    ${channelBalance.pending_open_balance || 0} sats`)
    console.log(`   On-chain:        ${walletBalance.confirmed_balance || 0} sats`)
    console.log(`   ───────────────────────────────────────────────────`)
    
    const total = parseInt(channelBalance.balance || "0") + 
                  parseInt(channelBalance.pending_open_balance || "0") + 
                  parseInt(walletBalance.confirmed_balance || "0")
    console.log(`   TOTAL NODE:      ${total} sats`)

  } catch (error) {
    console.error("❌ Error:", error)
    process.exit(1)
  }
}

main()

