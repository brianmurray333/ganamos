"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { 
  Cat, Heart, Zap, Wifi, Package, Check, ArrowRight, 
  ChevronDown, Loader2, Copy, CheckCircle2, Bitcoin,
  Smartphone, Settings, Link2, Github, Code, Wrench, Cpu,
  Download, ExternalLink, ShoppingCart, Printer, GitPullRequest
} from "lucide-react"
import { toast } from "sonner"
import { 
  createPetOrder, 
  calculateShippingCost,
  checkOrderPaymentStatus,
} from "@/app/actions/pet-order-actions"
import {
  PET_DEVICE_LIST_PRICE_SATS,
  PET_DEVICE_PREORDER_PRICE_SATS,
} from "@/lib/pet-order-constants"
import QRCode from "@/components/qr-code"

// Format sats with k for thousands (e.g. 40000 -> "40k")
const formatSatsK = (sats: number): string => {
  if (sats >= 1000) {
    return `${Math.round(sats / 1000)}k`
  }
  return sats.toLocaleString()
}

// US States for dropdown
const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
]

type CheckoutStep = 'landing' | 'shipping' | 'payment'

export default function SatoshiPetPage() {
  const router = useRouter()
  const [step, setStep] = useState<CheckoutStep>('landing')
  const [bitcoinPrice, setBitcoinPrice] = useState<number | null>(null)
  const [isLoadingPrice, setIsLoadingPrice] = useState(true)
  const setupRef = useRef<HTMLDivElement>(null)
  
  // Form state
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [postalCode, setPostalCode] = useState("")
  
  // Order state
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false)
  const [shippingSats, setShippingSats] = useState<number | null>(null)
  const [estimatedDays, setEstimatedDays] = useState<string | null>(null)
  const [isCreatingOrder, setIsCreatingOrder] = useState(false)
  
  // Payment state
  const [paymentRequest, setPaymentRequest] = useState<string | null>(null)
  const [paymentHash, setPaymentHash] = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [totalSats, setTotalSats] = useState<number | null>(null)
  const [isCheckingPayment, setIsCheckingPayment] = useState(false)
  const [copied, setCopied] = useState(false)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch Bitcoin price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch("/api/bitcoin-price")
        if (response.ok) {
          const data = await response.json()
          if (data.price && typeof data.price === "number") {
            setBitcoinPrice(data.price)
          }
        }
      } catch (error) {
        console.warn("Failed to fetch Bitcoin price:", error)
      } finally {
        setIsLoadingPrice(false)
      }
    }
    fetchPrice()
    
    // Refresh price every 5 minutes
    const interval = setInterval(fetchPrice, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Convert sats to USD
  const satsToUsd = useCallback((sats: number): string | null => {
    if (!bitcoinPrice) return null
    const usd = (sats / 100000000) * bitcoinPrice
    return usd.toFixed(2)
  }, [bitcoinPrice])

  // Calculate shipping when state changes
  useEffect(() => {
    if (state && postalCode && postalCode.length >= 5) {
      const calcShipping = async () => {
        setIsCalculatingShipping(true)
        try {
          const result = await calculateShippingCost(state, postalCode)
          if (result.success) {
            setShippingSats(result.shippingSats!)
            setEstimatedDays(result.estimatedDays!)
          } else {
            setShippingSats(null)
            setEstimatedDays(null)
          }
        } catch (error) {
          console.error("Error calculating shipping:", error)
        } finally {
          setIsCalculatingShipping(false)
        }
      }
      calcShipping()
    }
  }, [state, postalCode])

  // Scroll to setup section
  const scrollToSetup = () => {
    setupRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Check if form is valid
  const isFormValid = email && fullName && addressLine1 && city && state && postalCode && shippingSats !== null

  // Create order
  const handleCreateOrder = async () => {
    if (!isFormValid) return
    
    setIsCreatingOrder(true)
    try {
      const result = await createPetOrder({
        email,
        fullName,
        addressLine1,
        addressLine2: addressLine2 || undefined,
        city,
        state,
        postalCode,
        isPreorder: true,
      })

      if (result.success) {
        setPaymentRequest(result.paymentRequest!)
        setPaymentHash(result.paymentHash!)
        setOrderNumber(result.orderNumber!)
        setTotalSats(result.totalSats!)
        setStep('payment')
        startPaymentPolling(result.paymentHash!)
      } else {
        toast.error("Order Failed", { description: result.error })
      }
    } catch (error) {
      toast.error("Order Failed", { description: "An unexpected error occurred" })
    } finally {
      setIsCreatingOrder(false)
    }
  }

  // Start polling for payment
  const startPaymentPolling = (hash: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    pollingRef.current = setInterval(async () => {
      try {
        setIsCheckingPayment(true)
        const result = await checkOrderPaymentStatus(hash)
        if (result.success && result.paid) {
          clearInterval(pollingRef.current!)
          toast.success("Payment Received!", { description: "Your order has been confirmed" })
          router.push(`/satoshi-pet/order/${result.orderNumber}`)
        }
      } catch (error) {
        console.error("Error checking payment:", error)
      } finally {
        setIsCheckingPayment(false)
      }
    }, 3000)
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  // Copy invoice to clipboard
  const copyInvoice = async () => {
    if (!paymentRequest) return
    try {
      await navigator.clipboard.writeText(paymentRequest)
      setCopied(true)
      toast.success("Copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error("Failed to copy")
    }
  }

  // Feature list
  const features = [
    {
      icon: <Heart className="h-6 w-6 text-rose-500" />,
      title: "Real Bitcoin Connection",
      description: "Your pet reacts when you earn or spend sats - making Bitcoin tangible and fun"
    },
    {
      icon: <Zap className="h-6 w-6 text-amber-500" />,
      title: "Educational & Fun",
      description: "Perfect for teaching kids (and adults!) Bitcoin concepts through interactive play"
    },
    {
      icon: <Wifi className="h-6 w-6 text-blue-500" />,
      title: "Always Connected",
      description: "WiFi-enabled device syncs with your Ganamos wallet in real-time"
    },
    {
      icon: <Package className="h-6 w-6 text-purple-500" />,
      title: "Portable Design",
      description: "USB-C rechargeable with long battery life - carry Bitcoin everywhere"
    },
  ]

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Custom styles */}
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); }
          25% { transform: translateY(-3px) scale(1.02); }
          50% { transform: translateY(-6px) scale(1.05); }
          75% { transform: translateY(-3px) scale(1.02); }
        }
        
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(-3deg); }
          20% { transform: rotate(3deg); }
          30% { transform: rotate(-1.5deg); }
          40% { transform: rotate(1.5deg); }
          50%, 100% { transform: rotate(0deg); }
        }
        
        @keyframes coinRain {
          0% { transform: translateY(-60px); }
          100% { transform: translateY(80px); }
        }
        
        @keyframes coinFade {
          0% { opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }

        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(1.2); opacity: 0; }
        }
      `}</style>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center">
              <Cat size={18} color="white" strokeWidth={2} />
            </div>
            <span className="font-bold text-lg text-white">Satoshi Pet</span>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={scrollToSetup}
              className="hidden sm:flex text-gray-300 hover:text-white hover:bg-gray-800"
            >
              Setup Guide
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => document.getElementById('diy')?.scrollIntoView({ behavior: 'smooth' })}
              className="hidden sm:flex text-gray-300 hover:text-white hover:bg-gray-800"
            >
              <Github className="h-4 w-4 mr-1" />
              Build Your Own
            </Button>
            <Button 
              size="sm"
              onClick={() => window.location.href = 'https://ganamos.earth/connect-pet'}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Connect Pet
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {/* Hero Section */}
        {step === 'landing' && (
          <>
            <section className="relative overflow-hidden bg-gradient-to-b from-gray-800 via-gray-900 to-gray-900 pt-20 pb-8 sm:pt-24 sm:pb-16">
              <div className="max-w-6xl mx-auto px-4">
                <div className="grid md:grid-cols-2 gap-12 items-center">
                  {/* Left: Product Visual */}
                  <div className="flex justify-center order-2 md:order-1 mt-8 md:mt-0">
                    <div className="relative">
                      {/* Animated Pet Circle */}
                      <div className="relative w-64 h-64 sm:w-80 sm:h-80">
                        {/* Bitcoin Coins Raining - z-0 so they appear behind text */}
                        <div 
                          className="flex absolute z-0 w-8 h-8 border-2 border-amber-400 bg-amber-50 rounded-full items-center justify-center text-sm font-bold text-amber-600"
                          style={{ 
                            left: '10%', 
                            top: '-10%',
                            animation: 'coinRain 3s ease-in-out infinite, coinFade 3s ease-in-out infinite',
                            opacity: 0 
                          }}
                        >
                          ₿
                        </div>
                        <div 
                          className="flex absolute z-0 w-8 h-8 border-2 border-amber-400 bg-amber-50 rounded-full items-center justify-center text-sm font-bold text-amber-600"
                          style={{ 
                            left: '50%', 
                            top: '-10%',
                            animation: 'coinRain 3s ease-in-out infinite, coinFade 3s ease-in-out infinite',
                            animationDelay: '1s',
                            opacity: 0 
                          }}
                        >
                          ₿
                        </div>
                        <div 
                          className="flex absolute z-0 w-8 h-8 border-2 border-amber-400 bg-amber-50 rounded-full items-center justify-center text-sm font-bold text-amber-600"
                          style={{ 
                            left: '80%', 
                            top: '-10%',
                            animation: 'coinRain 3s ease-in-out infinite, coinFade 3s ease-in-out infinite',
                            animationDelay: '2s',
                            opacity: 0 
                          }}
                        >
                          ₿
                        </div>

                        {/* Pulse rings */}
                        <div className="absolute inset-0 rounded-full border-2 border-purple-400/30" style={{ animation: 'pulse-ring 2s ease-out infinite' }} />
                        <div className="absolute inset-0 rounded-full border-2 border-blue-400/30" style={{ animation: 'pulse-ring 2s ease-out infinite', animationDelay: '0.5s' }} />

                        {/* Main Circle */}
                        <div className="relative w-full h-full bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center shadow-2xl shadow-purple-500/30">
                          <div className="absolute inset-4 bg-white/10 rounded-full" />
                          <div 
                            className="relative z-10"
                            style={{ animation: 'float 4s ease-in-out infinite, wiggle 6s ease-in-out infinite' }}
                          >
                            <Cat size={140} color="white" strokeWidth={1.2} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Product Info - z-10 so text appears above bitcoin coins */}
                  <div className="text-center md:text-left order-1 md:order-2 relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-900/50 text-green-400 rounded-full text-sm font-medium mb-4">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      Pre-Order Now Available
                    </div>
                    
                    <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
                      Make Bitcoin<br />
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                        Physical & Fun
                      </span>
                    </h1>
                    
                    <p className="text-lg text-gray-400 mb-8 max-w-md mx-auto md:mx-0">
                      A cute hardware companion that reacts to your Bitcoin activity. 
                      Perfect for making Bitcoin tangible for the whole family.
                    </p>

                    {/* Pricing */}
                    <div className="bg-gray-800 rounded-2xl p-6 mb-6 max-w-md mx-auto md:mx-0 border border-gray-700">
                      <div className="flex items-baseline gap-3 mb-2">
                        <span className="text-3xl font-bold text-white flex items-center gap-2">
                          <Bitcoin className="h-7 w-7 text-orange-400" />
                          {formatSatsK(PET_DEVICE_PREORDER_PRICE_SATS)} sats
                        </span>
                        <span className="text-lg text-gray-500 line-through">
                          {formatSatsK(PET_DEVICE_LIST_PRICE_SATS)} sats
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-400 mb-4">
                        {isLoadingPrice ? (
                          <span className="text-sm">Loading USD price...</span>
                        ) : bitcoinPrice ? (
                          <>
                            <span className="text-sm">
                              ≈ ${satsToUsd(PET_DEVICE_PREORDER_PRICE_SATS)} USD
                            </span>
                            <span className="text-xs text-gray-500">
                              (was ${satsToUsd(PET_DEVICE_LIST_PRICE_SATS)})
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-500">USD price unavailable</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-green-400">
                        <Check className="h-4 w-4" />
                        <span>Save {((1 - PET_DEVICE_PREORDER_PRICE_SATS / PET_DEVICE_LIST_PRICE_SATS) * 100).toFixed(0)}% with pre-order pricing</span>
                      </div>
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto md:mx-0">
                      <Button 
                        size="lg" 
                        className="sm:flex-1 h-14 text-lg bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => setStep('shipping')}
                      >
                        <img
                          src="/images/bitcoin-logo.png"
                          alt="Bitcoin"
                          className="h-5 w-5 mr-2"
                        />
                        Pre-Order Now
                      </Button>
                      <Button 
                        variant="outline" 
                        size="lg"
                        className="h-14 text-lg bg-gray-800 border-gray-600 text-white hover:bg-gray-700"
                        onClick={() => document.getElementById('diy')?.scrollIntoView({ behavior: 'smooth' })}
                      >
                        <Wrench className="h-5 w-5 mr-2" />
                        Build Your Own
                      </Button>
                    </div>

                    <p className="text-sm text-gray-500 mt-4 text-center md:text-left relative z-20">
                      Pay with Bitcoin Lightning ⚡ Ships within the US | <button onClick={() => window.location.href = 'https://ganamos.earth/connect-pet'} className="underline hover:text-gray-400">I already have one</button>
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Features Grid */}
            <section className="py-6 sm:py-24 bg-gray-900">
              <div className="max-w-6xl mx-auto px-4">
                <h2 className="text-3xl font-bold text-center mb-12 text-white">
                  Why Satoshi Pet?
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
                  {features.map((feature, i) => (
                    <div key={i} className="text-center">
                      <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-4">
                        {feature.icon}
                      </div>
                      <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
                      <p className="text-gray-400 text-sm">{feature.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Social Proof */}
            <section className="py-16 bg-gray-800">
              <div className="max-w-6xl mx-auto px-4 text-center">
                <p className="text-gray-400 mb-4">Join families already using Satoshi Pet</p>
                <div className="flex justify-center items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-6 h-6 text-amber-400 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <blockquote className="text-lg text-gray-300 max-w-2xl mx-auto">
                  "My kids finally understand saving! Every time they earn sats, they run to check on their pet. 
                  It's the best Bitcoin education tool I've found."
                </blockquote>
                <p className="text-gray-500 mt-4">— Sarah M., Austin, TX</p>
              </div>
            </section>

            {/* Setup Guide */}
            <section ref={setupRef} id="setup" className="py-16 sm:py-24 bg-gray-900 scroll-mt-20">
              <div className="max-w-4xl mx-auto px-4">
                <div className="text-center mb-12">
                  <h2 className="text-3xl font-bold mb-4 text-white">Setup Guide</h2>
                  <p className="text-gray-400">Get your Satoshi Pet connected in minutes</p>
                </div>

                <div className="space-y-8">
                  {/* Step 1 */}
                  <div className="flex gap-6">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-green-900/50 text-green-400 flex items-center justify-center font-bold text-lg">
                        1
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-2 flex items-center gap-2 text-white">
                        <Smartphone className="h-5 w-5 text-gray-500" />
                        Create Your Account
                      </h3>
                      <p className="text-gray-400 mb-3">
                        Go to <a href="https://ganamos.earth" className="text-blue-400 hover:underline">ganamos.earth</a> and sign up for a free account. 
                        This is where you'll manage your Bitcoin balance and connect with your pet.
                      </p>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-400" />
                          Create a new pet (give it a name, pick a type)
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-6">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-blue-900/50 text-blue-400 flex items-center justify-center font-bold text-lg">
                        2
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-2 flex items-center gap-2 text-white">
                        <Wifi className="h-5 w-5 text-gray-500" />
                        Connect Pet to WiFi
                      </h3>
                      <p className="text-gray-400 mb-3">
                        Power on your device. It will create a WiFi network called "SatoshiPet".
                      </p>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-400" />
                          Connect to "SatoshiPet" from your phone/laptop
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-400" />
                          A portal will open - enter your home WiFi credentials
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-400" />
                          Device will restart and connect to your WiFi
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex gap-6">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-purple-900/50 text-purple-400 flex items-center justify-center font-bold text-lg">
                        3
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-2 flex items-center gap-2 text-white">
                        <Link2 className="h-5 w-5 text-gray-500" />
                        Pair Your Pet
                      </h3>
                      <p className="text-gray-400 mb-3">
                        Your device will display a 6-character pairing code on screen.
                      </p>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-400" />
                          On ganamos.earth, go to your pet's settings
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-400" />
                          Enter the pairing code to link your device
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                          Done! Your Satoshi Pet is now connected 🎉
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="mt-12 text-center">
                  <Button 
                    size="lg" 
                    className="h-14 px-8 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setStep('shipping')}
                  >
                    Get Your Satoshi Pet
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              </div>
            </section>

            {/* Build Your Own Section */}
            <section id="diy" className="py-16 sm:py-24 bg-gray-800">
              <div className="max-w-5xl mx-auto px-4">
                <div className="text-center mb-12">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-900/50 text-amber-400 rounded-full text-sm font-medium mb-4">
                    <Github className="h-4 w-4" />
                    100% Open Source
                  </div>
                  <h2 className="text-3xl font-bold mb-4 text-white">Build Your Own Satoshi Pet</h2>
                  <p className="text-gray-400 max-w-2xl mx-auto">
                    Don't want to wait? Build one yourself! Our firmware and hardware designs are completely 
                    open source. Order parts from Amazon, print the case, flash the code, and you're ready to go.
                  </p>
                </div>

                {/* Download Buttons */}
                <div className="grid sm:grid-cols-2 gap-4 mb-12 max-w-2xl mx-auto">
                  <Button 
                    size="lg"
                    className="h-14 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => window.open('https://github.com/brianmurray333/satoshipet-firmware/archive/refs/heads/main.zip', '_blank')}
                  >
                    <Download className="h-5 w-5 mr-2" />
                    Download Firmware (.zip)
                  </Button>
                  <Button 
                    size="lg"
                    className="h-14 bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => window.open('https://github.com/brianmurray333/satoshipet-firmware/raw/main/hardware/3d-models/case-v1.stl', '_blank')}
                  >
                    <Printer className="h-5 w-5 mr-2" />
                    Download Case STL
                  </Button>
                </div>

                {/* Parts List */}
                <div className="bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden mb-8">
                  <div className="p-6 border-b border-gray-700">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5 text-green-400" />
                      Parts List (~$30-40 total)
                    </h3>
                    <p className="text-gray-400 text-sm mt-1">
                      Everything you need from Amazon. Click to buy.
                    </p>
                  </div>
                  <div className="divide-y divide-gray-700">
                    <a 
                      href="https://www.amazon.com/dp/B07DKD79Y9?th=1" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-900/50 rounded-lg flex items-center justify-center">
                          <Cpu className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white">Heltec WiFi Kit 32 V3</p>
                          <p className="text-sm text-gray-400">ESP32 board with OLED display</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-amber-400">
                        <span className="text-sm font-medium">~$18</span>
                        <ExternalLink className="h-4 w-4" />
                      </div>
                    </a>
                    <a 
                      href="https://www.amazon.com/dp/B0FMY3M1YX?th=1" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-green-900/50 rounded-lg flex items-center justify-center">
                          <Zap className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white">LiPo Battery 3.7V</p>
                          <p className="text-sm text-gray-400">1000-2000mAh with JST connector</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-amber-400">
                        <span className="text-sm font-medium">~$8</span>
                        <ExternalLink className="h-4 w-4" />
                      </div>
                    </a>
                    <a 
                      href="https://www.amazon.com/dp/B01N7NHSY6" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-amber-900/50 rounded-lg flex items-center justify-center">
                          <span className="text-amber-400 text-lg">🔊</span>
                        </div>
                        <div>
                          <p className="font-medium text-white">Active Buzzer 5V (10 pack)</p>
                          <p className="text-sm text-gray-400">For sound effects</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-amber-400">
                        <span className="text-sm font-medium">~$6</span>
                        <ExternalLink className="h-4 w-4" />
                      </div>
                    </a>
                    <a 
                      href="https://www.amazon.com/dp/B07GN1K4HG" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-purple-900/50 rounded-lg flex items-center justify-center">
                          <span className="text-purple-400 text-lg">🔘</span>
                        </div>
                        <div>
                          <p className="font-medium text-white">Tactile Buttons (pack)</p>
                          <p className="text-sm text-gray-400">Optional external button</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-amber-400">
                        <span className="text-sm font-medium">~$6</span>
                        <ExternalLink className="h-4 w-4" />
                      </div>
                    </a>
                    <a 
                      href="https://www.amazon.com/EDGELEC-Breadboard-Optional-Assorted-Multicolored/dp/B07GD2BWPY" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-red-900/50 rounded-lg flex items-center justify-center">
                          <span className="text-red-400 text-lg">🔌</span>
                        </div>
                        <div>
                          <p className="font-medium text-white">Jumper Wires</p>
                          <p className="text-sm text-gray-400">For connecting buzzer & button</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-amber-400">
                        <span className="text-sm font-medium">~$7</span>
                        <ExternalLink className="h-4 w-4" />
                      </div>
                    </a>
                  </div>
                </div>

                {/* GitHub & Contribute */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 border border-gray-700">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-gray-700 rounded-xl flex items-center justify-center">
                        <Github className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white">View on GitHub</h3>
                        <p className="text-sm text-gray-400">Full source code & docs</p>
                      </div>
                    </div>
                    <p className="text-gray-400 text-sm mb-4">
                      Complete Arduino firmware, wiring diagrams, and setup instructions.
                    </p>
                    <Button 
                      className="w-full bg-white text-gray-900 hover:bg-gray-100"
                      onClick={() => window.open('https://github.com/brianmurray333/satoshipet-firmware', '_blank')}
                    >
                      <Github className="h-4 w-4 mr-2" />
                      View Repository
                    </Button>
                  </div>

                  <div className="bg-gradient-to-br from-green-900/30 to-gray-900 rounded-2xl p-6 border border-green-800/50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-green-900/50 rounded-xl flex items-center justify-center">
                        <GitPullRequest className="h-6 w-6 text-green-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white">Contribute!</h3>
                        <p className="text-sm text-gray-400">Help us improve</p>
                      </div>
                    </div>
                    <p className="text-gray-400 text-sm mb-4">
                      Have a better case design? Code improvements? We welcome PRs and suggestions!
                    </p>
                    <Button 
                      variant="outline"
                      className="w-full border-green-700 text-green-400 hover:bg-green-900/30"
                      onClick={() => window.open('https://github.com/brianmurray333/satoshipet-firmware/issues', '_blank')}
                    >
                      <GitPullRequest className="h-4 w-4 mr-2" />
                      Open an Issue / PR
                    </Button>
                  </div>
                </div>

                <div className="mt-8 p-4 bg-gray-900/50 rounded-xl border border-gray-700 text-center">
                  <p className="text-gray-400 text-sm">
                    🎉 DIY builds connect to the same Ganamos platform as official devices — no restrictions!
                    <br />
                    <span className="text-gray-500">Licensed under Apache 2.0 (code) and CERN-OHL-P v2 (hardware)</span>
                  </p>
                </div>

                <div className="mt-8 text-center">
                  <p className="text-gray-500 text-sm mb-4">Prefer a pre-assembled device?</p>
                  <Button 
                    size="lg"
                    className="h-14 px-8 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setStep('shipping')}
                  >
                    <Bitcoin className="h-5 w-5 mr-2" />
                    Buy Pre-Built for {formatSatsK(PET_DEVICE_PREORDER_PRICE_SATS)} sats
                  </Button>
                </div>
              </div>
            </section>

            {/* Final CTA */}
            <section className="py-16 bg-gradient-to-br from-purple-600 to-blue-600 text-white">
              <div className="max-w-4xl mx-auto px-4 text-center">
                <h2 className="text-3xl font-bold mb-4">Ready to Make Bitcoin Fun?</h2>
                <p className="text-white/80 mb-8 max-w-2xl mx-auto">
                  Pre-order your Satoshi Pet today and join families who are teaching the next generation about Bitcoin through play.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button 
                    size="lg" 
                    className="h-14 px-8 bg-white text-purple-600 hover:bg-gray-100"
                    onClick={() => setStep('shipping')}
                  >
                    <Bitcoin className="h-5 w-5 mr-2" />
                    Pre-Order for {formatSatsK(PET_DEVICE_PREORDER_PRICE_SATS)} sats
                  </Button>
                </div>
              </div>
            </section>
          </>
        )}

        {/* Shipping Form Step */}
        {step === 'shipping' && (
          <section className="min-h-screen pt-24 pb-8 sm:pt-32 sm:pb-16 bg-gray-900">
            <div className="max-w-lg mx-auto px-4">
              <button 
                onClick={() => setStep('landing')}
                className="flex items-center text-gray-400 hover:text-white mb-6"
              >
                <ChevronDown className="h-4 w-4 rotate-90 mr-1" />
                Back
              </button>

              <Card className="shadow-xl bg-gray-800 border-gray-700">
                <CardContent className="p-6 sm:p-8 text-white">
                  {/* Product Summary */}
                  <div className="flex items-center gap-4 pb-6 border-b border-gray-700 mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-blue-500 rounded-2xl flex items-center justify-center">
                      <Cat size={32} color="white" strokeWidth={1.5} />
                    </div>
                    <div>
                      <h2 className="font-bold text-lg">Satoshi Pet</h2>
                      <p className="text-sm text-gray-400">Pre-Order</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="font-bold">{formatSatsK(PET_DEVICE_PREORDER_PRICE_SATS)} sats</p>
                      {bitcoinPrice && (
                        <p className="text-sm text-gray-400">≈ ${satsToUsd(PET_DEVICE_PREORDER_PRICE_SATS)}</p>
                      )}
                    </div>
                  </div>

                  <h3 className="font-semibold mb-4">Shipping Information</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="email" className="text-gray-300">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-500"
                      />
                    </div>

                    <div>
                      <Label htmlFor="fullName" className="text-gray-300">Full Name *</Label>
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="John Doe"
                        className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-500"
                      />
                    </div>

                    <div>
                      <Label htmlFor="addressLine1" className="text-gray-300">Address *</Label>
                      <Input
                        id="addressLine1"
                        value={addressLine1}
                        onChange={(e) => setAddressLine1(e.target.value)}
                        placeholder="123 Main St"
                        className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-500"
                      />
                    </div>

                    <div>
                      <Label htmlFor="addressLine2" className="text-gray-300">Apartment, suite, etc. (optional)</Label>
                      <Input
                        id="addressLine2"
                        value={addressLine2}
                        onChange={(e) => setAddressLine2(e.target.value)}
                        placeholder="Apt 4B"
                        className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="city" className="text-gray-300">City *</Label>
                        <Input
                          id="city"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="San Francisco"
                          className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-500"
                        />
                      </div>
                      <div>
                        <Label htmlFor="state" className="text-gray-300">State *</Label>
                        <select
                          id="state"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          className="mt-1 w-full h-10 px-3 rounded-md border border-gray-600 bg-gray-700 text-white text-sm"
                        >
                          <option value="">Select state</option>
                          {US_STATES.map((s) => (
                            <option key={s.code} value={s.code}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="postalCode" className="text-gray-300">ZIP Code *</Label>
                      <Input
                        id="postalCode"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        placeholder="94102"
                        className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-500"
                        maxLength={10}
                      />
                    </div>
                  </div>

                  {/* Order Summary */}
                  <div className="mt-8 pt-6 border-t border-gray-700 space-y-3">
                    <div className="flex justify-between text-sm text-gray-300">
                      <span>Satoshi Pet (Pre-Order)</span>
                      <span>{PET_DEVICE_PREORDER_PRICE_SATS.toLocaleString()} sats</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-300">
                      <span>Shipping (US)</span>
                      {isCalculatingShipping ? (
                        <span className="flex items-center text-gray-500">
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          Calculating...
                        </span>
                      ) : shippingSats !== null ? (
                        <span>{shippingSats.toLocaleString()} sats</span>
                      ) : (
                        <span className="text-gray-500">Enter address</span>
                      )}
                    </div>
                    {estimatedDays && (
                      <p className="text-xs text-gray-500">Estimated delivery: {estimatedDays}</p>
                    )}
                    <div className="flex justify-between font-bold text-lg pt-3 border-t border-gray-700">
                      <span>Total</span>
                      <div className="text-right">
                        <span>
                          {shippingSats !== null 
                            ? (PET_DEVICE_PREORDER_PRICE_SATS + shippingSats).toLocaleString() 
                            : PET_DEVICE_PREORDER_PRICE_SATS.toLocaleString()
                          } sats
                        </span>
                        {bitcoinPrice && shippingSats !== null && (
                          <p className="text-sm font-normal text-gray-400">
                            ≈ ${satsToUsd(PET_DEVICE_PREORDER_PRICE_SATS + shippingSats)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full h-12 mt-6 bg-green-600 hover:bg-green-700"
                    disabled={!isFormValid || isCreatingOrder}
                    onClick={handleCreateOrder}
                  >
                    {isCreatingOrder ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Creating Order...
                      </>
                    ) : (
                      <>
                        Continue to Payment
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-center text-gray-500 mt-4">
                    You'll pay with Bitcoin Lightning on the next step
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* Payment Step */}
        {step === 'payment' && paymentRequest && (
          <section className="min-h-screen pt-24 pb-8 sm:pt-32 sm:pb-16 bg-gray-50">
            <div className="max-w-lg mx-auto px-4">
              <Card className="shadow-xl bg-white border-gray-200">
                <CardContent className="p-6 sm:p-8 text-center text-gray-900">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Cat size={32} color="white" strokeWidth={1.5} />
                  </div>
                  
                  <h2 className="text-xl font-bold mb-2">Complete Your Payment</h2>
                  <p className="text-gray-600 mb-1">Order #{orderNumber}</p>
                  <p className="text-2xl font-bold mb-6">{totalSats?.toLocaleString()} sats</p>

                  {/* QR Code */}
                  <div className="bg-white p-4 rounded-xl inline-block mb-6">
                    <QRCode data={paymentRequest} size={240} />
                  </div>

                  {/* Status */}
                  <div className="flex items-center justify-center gap-2 text-amber-600 mb-6">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Waiting for payment...</span>
                  </div>

                  {/* Copy Button */}
                  <Button
                    variant="outline"
                    className="w-full mb-4"
                    onClick={copyInvoice}
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Invoice
                      </>
                    )}
                  </Button>

                  {/* Invoice Preview */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-4">
                    <p className="text-xs font-mono text-gray-500 break-all">
                      {paymentRequest.substring(0, 50)}...
                    </p>
                  </div>

                  <p className="text-xs text-gray-500">
                    Scan with any Lightning wallet or copy the invoice.
                    <br />
                    Invoice expires in 1 hour.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-6 h-6 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center">
              <Cat size={14} color="white" strokeWidth={2} />
            </div>
            <span className="font-semibold text-white">Satoshi Pet</span>
          </div>
          <p className="text-sm mb-4">
            A product by <a href="https://ganamos.earth" className="text-white hover:underline">Ganamos</a>
          </p>
          <p className="text-xs">
            © {new Date().getFullYear()} Satoshi Pet. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

