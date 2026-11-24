/**
 * Read-only node telemetry for the daily summary: where the node balance can
 * move without any app activity (closing-fee reserve, routing fees, payment
 * fees, payments in flight) and what the node received since the last
 * reconciliation. Every call is a GET/read on LND; nothing here moves funds.
 */
import { lndRequest } from './lightning'

export interface NodeTelemetry {
  /** Start of the window: the last operator reconciliation (node_balance_adjustments) */
  since: string
  channels: {
    count: number
    /** Channels this node opened: it pays their closing fee */
    opened: number
    /** Sats held back to pay closing fees; moves with on-chain fee rates */
    closingFeeReserve: number
    /** Anchor outputs on channels this node opened (330 sats each, 2 per channel) */
    anchorReserve: number
    /** HTLCs in flight: on the node, not in the channel balance */
    inFlight: number
  }
  onchainUnconfirmed: number
  /** Fees earned forwarding other people's payments since `since` */
  routingFeesEarned: { sats: number; events: number }
  /** Fees the node paid on outgoing payments since `since` */
  paymentFeesPaid: { sats: number; payments: number; sent: number }
  /** Invoices the node was paid since `since` (deposits, L402, funding, orders) */
  invoicesSettled: { sats: number; count: number }
  /** Parts that could not be read (the rest is still valid) */
  errors: string[]
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '0'), 10)
  return Number.isFinite(n) ? n : 0
}

const ANCHOR_SATS = 330

export async function getNodeTelemetry(since: Date): Promise<NodeTelemetry> {
  const sinceUnix = Math.floor(since.getTime() / 1000)
  const nowUnix = Math.floor(Date.now() / 1000)
  const errors: string[] = []

  const [channelsRes, chanBalRes, chainRes, fwdRes, payRes, invRes] = await Promise.all([
    lndRequest('/v1/channels'),
    lndRequest('/v1/balance/channels'),
    lndRequest('/v1/balance/blockchain'),
    lndRequest('/v1/switch', 'POST', {
      start_time: String(sinceUnix),
      end_time: String(nowUnix),
      num_max_events: 50000,
    }),
    lndRequest(`/v1/payments?include_incomplete=false&max_payments=10000&creation_date_start=${sinceUnix}`),
    lndRequest(`/v1/invoices?num_max_invoices=10000&creation_date_start=${sinceUnix}`),
  ])

  const channels = { count: 0, opened: 0, closingFeeReserve: 0, anchorReserve: 0, inFlight: 0 }
  if (channelsRes.success) {
    for (const ch of channelsRes.data?.channels ?? []) {
      channels.count++
      if (ch.initiator) {
        channels.opened++
        channels.closingFeeReserve += num(ch.commit_fee)
        if (String(ch.commitment_type ?? '').includes('ANCHOR')) channels.anchorReserve += 2 * ANCHOR_SATS
      }
    }
  } else errors.push('channels')

  if (chanBalRes.success) {
    channels.inFlight = num(chanBalRes.data?.unsettled_local_balance?.sat)
  } else errors.push('channel balance')

  const onchainUnconfirmed = chainRes.success ? num(chainRes.data?.unconfirmed_balance) : (errors.push('on-chain'), 0)

  const routingFeesEarned = { sats: 0, events: 0 }
  if (fwdRes.success) {
    for (const ev of fwdRes.data?.forwarding_events ?? []) {
      routingFeesEarned.events++
      routingFeesEarned.sats += num(ev.fee)
    }
  } else errors.push('forwarding history')

  const paymentFeesPaid = { sats: 0, payments: 0, sent: 0 }
  if (payRes.success) {
    for (const p of payRes.data?.payments ?? []) {
      if (p.status !== 'SUCCEEDED') continue
      paymentFeesPaid.payments++
      paymentFeesPaid.sats += num(p.fee_sat)
      paymentFeesPaid.sent += num(p.value_sat)
    }
  } else errors.push('payments')

  const invoicesSettled = { sats: 0, count: 0 }
  if (invRes.success) {
    for (const inv of invRes.data?.invoices ?? []) {
      if (inv.state !== 'SETTLED' || num(inv.settle_date) < sinceUnix) continue
      invoicesSettled.count++
      invoicesSettled.sats += num(inv.amt_paid_sat)
    }
  } else errors.push('invoices')

  return {
    since: since.toISOString(),
    channels,
    onchainUnconfirmed,
    routingFeesEarned,
    paymentFeesPaid,
    invoicesSettled,
    errors,
  }
}
