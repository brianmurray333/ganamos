"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { 
  Cat, Heart, Zap, Wifi, Package, Check, ArrowRight, 
  ChevronDown, Loader2, CheckCircle2, Bitcoin,
  Smartphone, Link2, Github, Wrench, Cpu,
  Download, ExternalLink, ShoppingCart, Printer, GitPullRequest
} from "lucide-react"
import { toast } from "@/components/ui/toast"
import { 
  createPetOrder, 
  calculateShippingCost,
} from "@/app/actions/pet-order-actions"
import {
  PET_DEVICE_LIST_PRICE_SATS,
  PET_DEVICE_PREORDER_PRICE_SATS,
  PET_PREORDER_ACTIVE,
  PREORDER_SHIP_ESTIMATE,
  SUPPORT_EMAIL,
  currentPetDevicePriceSats,
  preorderShipEstimateText,
} from "@/lib/pet-order-constants"
import {
  PET_ORDER_FIELD_LIMITS,
  US_ZIP_REGEX,
  validatePetOrderShipping,
  type PetOrderField,
} from "@/lib/pet-order-validation"

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

type CheckoutStep = 'landing' | 'shipping'

type FieldErrors = Partial<Record<PetOrderField, string>>

// Device price for a new order (pre-order pricing is decided on the server by
// the same constant; the client never sends it)
const DEVICE_PRICE_SATS = currentPetDevicePriceSats()

const PREORDER_SHIP_ESTIMATE_SENTENCE = PREORDER_SHIP_ESTIMATE
  ? `Estimated ship: ${PREORDER_SHIP_ESTIMATE}.`
  : "We'll email you a ship date before it ships."

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
  const [touched, setTouched] = useState<Partial<Record<PetOrderField, boolean>>>({})
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  
  // Order state
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false)
  const [shippingSats, setShippingSats] = useState<number | null>(null)
  const [estimatedDays, setEstimatedDays] = useState<string | null>(null)
  const [isCreatingOrder, setIsCreatingOrder] = useState(false)

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

  // Calculate shipping once the state and a valid ZIP are entered
  useEffect(() => {
    if (!state || !US_ZIP_REGEX.test(postalCode.trim())) {
      setShippingSats(null)
      setEstimatedDays(null)
      return
    }
    let cancelled = false
    const calcShipping = async () => {
      setIsCalculatingShipping(true)
      try {
        const result = await calculateShippingCost(state, postalCode.trim())
        if (cancelled) return
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
        if (!cancelled) setIsCalculatingShipping(false)
      }
    }
    calcShipping()
    return () => { cancelled = true }
  }, [state, postalCode])

  // In-page section links: real anchors, smooth-scrolled (back to the landing view first if needed)
  const goToSection = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    const scroll = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    if (step !== 'landing') {
      setStep('landing')
      setTimeout(scroll, 50)
    } else {
      scroll()
    }
  }

  // Same validation rules as the server (lib/pet-order-validation.ts)
  const validation = validatePetOrderShipping({ email, fullName, addressLine1, addressLine2, city, state, postalCode })
  const clientErrors: FieldErrors = validation.ok ? {} : validation.errors
  const fieldError = (field: PetOrderField): string | undefined =>
    serverErrors[field] || (touched[field] ? clientErrors[field] : undefined)
  const markTouched = (field: PetOrderField) => setTouched(t => ({ ...t, [field]: true }))
  const fieldProps = (field: PetOrderField) => {
    const err = fieldError(field)
    return {
      onBlur: () => markTouched(field),
      'aria-invalid': err ? true : undefined,
      'aria-describedby': err ? `${field}-error` : undefined,
    }
  }
  const renderFieldError = (field: PetOrderField) => {
    const err = fieldError(field)
    return err ? <p id={`${field}-error`} className="mt-1 text-xs text-red-400">{err}</p> : null
  }

  // A server-reported field error goes away once the buyer edits the form
  useEffect(() => {
    setServerErrors({})
  }, [email, fullName, addressLine1, addressLine2, city, state, postalCode])

  // Check if form is valid
  const isFormValid = validation.ok && shippingSats !== null

  // Create order, then continue on the order page (invoice + payment status there,
  // so a refresh or reopened link resumes checkout)
  const handleCreateOrder = async () => {
    if (!validation.ok) {
      setTouched({ email: true, fullName: true, addressLine1: true, addressLine2: true, city: true, state: true, postalCode: true })
      return
    }
    if (!isFormValid) return
    
    setIsCreatingOrder(true)
    try {
      const result = await createPetOrder(validation.value.addressLine2 === null
        ? { ...validation.value, addressLine2: undefined }
        : { ...validation.value, addressLine2: validation.value.addressLine2 })

      if (result.success && result.orderNumber && result.accessToken) {
        router.push(`/satoshi-pet/order/${encodeURIComponent(result.orderNumber)}?t=${encodeURIComponent(result.accessToken)}`)
        return // keep the button disabled while navigating
      }
      setServerErrors((result.fieldErrors || {}) as FieldErrors)
      toast.error("Order Failed", { description: result.error })
    } catch (error) {
      toast.error("Order Failed", { description: "An unexpected error occurred" })
    }
    setIsCreatingOrder(false)
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
      description: "Rechargeable battery with USB-C charging - carry Bitcoin everywhere"
    },
  ]

  const faqs: { q: string; a: string }[] = [
    {
      q: "What's in the box?",
      a: "A SatoshiPet device in its case, with a rechargeable battery and USB-C charging.",
    },
    {
      q: "How do pre-orders work?",
      a: `You pay now in sats over Lightning and we ship when devices are ready. ${PREORDER_SHIP_ESTIMATE_SENTENCE} You'll get a shipping confirmation with tracking when it's on its way.`,
    },
    {
      // NEEDS OWNER CONFIRMATION: refund policy wording (draft).
      q: "Can I get a refund?",
      a: `Changed your mind before it ships? Email ${SUPPORT_EMAIL} for a refund in sats.`,
    },
    {
      q: "Where do you ship?",
      a: "We currently ship within the United States only (including Alaska and Hawaii).",
    },
    {
      q: "How do I get help?",
      a: `Email ${SUPPORT_EMAIL} and include your order number.`,
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

        @media (prefers-reduced-motion: reduce) {
          .sp-motion { animation: none !important; }
        }
      `}</style>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 shrink-0">
            <span className="w-8 h-8 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center" aria-hidden="true">
              <Cat size={18} color="white" strokeWidth={2} />
            </span>
            <span className="font-bold text-lg text-white hidden min-[400px]:inline">Satoshi Pet</span>
          </a>
          <nav className="flex items-center gap-1 sm:gap-3" aria-label="Main">
            <a
              href="#setup"
              onClick={(e) => goToSection(e, 'setup')}
              className="px-2 py-1.5 rounded-md text-sm text-gray-300 hover:text-white hover:bg-gray-800"
            >
              Setup<span className="hidden sm:inline"> Guide</span>
            </a>
            <a
              href="#diy"
              onClick={(e) => goToSection(e, 'diy')}
              className="px-2 py-1.5 rounded-md text-sm text-gray-300 hover:text-white hover:bg-gray-800 flex items-center"
            >
              <Github className="h-4 w-4 mr-1 hidden sm:inline" aria-hidden="true" />
              <span className="sm:hidden">DIY</span>
              <span className="hidden sm:inline">Build Your Own</span>
            </a>
            <Button asChild size="sm" className="bg-green-600 hover:bg-green-700 text-white">
              <a href="https://ganamos.earth/connect-pet">Connect Pet</a>
            </Button>
          </nav>
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
                      <div className="relative w-64 h-64 sm:w-80 sm:h-80" aria-hidden="true">
                        {/* Bitcoin Coins Raining - z-0 so they appear behind text */}
                        <div 
                          className="sp-motion flex absolute z-0 w-8 h-8 border-2 border-amber-400 bg-amber-50 rounded-full items-center justify-center text-sm font-bold text-amber-600"
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
                          className="sp-motion flex absolute z-0 w-8 h-8 border-2 border-amber-400 bg-amber-50 rounded-full items-center justify-center text-sm font-bold text-amber-600"
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
                          className="sp-motion flex absolute z-0 w-8 h-8 border-2 border-amber-400 bg-amber-50 rounded-full items-center justify-center text-sm font-bold text-amber-600"
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
                        <div className="sp-motion absolute inset-0 rounded-full border-2 border-purple-400/30" style={{ animation: 'pulse-ring 2s ease-out infinite' }} />
                        <div className="sp-motion absolute inset-0 rounded-full border-2 border-blue-400/30" style={{ animation: 'pulse-ring 2s ease-out infinite', animationDelay: '0.5s' }} />

                        {/* Main Circle */}
                        <div className="relative w-full h-full bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center shadow-2xl shadow-purple-500/30">
                          <div className="absolute inset-4 bg-white/10 rounded-full" />
                          <div 
                            className="sp-motion relative z-10"
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
                      <span className="relative flex h-2 w-2" aria-hidden="true">
                        <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
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
                          <Bitcoin className="h-7 w-7 text-orange-400" aria-hidden="true" />
                          {formatSatsK(DEVICE_PRICE_SATS)} sats
                        </span>
                        {PET_PREORDER_ACTIVE && (
                          <span className="text-lg text-gray-400 line-through">
                            <span className="sr-only">Regular price </span>
                            {formatSatsK(PET_DEVICE_LIST_PRICE_SATS)} sats
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-gray-400 mb-4">
                        {isLoadingPrice ? (
                          <span className="text-sm">Loading USD price...</span>
                        ) : bitcoinPrice ? (
                          <>
                            <span className="text-sm">
                              ≈ ${satsToUsd(DEVICE_PRICE_SATS)} USD
                            </span>
                            {PET_PREORDER_ACTIVE && (
                              <span className="text-xs text-gray-400">
                                (was ${satsToUsd(PET_DEVICE_LIST_PRICE_SATS)})
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">USD price unavailable</span>
                        )}
                      </div>
                      {PET_PREORDER_ACTIVE && (
                        <>
                          <div className="flex items-center gap-2 text-sm text-green-400">
                            <Check className="h-4 w-4" aria-hidden="true" />
                            <span>Save {((1 - PET_DEVICE_PREORDER_PRICE_SATS / PET_DEVICE_LIST_PRICE_SATS) * 100).toFixed(0)}% with pre-order pricing</span>
                          </div>
                          <p className="mt-2 text-sm text-gray-300">{preorderShipEstimateText()}</p>
                        </>
                      )}
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto md:mx-0">
                      <Button 
                        size="lg" 
                        className="sm:flex-1 h-14 text-lg bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => setStep('shipping')}
                      >
                        <Bitcoin className="h-5 w-5 mr-2" aria-hidden="true" />
                        {PET_PREORDER_ACTIVE ? "Pre-Order Now" : "Order Now"}
                      </Button>
                      <Button 
                        asChild
                        variant="outline" 
                        size="lg"
                        className="h-14 text-lg bg-gray-800 border-gray-600 text-white hover:bg-gray-700"
                      >
                        <a href="#diy" onClick={(e) => goToSection(e, 'diy')}>
                          <Wrench className="h-5 w-5 mr-2" aria-hidden="true" />
                          Build Your Own
                        </a>
                      </Button>
                    </div>

                    <p className="text-sm text-gray-400 mt-4 text-center md:text-left relative z-20">
                      Pay with Bitcoin Lightning <span aria-hidden="true">⚡</span> Ships within the US | <a href="https://ganamos.earth/connect-pet" className="underline hover:text-gray-300">I already have one</a>
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
                        Power on your device. It will create a WiFi network called "SatoshiPet-Setup".
                      </p>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-400" />
                          Connect to "SatoshiPet-Setup" from your phone/laptop
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
                  <Button asChild size="lg" className="h-14 bg-blue-600 hover:bg-blue-700 text-white">
                    <a href="https://github.com/brianmurray333/satoshipet-firmware/archive/refs/heads/main.zip" target="_blank" rel="noopener noreferrer">
                      <Download className="h-5 w-5 mr-2" aria-hidden="true" />
                      Download Firmware (.zip)
                    </a>
                  </Button>
                  <Button asChild size="lg" className="h-14 bg-purple-600 hover:bg-purple-700 text-white">
                    <a href="https://github.com/brianmurray333/satoshipet-firmware/raw/main/hardware/3d-models/case-v1.stl" target="_blank" rel="noopener noreferrer">
                      <Printer className="h-5 w-5 mr-2" aria-hidden="true" />
                      Download Case STL
                    </a>
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
                    <Button asChild className="w-full bg-white text-gray-900 hover:bg-gray-100">
                      <a href="https://github.com/brianmurray333/satoshipet-firmware" target="_blank" rel="noopener noreferrer">
                        <Github className="h-4 w-4 mr-2" aria-hidden="true" />
                        View Repository
                      </a>
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
                    <Button asChild variant="outline" className="w-full border-green-700 text-green-400 hover:bg-green-900/30">
                      <a href="https://github.com/brianmurray333/satoshipet-firmware/issues" target="_blank" rel="noopener noreferrer">
                        <GitPullRequest className="h-4 w-4 mr-2" aria-hidden="true" />
                        Open an Issue / PR
                      </a>
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
                    Buy Pre-Built for {formatSatsK(DEVICE_PRICE_SATS)} sats
                  </Button>
                </div>
              </div>
            </section>

            {/* Final CTA */}
            <section className="py-16 bg-gradient-to-br from-purple-600 to-blue-600 text-white">
              <div className="max-w-4xl mx-auto px-4 text-center">
                <h2 className="text-3xl font-bold mb-4">Ready to Make Bitcoin Fun?</h2>
                <p className="text-white/80 mb-8 max-w-2xl mx-auto">
                  {PET_PREORDER_ACTIVE ? "Pre-order" : "Order"} your Satoshi Pet today and start teaching the next generation about Bitcoin through play.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button 
                    size="lg" 
                    className="h-14 px-8 bg-white text-purple-600 hover:bg-gray-100"
                    onClick={() => setStep('shipping')}
                  >
                    <Bitcoin className="h-5 w-5 mr-2" />
                    {PET_PREORDER_ACTIVE ? "Pre-Order" : "Order"} for {formatSatsK(DEVICE_PRICE_SATS)} sats
                  </Button>
                </div>
              </div>
            </section>

            {/* FAQ */}
            <section id="faq" className="py-16 sm:py-24 bg-gray-900 scroll-mt-20">
              <div className="max-w-3xl mx-auto px-4">
                <h2 className="text-3xl font-bold text-center mb-10 text-white">Frequently Asked Questions</h2>
                <div className="space-y-3">
                  {faqs.map((faq) => (
                    <details key={faq.q} className="group bg-gray-800 border border-gray-700 rounded-xl p-5">
                      <summary className="cursor-pointer list-none flex items-center justify-between font-semibold text-white">
                        {faq.q}
                        <ChevronDown className="h-5 w-5 text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <p className="mt-3 text-gray-300 text-sm leading-relaxed">{faq.a}</p>
                    </details>
                  ))}
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
                type="button"
                onClick={() => setStep('landing')}
                className="flex items-center text-gray-400 hover:text-white mb-6"
              >
                <ChevronDown className="h-4 w-4 rotate-90 mr-1" aria-hidden="true" />
                Back
              </button>

              <Card className="shadow-xl bg-gray-800 border-gray-700">
                <CardContent className="p-6 sm:p-8 text-white">
                  {/* Product Summary */}
                  <div className="flex items-center gap-4 pb-6 border-b border-gray-700 mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-blue-500 rounded-2xl flex items-center justify-center shrink-0" aria-hidden="true">
                      <Cat size={32} color="white" strokeWidth={1.5} />
                    </div>
                    <div>
                      <h2 className="font-bold text-lg">Satoshi Pet</h2>
                      <p className="text-sm text-gray-400">{PET_PREORDER_ACTIVE ? "Pre-Order" : "Order"}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="font-bold">{formatSatsK(DEVICE_PRICE_SATS)} sats</p>
                      {bitcoinPrice && (
                        <p className="text-sm text-gray-400">≈ ${satsToUsd(DEVICE_PRICE_SATS)}</p>
                      )}
                    </div>
                  </div>

                  <h3 className="font-semibold mb-4">Shipping Information</h3>
                  
                  <form
                    className="space-y-4"
                    noValidate
                    onSubmit={(e) => { e.preventDefault(); handleCreateOrder() }}
                  >
                    <div>
                      <Label htmlFor="email" className="text-gray-300">Email <span aria-hidden="true">*</span></Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        required
                        aria-required="true"
                        maxLength={PET_ORDER_FIELD_LIMITS.email}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        {...fieldProps('email')}
                        placeholder="you@example.com"
                        className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                      />
                      {renderFieldError('email')}
                      <p className="mt-1 text-xs text-gray-400">We'll send your order confirmation and shipping updates here.</p>
                    </div>

                    <div>
                      <Label htmlFor="fullName" className="text-gray-300">Full Name <span aria-hidden="true">*</span></Label>
                      <Input
                        id="fullName"
                        name="name"
                        autoComplete="name"
                        required
                        aria-required="true"
                        maxLength={PET_ORDER_FIELD_LIMITS.fullName}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        {...fieldProps('fullName')}
                        placeholder="John Doe"
                        className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                      />
                      {renderFieldError('fullName')}
                    </div>

                    <div>
                      <Label htmlFor="addressLine1" className="text-gray-300">Address <span aria-hidden="true">*</span></Label>
                      <Input
                        id="addressLine1"
                        name="address-line1"
                        autoComplete="address-line1"
                        required
                        aria-required="true"
                        maxLength={PET_ORDER_FIELD_LIMITS.addressLine1}
                        value={addressLine1}
                        onChange={(e) => setAddressLine1(e.target.value)}
                        {...fieldProps('addressLine1')}
                        placeholder="123 Main St"
                        className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                      />
                      {renderFieldError('addressLine1')}
                    </div>

                    <div>
                      <Label htmlFor="addressLine2" className="text-gray-300">Apartment, suite, etc. (optional)</Label>
                      <Input
                        id="addressLine2"
                        name="address-line2"
                        autoComplete="address-line2"
                        maxLength={PET_ORDER_FIELD_LIMITS.addressLine2}
                        value={addressLine2}
                        onChange={(e) => setAddressLine2(e.target.value)}
                        {...fieldProps('addressLine2')}
                        placeholder="Apt 4B"
                        className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                      />
                      {renderFieldError('addressLine2')}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="city" className="text-gray-300">City <span aria-hidden="true">*</span></Label>
                        <Input
                          id="city"
                          name="address-level2"
                          autoComplete="address-level2"
                          required
                          aria-required="true"
                          maxLength={PET_ORDER_FIELD_LIMITS.city}
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          {...fieldProps('city')}
                          placeholder="San Francisco"
                          className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                        />
                        {renderFieldError('city')}
                      </div>
                      <div>
                        <Label htmlFor="state" className="text-gray-300">State <span aria-hidden="true">*</span></Label>
                        <select
                          id="state"
                          name="address-level1"
                          autoComplete="address-level1"
                          required
                          aria-required="true"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          {...fieldProps('state')}
                          className="mt-1 w-full h-10 px-3 rounded-md border border-gray-600 bg-gray-700 text-white text-sm"
                        >
                          <option value="">Select state</option>
                          {US_STATES.map((s) => (
                            <option key={s.code} value={s.code}>{s.name}</option>
                          ))}
                        </select>
                        {renderFieldError('state')}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="postalCode" className="text-gray-300">ZIP Code <span aria-hidden="true">*</span></Label>
                      <Input
                        id="postalCode"
                        name="postal-code"
                        autoComplete="postal-code"
                        inputMode="numeric"
                        required
                        aria-required="true"
                        pattern="\d{5}(-\d{4})?"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        {...fieldProps('postalCode')}
                        placeholder="94102"
                        className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                        maxLength={PET_ORDER_FIELD_LIMITS.postalCode}
                      />
                      {renderFieldError('postalCode')}
                    </div>

                    {/* Order Summary */}
                    <div className="mt-8 pt-6 border-t border-gray-700 space-y-3">
                      <div className="flex justify-between text-sm text-gray-300">
                        <span>Satoshi Pet{PET_PREORDER_ACTIVE ? " (Pre-Order)" : ""}</span>
                        <span>{DEVICE_PRICE_SATS.toLocaleString()} sats</span>
                      </div>
                      {PET_PREORDER_ACTIVE && (
                        <p className="text-xs text-gray-400">{preorderShipEstimateText()}</p>
                      )}
                      <div className="flex justify-between text-sm text-gray-300">
                        <span>Shipping (US)</span>
                        {isCalculatingShipping ? (
                          <span className="flex items-center text-gray-400">
                            <Loader2 className="h-3 w-3 animate-spin mr-1" aria-hidden="true" />
                            Calculating...
                          </span>
                        ) : shippingSats !== null ? (
                          <span>{shippingSats.toLocaleString()} sats</span>
                        ) : (
                          <span className="text-gray-400">Enter address</span>
                        )}
                      </div>
                      {estimatedDays && (
                        <p className="text-xs text-gray-400">Transit time after shipping: {estimatedDays}</p>
                      )}
                      <div className="flex justify-between font-bold text-lg pt-3 border-t border-gray-700">
                        <span>Total</span>
                        <div className="text-right">
                          <span>
                            {shippingSats !== null 
                              ? (DEVICE_PRICE_SATS + shippingSats).toLocaleString() 
                              : DEVICE_PRICE_SATS.toLocaleString()
                            } sats
                          </span>
                          {bitcoinPrice && shippingSats !== null && (
                            <p className="text-sm font-normal text-gray-400">
                              ≈ ${satsToUsd(DEVICE_PRICE_SATS + shippingSats)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 mt-6 bg-green-600 hover:bg-green-700"
                      disabled={!isFormValid || isCreatingOrder}
                    >
                      {isCreatingOrder ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                          Creating Order...
                        </>
                      ) : (
                        <>
                          Continue to Payment
                          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                        </>
                      )}
                    </Button>
                  </form>

                  <p className="text-xs text-center text-gray-400 mt-4">
                    You'll pay with Bitcoin Lightning on the next step.
                    {" "}See our <a href="https://www.ganamos.earth/privacy" className="underline hover:text-gray-300">Privacy Policy</a>
                    {" "}and <a href="https://www.ganamos.earth/terms" className="underline hover:text-gray-300">Terms</a>.
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
            <div className="w-6 h-6 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center" aria-hidden="true">
              <Cat size={14} color="white" strokeWidth={2} />
            </div>
            <span className="font-semibold text-white">Satoshi Pet</span>
          </div>
          <p className="text-sm mb-4">
            A product by <a href="https://ganamos.earth" className="text-white hover:underline">Ganamos</a>
          </p>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm mb-4">
            <a href="#faq" onClick={(e) => goToSection(e, 'faq')} className="hover:text-white hover:underline">FAQ</a>
            <a href="https://www.ganamos.earth/privacy" className="hover:text-white hover:underline">Privacy</a>
            <a href="https://www.ganamos.earth/terms" className="hover:text-white hover:underline">Terms</a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-white hover:underline">{SUPPORT_EMAIL}</a>
          </nav>
          <p className="text-xs">
            © {new Date().getFullYear()} Satoshi Pet. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

