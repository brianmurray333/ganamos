"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Cat, CheckCircle2, Clock, Package, Mail, ArrowRight, Loader2, Copy, Check, Wallet } from "lucide-react"
import { toast } from "@/components/ui/toast"
import QRCode from "@/components/qr-code"
import {
  getOrderByNumber,
  checkOrderPaymentStatus,
  renewPetOrderInvoice,
  type FullOrderView,
  type PublicOrderView,
} from "@/app/actions/pet-order-actions"
import { preorderShipEstimateText, SUPPORT_EMAIL } from "@/lib/pet-order-constants"

const POLL_INTERVAL_MS = 4000

type OrderData = PublicOrderView | FullOrderView

function isFull(order: OrderData): order is FullOrderView {
  return "fullName" in order
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

const cardClass = "bg-gray-800 border-gray-700 text-white shadow-lg"

export default function OrderView({ orderNumber, accessToken }: { orderNumber: string; accessToken: string | null }) {
  const [order, setOrder] = useState<OrderData | null>(null)
  const [hasAccess, setHasAccess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadOrder = useCallback(async () => {
    try {
      const result = await getOrderByNumber(orderNumber, accessToken)
      if (result.success && result.order) {
        setOrder(result.order)
        setHasAccess(!!result.hasAccess)
        setError(null)
      } else {
        setError(result.error || "Order not found")
      }
    } catch {
      setError("Failed to load order")
    } finally {
      setIsLoading(false)
    }
  }, [orderNumber, accessToken])

  useEffect(() => {
    loadOrder()
  }, [loadOrder])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400 mx-auto mb-4" aria-hidden="true" />
          <p className="text-gray-300">Loading order details...</p>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <Card className={`max-w-md w-full ${cardClass}`}>
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="h-8 w-8 text-red-400" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold mb-2">Order Not Found</h1>
            <p className="text-gray-300 mb-6">{error || "We couldn't find this order."}</p>
            <Button asChild>
              <a href="/">Return to Satoshi Pet</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isPaid = order.paymentStatus === "paid"
  const isExpired = order.paymentStatus === "expired"
  const full = hasAccess && isFull(order) ? order : null
  const canPay = !!full && !isPaid && (order.paymentStatus === "pending" || isExpired) && !!full.paymentRequest

  const statusLabel = isPaid
    ? order.orderStatus === "shipped" ? "Shipped"
      : order.orderStatus === "delivered" ? "Delivered"
      : order.orderStatus === "cancelled" ? "Cancelled"
      : "Confirmed"
    : isExpired ? "Invoice expired"
    : order.paymentStatus === "pending" ? "Awaiting payment"
    : "Not paid"

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center">
          <a href="/" className="flex items-center gap-2">
            <span className="w-8 h-8 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center" aria-hidden="true">
              <Cat size={18} color="white" strokeWidth={2} />
            </span>
            <span className="font-bold text-lg">Satoshi Pet</span>
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          {isPaid ? (
            <div className="w-20 h-20 bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-400" aria-hidden="true" />
            </div>
          ) : (
            <div className="w-20 h-20 bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="h-10 w-10 text-amber-400" aria-hidden="true" />
            </div>
          )}
          <h1 className="text-3xl font-bold mb-2">
            {isPaid ? "Order Confirmed!" : canPay ? "Complete Your Payment" : statusLabel}
          </h1>
          <p className="text-gray-300">
            {isPaid
              ? order.isPreorder
                ? "Thank you for your pre-order! We're excited to ship your Satoshi Pet."
                : "Thank you for your order! We're excited to ship your Satoshi Pet."
              : canPay
                ? "Pay the Lightning invoice below to confirm your order."
                : "This order hasn't been paid yet."}
          </p>
        </div>

        {canPay && full && (
          <PaymentPanel
            orderNumber={order.orderNumber}
            accessToken={accessToken!}
            email={full.email}
            totalSats={order.totalPriceSats}
            initialPaymentRequest={full.paymentRequest!}
            initialPaymentHash={full.paymentHash!}
            initialExpiresAt={full.invoiceExpiresAt!}
            initiallyExpired={isExpired}
            onPaid={loadOrder}
          />
        )}

        <Card className={`${cardClass} mb-8`}>
          <CardContent className="p-6 sm:p-8">
            <div className="text-center pb-6 border-b border-gray-700">
              <p className="text-sm text-gray-400 mb-1">Order Number</p>
              <p className="text-2xl font-mono font-bold text-green-400">{order.orderNumber}</p>
            </div>

            <dl className="grid sm:grid-cols-2 gap-6 py-6 border-b border-gray-700">
              <div>
                <dt className="text-sm text-gray-400 mb-1">Status</dt>
                <dd>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    isPaid ? "bg-green-900/50 text-green-300" : "bg-amber-900/50 text-amber-300"
                  }`}>
                    {statusLabel}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-400 mb-1">Total</dt>
                <dd className="font-semibold">{order.totalPriceSats.toLocaleString()} sats</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-400 mb-1">Ordered</dt>
                <dd className="font-semibold">{new Date(order.createdAt).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-400 mb-1">Email</dt>
                <dd className="font-semibold break-all">{full ? full.email : order.maskedEmail}</dd>
              </div>
              {order.isPreorder && (
                <div className="sm:col-span-2">
                  <dt className="text-sm text-gray-400 mb-1">Shipping date</dt>
                  <dd className="font-semibold">{preorderShipEstimateText()}</dd>
                </div>
              )}
              {full?.trackingNumber && (
                <div className="sm:col-span-2">
                  <dt className="text-sm text-gray-400 mb-1">Tracking number</dt>
                  <dd className="font-semibold font-mono">{full.trackingNumber}</dd>
                </div>
              )}
            </dl>

            <div className="py-6">
              <p className="text-sm text-gray-400 mb-2">Shipping To</p>
              <div className="bg-gray-900/60 rounded-lg p-4 text-gray-200">
                {full ? (
                  <>
                    <p className="font-medium text-white">{full.fullName}</p>
                    <p>{full.shippingAddress.line1}</p>
                    {full.shippingAddress.line2 && <p>{full.shippingAddress.line2}</p>}
                    <p>
                      {full.shippingAddress.city}, {full.shippingAddress.state} {full.shippingAddress.postalCode}
                    </p>
                    <p>United States</p>
                  </>
                ) : (
                  <>
                    <p>{order.city}, {order.state}</p>
                    <p className="text-sm text-gray-400 mt-2">
                      To see full order details, open the link from your checkout page or confirmation email.
                    </p>
                  </>
                )}
              </div>
            </div>

            {isPaid && full && (
              <div className="flex items-start gap-3 bg-blue-900/30 rounded-lg p-4">
                <Mail className="h-5 w-5 text-blue-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-medium text-blue-200">Confirmation email sent</p>
                  <p className="text-sm text-blue-300">
                    We've sent order details to {full.email}. Check your inbox!
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {isPaid && (
          <Card className={`${cardClass} mb-8`}>
            <CardContent className="p-6 sm:p-8">
              <h2 className="font-bold text-lg mb-4">What's Next?</h2>
              <ol className="space-y-4">
                {[
                  ["Create your Ganamos account", "Sign up at ganamos.earth to manage your Bitcoin and connect with your pet."],
                  ["We'll ship your Satoshi Pet", "You'll receive a shipping confirmation with tracking info."],
                  ["Connect & enjoy!", "Follow our setup guide to pair your device and start earning."],
                ].map(([title, text], i) => (
                  <li key={title} className="flex gap-4">
                    <span className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm text-green-300" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{title}</p>
                      <p className="text-sm text-gray-400">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          {isPaid && (
            <Button asChild size="lg" className="sm:flex-1 h-14 bg-green-600 hover:bg-green-700 text-white">
              <a href="https://ganamos.earth/auth/register">
                Create Account
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="lg" className="sm:flex-1 h-14 bg-gray-800 border-gray-600 text-white hover:bg-gray-700">
            <a href="/satoshi-pet/setup">View Setup Guide</a>
          </Button>
          <Button asChild variant="outline" size="lg" className="sm:flex-1 h-14 bg-gray-800 border-gray-600 text-white hover:bg-gray-700">
            <a href="/">Return to Satoshi Pet</a>
          </Button>
        </div>

        <p className="text-center text-sm text-gray-400 mt-8">
          Questions? Contact us at <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-300 hover:underline">{SUPPORT_EMAIL}</a>
        </p>
      </main>
    </div>
  )
}

function PaymentPanel(props: {
  orderNumber: string
  accessToken: string
  email: string
  totalSats: number
  initialPaymentRequest: string
  initialPaymentHash: string
  initialExpiresAt: string
  initiallyExpired: boolean
  onPaid: () => void
}) {
  const { orderNumber, accessToken, email, totalSats, onPaid } = props
  const [paymentRequest, setPaymentRequest] = useState(props.initialPaymentRequest)
  const [paymentHash, setPaymentHash] = useState(props.initialPaymentHash)
  const [expiresAt, setExpiresAt] = useState(() => new Date(props.initialExpiresAt).getTime())
  const [expired, setExpired] = useState(props.initiallyExpired || Date.now() >= new Date(props.initialExpiresAt).getTime())
  const [now, setNow] = useState(() => Date.now())
  const [renewing, setRenewing] = useState(false)
  const [copied, setCopied] = useState(false)
  const onPaidRef = useRef(onPaid)
  onPaidRef.current = onPaid

  // Countdown
  useEffect(() => {
    if (expired) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= expiresAt) setExpired(true)
    }, 1000)
    return () => clearInterval(id)
  }, [expired, expiresAt])

  // Poll with a setTimeout chain (never overlapping). Stops on paid, expiry and
  // while the tab is hidden; resumes when it becomes visible again.
  useEffect(() => {
    if (expired) return
    let cancelled = false
    let inFlight = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      if (cancelled || inFlight) return
      if (typeof document !== "undefined" && document.hidden) return
      if (Date.now() >= expiresAt) {
        setExpired(true)
        return
      }
      inFlight = true
      try {
        const result = await checkOrderPaymentStatus(paymentHash)
        if (cancelled) return
        if (result.success && result.paid) {
          toast.success("Payment Received!", { description: "Your order has been confirmed" })
          onPaidRef.current()
          return
        }
        if (result.success && result.expired) {
          setExpired(true)
          return
        }
      } catch (err) {
        console.error("Error checking payment:", err)
      } finally {
        inFlight = false
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS)
    }

    const onVisibility = () => {
      if (!document.hidden && !cancelled && !inFlight) {
        clearTimeout(timer)
        tick()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [paymentHash, expiresAt, expired])

  const copyInvoice = async () => {
    try {
      await navigator.clipboard.writeText(paymentRequest)
      setCopied(true)
      toast.success("Copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy")
    }
  }

  const renew = async () => {
    setRenewing(true)
    try {
      const result = await renewPetOrderInvoice(orderNumber, accessToken)
      if (result.success && result.paid) {
        onPaidRef.current()
      } else if (result.success && result.paymentRequest && result.paymentHash && result.invoiceExpiresAt) {
        setPaymentRequest(result.paymentRequest)
        setPaymentHash(result.paymentHash)
        setExpiresAt(new Date(result.invoiceExpiresAt).getTime())
        setNow(Date.now())
        setExpired(false)
      } else {
        toast.error("Couldn't create a new invoice", { description: result.error })
      }
    } catch {
      toast.error("Couldn't create a new invoice")
    } finally {
      setRenewing(false)
    }
  }

  const lightningUri = `lightning:${paymentRequest}`

  return (
    <Card className={`${cardClass} mb-8`}>
      <CardContent className="p-6 sm:p-8 text-center">
        <p className="text-gray-300 mb-1">Order #{orderNumber}</p>
        <p className="text-2xl font-bold mb-6">{totalSats.toLocaleString()} sats</p>

        {expired ? (
          <div className="mb-2">
            <p className="text-amber-300 font-medium mb-2">This invoice has expired.</p>
            <p className="text-sm text-gray-300 mb-6">
              No payment was received for it. You can get a new invoice for the same order and amount.
            </p>
            <Button className="w-full h-12 bg-green-600 hover:bg-green-700 text-white" onClick={renew} disabled={renewing}>
              {renewing ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" /> : null}
              Create new invoice
            </Button>
          </div>
        ) : (
          <>
            <a href={lightningUri} className="bg-white p-4 rounded-xl inline-block mb-4" aria-label="Open invoice in your Lightning wallet">
              <QRCode data={paymentRequest} size={240} />
            </a>

            <div className="flex items-center justify-center gap-2 text-amber-300 mb-1" role="status">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span className="text-sm">Waiting for payment...</span>
            </div>
            <p className="text-sm text-gray-300 mb-6">
              Invoice expires in <span className="font-mono">{formatCountdown(expiresAt - now)}</span>
            </p>

            <Button asChild className="w-full h-12 mb-3 bg-green-600 hover:bg-green-700 text-white">
              <a href={lightningUri}>
                <Wallet className="h-4 w-4 mr-2" aria-hidden="true" />
                Open in wallet
              </a>
            </Button>
            <Button variant="outline" className="w-full mb-4 bg-gray-800 border-gray-600 text-white hover:bg-gray-700" onClick={copyInvoice}>
              {copied ? <Check className="h-4 w-4 mr-2" aria-hidden="true" /> : <Copy className="h-4 w-4 mr-2" aria-hidden="true" />}
              {copied ? "Copied!" : "Copy Invoice"}
            </Button>

            <label htmlFor="invoice" className="block text-left text-xs text-gray-400 mb-1">Lightning invoice</label>
            <textarea
              id="invoice"
              readOnly
              value={paymentRequest}
              rows={4}
              onFocus={e => e.currentTarget.select()}
              className="w-full mb-4 rounded-lg bg-gray-900 border border-gray-700 p-3 text-xs font-mono text-gray-300 break-all resize-none"
            />

            <p className="text-sm text-gray-300">
              You can close this page after paying. We'll email {email} when the payment is confirmed.
              Keep this page's link to check your order later.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
