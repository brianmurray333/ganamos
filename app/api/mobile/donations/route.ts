import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { checkInvoice, createInvoice } from "@/lib/lightning"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const amount = Number.parseInt(String(body.amount), 10)
    const locationType = String(body.locationType || "").trim()
    const locationName = String(body.locationName || "").trim()
    const donorName = body.donorName ? String(body.donorName).trim() : null
    const message = body.message ? String(body.message).trim() : null

    if (!Number.isFinite(amount) || amount < 100 || amount > 10_000_000) {
      return NextResponse.json({ success: false, error: "Donation must be between 100 and 10,000,000 sats." }, { status: 400 })
    }
    if (!locationType || !locationName || locationName.length > 160) {
      return NextResponse.json({ success: false, error: "Choose a valid donation location." }, { status: 400 })
    }

    const admin = createServerSupabaseClient({ supabaseKey: process.env.SUPABASE_SECRET_API_KEY })
    let { data: pool } = await admin
      .from("donation_pools")
      .select("id")
      .eq("location_type", locationType)
      .eq("location_name", locationName)
      .maybeSingle()

    if (!pool) {
      const created = await admin
        .from("donation_pools")
        .insert({ location_type: locationType, location_name: locationName, boost_percentage: 10 })
        .select("id")
        .single()
      if (created.error || !created.data) {
        return NextResponse.json({ success: false, error: "Could not create the donation pool." }, { status: 500 })
      }
      pool = created.data
    }

    const invoice = await createInvoice(amount, `Donation to ${locationName} (${amount} sats)`) as {
      success: boolean
      paymentRequest?: string
      rHash?: string | Uint8Array
      error?: string
    }
    if (!invoice.success || !invoice.paymentRequest || !invoice.rHash) {
      return NextResponse.json({ success: false, error: invoice.error || "Could not create a Lightning invoice." }, { status: 502 })
    }

    const paymentHash = typeof invoice.rHash === "string"
      ? invoice.rHash
      : Buffer.from(invoice.rHash as any).toString("hex")
    const inserted = await admin.from("donations").insert({
      donation_pool_id: pool.id,
      amount,
      payment_request: invoice.paymentRequest,
      payment_hash: paymentHash,
      status: "pending",
      donor_name: donorName,
      message,
    })
    if (inserted.error) {
      return NextResponse.json({ success: false, error: "Could not save the donation invoice." }, { status: 500 })
    }

    return NextResponse.json({ success: true, paymentRequest: invoice.paymentRequest, paymentHash, poolId: pool.id, amount })
  } catch (error) {
    console.error("Mobile donation creation failed", error)
    return NextResponse.json({ success: false, error: "Could not create the donation." }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const paymentHash = request.nextUrl.searchParams.get("payment_hash")?.trim()
  if (!paymentHash) {
    return NextResponse.json({ success: false, error: "payment_hash is required." }, { status: 400 })
  }

  try {
    const invoice = await checkInvoice(paymentHash) as {
      success: boolean
      settled?: boolean
      amountPaid?: number
      error?: string
    }
    if (!invoice.success) {
      return NextResponse.json({ success: false, settled: false, error: invoice.error || "Could not check payment." }, { status: 502 })
    }
    if (invoice.settled) {
      const admin = createServerSupabaseClient({ supabaseKey: process.env.SUPABASE_SECRET_API_KEY })
      const { data: donation } = await admin
        .from("donations")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("payment_hash", paymentHash)
        .eq("status", "pending")
        .select("donation_pool_id,amount")
        .maybeSingle()
      if (donation) {
        await admin.rpc("increment_donation_pool", { pool_id: donation.donation_pool_id, amount: donation.amount })
      }
    }
    return NextResponse.json({ success: true, settled: Boolean(invoice.settled), amountPaid: invoice.amountPaid || 0 })
  } catch (error) {
    console.error("Mobile donation status failed", error)
    return NextResponse.json({ success: false, settled: false, error: "Could not check payment." }, { status: 500 })
  }
}
