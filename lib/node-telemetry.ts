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
const PAGE_SIZE = 1000
const MAX_PAGES = 50
const INVOICE_LOOKBACK_SECONDS = 30 * 86400

/**
 * Reads every page of an LND list call, following its offset. `truncated` is
 * set if MAX_PAGES was reached before the list ran out.
 */
async function paginate(
  fetchPage: (offset: number) => Promise<{ success: boolean; data?: any }>,
  itemsOf: (data: any) => any[] | undefined,
  nextOffsetOf: (data: any) => number,
): Promise<{ ok: boolean; items: any[]; truncated: boolean }> {
  const items: any[] = []
  let offset = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchPage(offset)
    if (!res.success) return { ok: false, items, truncated: false }
    const batch = itemsOf(res.data) ?? []
    items.push(...batch)
    const next = nextOffsetOf(res.data)
    if (batch.length < PAGE_SIZE || !next || next <= offset) return { ok: true, items, truncated: false }
    offset = next
  }
  return { ok: true, items, truncated: true }
}

export async function getNodeTelemetry(since: Date): Promise<NodeTelemetry> {
  const sinceUnix = Math.floor(since.getTime() / 1000)
  const nowUnix = Math.floor(Date.now() / 1000)
  const errors: string[] = []

  const [channelsRes, chanBalRes, chainRes, forwards, payments, invoices] = await Promise.all([
    lndRequest('/v1/channels'),
    lndRequest('/v1/balance/channels'),
    lndRequest('/v1/balance/blockchain'),
    paginate(
      (offset) => lndRequest('/v1/switch', 'POST', {
        start_time: String(sinceUnix),
        end_time: String(nowUnix),
        index_offset: offset,
        num_max_events: PAGE_SIZE,
      }),
      (d) => d?.forwarding_events,
      (d) => num(d?.last_offset_index),
    ),
    paginate(
      (offset) => lndRequest(`/v1/payments?include_incomplete=false&index_offset=${offset}&max_payments=${PAGE_SIZE}&creation_date_start=${sinceUnix}`),
      (d) => d?.payments,
      (d) => num(d?.last_index_offset),
    ),
    // Invoices are filtered by creation time on the node, so look back far
    // enough to catch any invoice created before the window that settled in it
    // (they expire well within this), then keep only those settled in the window.
    paginate(
      (offset) => lndRequest(`/v1/invoices?index_offset=${offset}&num_max_invoices=${PAGE_SIZE}&creation_date_start=${sinceUnix - INVOICE_LOOKBACK_SECONDS}`),
      (d) => d?.invoices,
      (d) => num(d?.last_index_offset),
    ),
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

  // Sum in millisatoshis and convert once: per-forward fees can be fractions of a sat
  const routingFeesEarned = { sats: 0, events: 0 }
  if (forwards.ok) {
    let feeMsat = 0
    for (const ev of forwards.items) {
      routingFeesEarned.events++
      feeMsat += ev.fee_msat !== undefined ? num(ev.fee_msat) : num(ev.fee) * 1000
    }
    routingFeesEarned.sats = Math.floor(feeMsat / 1000)
  }
  if (!forwards.ok || forwards.truncated) errors.push(forwards.ok ? 'forwarding history (partial)' : 'forwarding history')

  const paymentFeesPaid = { sats: 0, payments: 0, sent: 0 }
  if (payments.ok) {
    for (const p of payments.items) {
      if (p.status !== 'SUCCEEDED') continue
      paymentFeesPaid.payments++
      paymentFeesPaid.sats += num(p.fee_sat)
      paymentFeesPaid.sent += num(p.value_sat)
    }
  }
  if (!payments.ok || payments.truncated) errors.push(payments.ok ? 'payments (partial)' : 'payments')

  const invoicesSettled = { sats: 0, count: 0 }
  if (invoices.ok) {
    for (const inv of invoices.items) {
      if (inv.state !== 'SETTLED' || num(inv.settle_date) < sinceUnix) continue
      invoicesSettled.count++
      invoicesSettled.sats += num(inv.amt_paid_sat)
    }
  }
  if (!invoices.ok || invoices.truncated) errors.push(invoices.ok ? 'invoices (partial)' : 'invoices')

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
