"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Cat, CheckCircle2, Package, Mail, ArrowRight, Loader2 } from "lucide-react"
import { getOrderByNumber } from "@/app/actions/pet-order-actions"

interface OrderDetails {
  orderNumber: string
  email: string
  fullName: string
  totalPriceSats: number
  paymentStatus: string
  orderStatus: string
  createdAt: string
  shippingAddress: {
    line1: string
    line2?: string
    city: string
    state: string
    postalCode: string
  }
}

export default function OrderConfirmationPage() {
  const params = useParams()
  const orderNumber = params.orderNumber as string
  
  const [order, setOrder] = useState<OrderDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderNumber) return
      
      try {
        const result = await getOrderByNumber(orderNumber)
        if (result.success && result.order) {
          setOrder(result.order)
        } else {
          setError(result.error || "Order not found")
        }
      } catch (err) {
        setError("Failed to load order")
      } finally {
        setIsLoading(false)
      }
    }

    fetchOrder()
  }, [orderNumber])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold mb-2">Order Not Found</h1>
            <p className="text-gray-600 mb-6">{error || "We couldn't find this order."}</p>
            <Button onClick={() => window.location.href = '/satoshi-pet'}>
              Return to Satoshi Pet
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isPaid = order.paymentStatus === 'paid'

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center">
              <Cat size={18} color="white" strokeWidth={2} />
            </div>
            <span className="font-bold text-lg">Satoshi Pet</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {isPaid ? "Order Confirmed!" : "Order Created"}
          </h1>
          <p className="text-gray-600">
            {isPaid 
              ? "Thank you for your pre-order! We're excited to ship your Satoshi Pet."
              : "Your order is waiting for payment."
            }
          </p>
        </div>

        {/* Order Details Card */}
        <Card className="shadow-lg mb-8">
          <CardContent className="p-6 sm:p-8">
            {/* Order Number */}
            <div className="text-center pb-6 border-b">
              <p className="text-sm text-gray-500 mb-1">Order Number</p>
              <p className="text-2xl font-mono font-bold text-green-600">{order.orderNumber}</p>
            </div>

            {/* Order Info Grid */}
            <div className="grid sm:grid-cols-2 gap-6 py-6 border-b">
              <div>
                <p className="text-sm text-gray-500 mb-1">Status</p>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    isPaid 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {isPaid ? 'Confirmed' : 'Awaiting Payment'}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Amount Paid</p>
                <p className="font-semibold">{order.totalPriceSats.toLocaleString()} sats</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Name</p>
                <p className="font-semibold">{order.fullName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Email</p>
                <p className="font-semibold">{order.email}</p>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="py-6">
              <p className="text-sm text-gray-500 mb-2">Shipping To</p>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-medium">{order.fullName}</p>
                <p className="text-gray-600">{order.shippingAddress.line1}</p>
                {order.shippingAddress.line2 && (
                  <p className="text-gray-600">{order.shippingAddress.line2}</p>
                )}
                <p className="text-gray-600">
                  {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
                </p>
                <p className="text-gray-600">United States</p>
              </div>
            </div>

            {/* Confirmation Email Note */}
            {isPaid && (
              <div className="flex items-start gap-3 bg-blue-50 rounded-lg p-4">
                <Mail className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900">Confirmation email sent</p>
                  <p className="text-sm text-blue-700">
                    We've sent order details to {order.email}. Check your inbox!
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* What's Next */}
        <Card className="shadow-lg mb-8">
          <CardContent className="p-6 sm:p-8">
            <h2 className="font-bold text-lg mb-4">What's Next?</h2>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-green-600 font-bold text-sm">1</span>
                </div>
                <div>
                  <p className="font-medium">Create your Ganamos account</p>
                  <p className="text-sm text-gray-600">Sign up at ganamos.earth to manage your Bitcoin and connect with your pet.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-gray-600 font-bold text-sm">2</span>
                </div>
                <div>
                  <p className="font-medium text-gray-500">We'll ship your Satoshi Pet</p>
                  <p className="text-sm text-gray-500">You'll receive a shipping confirmation with tracking info.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-gray-600 font-bold text-sm">3</span>
                </div>
                <div>
                  <p className="font-medium text-gray-500">Connect & enjoy!</p>
                  <p className="text-sm text-gray-500">Follow our setup guide to pair your device and start earning.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Button 
            size="lg"
            className="flex-1 h-14 bg-green-600 hover:bg-green-700"
            onClick={() => window.location.href = 'https://ganamos.earth/auth/register'}
          >
            Create Account
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <Button 
            variant="outline"
            size="lg"
            className="flex-1 h-14"
            onClick={() => window.location.href = '/satoshi-pet/setup'}
          >
            View Setup Guide
          </Button>
        </div>

        {/* Footer Note */}
        <p className="text-center text-sm text-gray-500 mt-8">
          Questions? Contact us at <a href="mailto:support@ganamos.earth" className="text-blue-600 hover:underline">support@ganamos.earth</a>
        </p>
      </main>
    </div>
  )
}

