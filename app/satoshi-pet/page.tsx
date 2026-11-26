"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { 
  Cat, Zap, Wifi, Check, ArrowRight, 
  ChevronDown, Loader2, CheckCircle2, Bitcoin,
  Smartphone, Link2, Github, Wrench, Cpu,
  Download, ExternalLink, ShoppingCart, Printer, GitPullRequest,
  BatteryCharging, Volume2, CircleDot, Cable
} from "lucide-react"
import { toast } from "@/components/ui/toast"
import { PetScreen } from "./pet-screen"
import { LeaderboardSection } from "./leaderboard-section"
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
  const [headerSolid, setHeaderSolid] = useState(false)
  const [gameTab, setGameTab] = useState<'flappy' | 'satcatcher'>('flappy')

  // Checkout starts at the top of the page, not wherever the landing page was scrolled to
  useEffect(() => {
    if (step === 'shipping') window.scrollTo({ top: 0 })
  }, [step])

  // Header is clear over the hero and turns solid once the page scrolls
  useEffect(() => {
    const onScroll = () => setHeaderSolid(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  
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


  const setupSteps = [
    {
      icon: <Smartphone className="h-5 w-5 text-white/40" aria-hidden="true" />,
      title: "Create Your Account",
      body: <>Go to <a href="https://ganamos.earth" className="text-[#F7931A] hover:underline">ganamos.earth</a> and sign up for a free account. This is where you&apos;ll manage your Bitcoin balance and connect with your pet.</>,
      items: ["Create a new pet (give it a name, pick a type)"],
    },
    {
      icon: <Wifi className="h-5 w-5 text-white/40" aria-hidden="true" />,
      title: "Connect Pet to WiFi",
      body: <>Power on your device. It will create a WiFi network called &quot;SatoshiPet-Setup&quot;.</>,
      items: [
        "Connect to \"SatoshiPet-Setup\" from your phone or laptop",
        "A portal will open: enter your home WiFi details",
        "The device restarts and connects to your WiFi",
      ],
    },
    {
      icon: <Link2 className="h-5 w-5 text-white/40" aria-hidden="true" />,
      title: "Pair Your Pet",
      body: <>Your device will display a 6-character pairing code on screen.</>,
      items: [
        "On ganamos.earth, go to your pet's settings",
        "Enter the pairing code to link your device",
        "Done! Your Satoshi Pet is now connected",
      ],
    },
  ]

  const diyParts = [
    { href: "https://www.amazon.com/dp/B07DKD79Y9?th=1", name: "Heltec WiFi Kit 32 V3", desc: "ESP32 board with OLED display", price: "~$18", icon: <Cpu className="h-5 w-5 text-[#F7931A]" aria-hidden="true" /> },
    { href: "https://www.amazon.com/dp/B0FMY3M1YX?th=1", name: "LiPo Battery 3.7V", desc: "1000-2000mAh with JST connector", price: "~$8", icon: <BatteryCharging className="h-5 w-5 text-[#F7931A]" aria-hidden="true" /> },
    { href: "https://www.amazon.com/dp/B01N7NHSY6", name: "Active Buzzer 5V (10 pack)", desc: "For sound effects", price: "~$6", icon: <Volume2 className="h-5 w-5 text-[#F7931A]" aria-hidden="true" /> },
    { href: "https://www.amazon.com/dp/B07GN1K4HG", name: "Tactile Buttons (pack)", desc: "Optional external button", price: "~$6", icon: <CircleDot className="h-5 w-5 text-[#F7931A]" aria-hidden="true" /> },
    { href: "https://www.amazon.com/EDGELEC-Breadboard-Optional-Assorted-Multicolored/dp/B07GD2BWPY", name: "Jumper Wires", desc: "For connecting buzzer & button", price: "~$7", icon: <Cable className="h-5 w-5 text-[#F7931A]" aria-hidden="true" /> },
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
    <div className="relative isolate min-h-screen text-white">
      {/* Starfield behind the whole page (same galaxy as the link preview) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-20 bg-[#05060b] bg-cover bg-center"
        style={{ backgroundImage: "url(/satoshi-pet/space.jpg)" }}
      />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[#05060b]/55" />

      <style jsx global>{`
        @keyframes sp-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sp-rise { animation: sp-rise 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        .sp-glow-text { text-shadow: 0 0 28px rgba(247, 147, 26, 0.55); }
        @media (prefers-reduced-motion: reduce) {
          .sp-rise { animation: none; }
        }
      `}</style>

      {/* Header: clear over the hero, solid once scrolled */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${
          headerSolid || step !== 'landing'
            ? 'bg-[#05060b]/85 backdrop-blur-md border-b border-white/10'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 shrink-0">
            <img src="/images/bitcoin-logo.png" alt="" width={28} height={28} className="h-7 w-7 drop-shadow-[0_0_10px_rgba(247,147,26,0.6)]" />
            <span className="font-bold text-lg tracking-tight hidden md:inline">Satoshi Pet</span>
          </a>
          <nav className="flex items-center gap-0.5 sm:gap-3" aria-label="Main">
            <a
              href="#setup"
              onClick={(e) => goToSection(e, 'setup')}
              className="px-2 py-1.5 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10"
            >
              Setup
            </a>
            <a
              href="#leaderboard"
              onClick={(e) => goToSection(e, 'leaderboard')}
              className="px-2 py-1.5 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10"
            >
              Leaderboard
            </a>
            <a
              href="#diy"
              onClick={(e) => goToSection(e, 'diy')}
              aria-label="Open source"
              className="px-2 py-1.5 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10 flex items-center"
            >
              <Github className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
              <span className="hidden sm:inline">Open source</span>
            </a>
            <Button asChild size="sm" variant="outline" className="ml-1 border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white">
              <a href="https://ganamos.earth/connect-pet">
                <Cat className="h-4 w-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
                Connect Pet
              </a>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {step === 'landing' && (
          <>
            {/* Hero: the device turning in space */}
            <section className="relative isolate overflow-hidden md:min-h-[min(86svh,820px)] md:flex md:items-center">
              <div className="relative -z-10 aspect-[4/5] w-full md:absolute md:inset-0 md:aspect-auto" aria-hidden="true">
                {/* Still frame underneath: shows before the video starts and for reduced motion */}
                <picture>
                  <source media="(min-width: 768px)" srcSet="/satoshi-pet/hero-desktop.jpg" />
                  <img src="/satoshi-pet/hero-mobile.jpg" alt="" className="absolute inset-0 h-full w-full object-cover md:object-[80%_50%]" />
                </picture>
                <video
                  className="absolute inset-0 h-full w-full object-cover md:object-[80%_50%] motion-reduce:hidden"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  tabIndex={-1}
                >
                  <source media="(min-width: 768px)" src="/satoshi-pet/hero-desktop.mp4" type="video/mp4" />
                  <source src="/satoshi-pet/hero-mobile.mp4" type="video/mp4" />
                </video>
                {/* Fade into the page: bottom on phones, left behind the text on wider screens */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#05060b] via-[#05060b]/70 to-transparent md:hidden" />
                <div className="absolute inset-0 hidden md:block bg-gradient-to-r from-[#05060b]/90 via-[#05060b]/35 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 hidden h-40 md:block bg-gradient-to-t from-[#05060b] to-transparent" />
              </div>

              <div className="relative w-full max-w-6xl mx-auto px-4 -mt-44 pb-14 md:mt-0 md:pt-28 md:pb-24">
                <div className="max-w-xl">
                  <h1 className="sp-rise text-[2.3rem] leading-[1.05] sm:text-5xl lg:text-6xl font-bold tracking-tight text-balance">
                    A pocket pet that lives <span className="text-[#F7931A] sp-glow-text">on Bitcoin.</span>
                  </h1>
                  <p className="sp-rise mt-5 text-lg text-white/70 max-w-md" style={{ animationDelay: '160ms' }}>
                    It reacts when you earn and spend sats, plays games, and makes Bitcoin something the whole family can hold.
                  </p>

                  {/* Price */}
                  <div className="sp-rise mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1" style={{ animationDelay: '240ms' }}>
                    <span className="text-4xl font-bold tabular-nums flex items-center gap-2">
                      <img src="/images/bitcoin-logo.png" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
                      {formatSatsK(DEVICE_PRICE_SATS)} sats
                    </span>
                    {PET_PREORDER_ACTIVE && (
                      <span className="text-lg text-white/45 line-through tabular-nums">
                        <span className="sr-only">Regular price </span>
                        {formatSatsK(PET_DEVICE_LIST_PRICE_SATS)} sats
                      </span>
                    )}
                    <span className="basis-full text-sm text-white/60 tabular-nums">
                      {isLoadingPrice
                        ? 'Loading USD price...'
                        : bitcoinPrice
                          ? <>≈ ${satsToUsd(DEVICE_PRICE_SATS)} USD{PET_PREORDER_ACTIVE && <> · was ${satsToUsd(PET_DEVICE_LIST_PRICE_SATS)}</>}</>
                          : 'USD price unavailable'}
                    </span>
                    {PET_PREORDER_ACTIVE && (
                      <span className="basis-full text-sm text-white/60">
                        <span className="text-[#F7931A]">Save {((1 - PET_DEVICE_PREORDER_PRICE_SATS / PET_DEVICE_LIST_PRICE_SATS) * 100).toFixed(0)}% with pre-order pricing.</span>
                      </span>
                    )}
                  </div>

                  {/* CTAs */}
                  <div className="sp-rise mt-7 flex flex-col sm:flex-row gap-3" style={{ animationDelay: '320ms' }}>
                    <Button
                      size="lg"
                      className="h-14 px-8 text-lg font-semibold bg-[#F7931A] text-[#1d1100] hover:bg-[#ffa94d] shadow-[0_0_40px_rgba(247,147,26,0.35)]"
                      onClick={() => setStep('shipping')}
                    >
                      <Zap className="h-5 w-5 mr-2" aria-hidden="true" />
                      {PET_PREORDER_ACTIVE ? "Pre-Order Now" : "Order Now"}
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="lg"
                      className="h-14 px-8 text-lg border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white backdrop-blur-sm"
                    >
                      <a href="#diy" onClick={(e) => goToSection(e, 'diy')}>
                        <Wrench className="h-5 w-5 mr-2" aria-hidden="true" />
                        Build Your Own
                      </a>
                    </Button>
                  </div>

                  <p className="sp-rise text-sm text-white/55 mt-5" style={{ animationDelay: '400ms' }}>
                    Pay with Bitcoin Lightning · Ships within the US
                  </p>
                </div>
              </div>
            </section>

            {/* How it works: the pet's own screen, in a render of the device */}
            <section className="py-16 sm:py-24">
              <div className="max-w-5xl mx-auto px-4 flex flex-col gap-20 sm:gap-28">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance text-center">
                  A pet that runs on real work, real play and real sats
                </h2>

                <div className="flex flex-col items-center gap-6 text-center">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#F7931A]">Earn</p>
                    <h3 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">Jobs keep it alive</h3>
                    <p className="mt-3 text-white/65 max-w-md mx-auto">Kids earn sats doing jobs posted in Ganamos. Every sat lands on the pet, and pays for its food.</p>
                  </div>
                  <PetScreen mode="home" label="The pet's home screen, then a new job alert" className="w-full max-w-4xl" />
                </div>

                <div className="flex flex-col items-center gap-6 text-center">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#F7931A]">Play</p>
                    <h3 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">Games keep it happy</h3>
                    <p className="mt-3 text-white/65 max-w-md mx-auto">Playing makes the pet happy. Play solo, or with friends for real sats: winner takes the pot.</p>
                  </div>
                  <div className="flex gap-2" role="tablist" aria-label="Games">
                    {([["flappy", "Flappy Pet"], ["satcatcher", "Sat Catcher"]] as const).map(([id, name]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={gameTab === id}
                        onClick={() => setGameTab(id)}
                        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                          gameTab === id ? "bg-[#F7931A] text-[#1d1100]" : "bg-white/5 text-white/70 ring-1 ring-white/15 hover:bg-white/10"
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <PetScreen
                    key={gameTab}
                    mode={gameTab}
                    label={gameTab === "flappy" ? "Play Flappy Pet: tap to flap" : "Play Sat Catcher: tap to turn around"}
                    className="w-full max-w-4xl -mt-2"
                  />
                </div>

                <div className="flex flex-col items-center gap-6 text-center">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#F7931A]">Care</p>
                    <h3 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">Food keeps it fed</h3>
                    <p className="mt-3 text-white/65 max-w-md mx-auto">Feed it a few times a day with the coins it earned. Forget, and it gets sad.</p>
                  </div>
                  <PetScreen mode="feed" label="The food menu, then the pet eating" className="w-full max-w-4xl" />
                </div>
              </div>
            </section>

            <LeaderboardSection />

            {/* Setup Guide */}
            <section ref={setupRef} id="setup" className="py-16 sm:py-24 scroll-mt-20">
              <div className="max-w-3xl mx-auto px-4">
                <div className="text-center mb-12">
                  <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Setup Guide</h2>
                  <p className="text-white/60">Get your Satoshi Pet connected in minutes</p>
                </div>

                <ol className="relative space-y-10 before:absolute before:left-6 before:top-3 before:bottom-3 before:w-px before:bg-gradient-to-b before:from-[#F7931A]/60 before:to-white/10">
                  {setupSteps.map((s, i) => (
                    <li key={s.title} className="relative flex gap-6">
                      <div className="relative z-10 flex-shrink-0 w-12 h-12 rounded-full bg-[#0b0c12] ring-1 ring-[#F7931A]/50 text-[#F7931A] flex items-center justify-center font-bold text-lg shadow-[0_0_20px_rgba(247,147,26,0.25)]">
                        {i + 1}
                      </div>
                      <div className="pt-1.5 min-w-0">
                        <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                          {s.icon}
                          {s.title}
                        </h3>
                        <p className="text-white/60 mb-3">{s.body}</p>
                        <ul className="space-y-2 text-sm text-white/60">
                          {s.items.map((item) => (
                            <li key={item} className="flex items-start gap-2">
                              <Check className="h-4 w-4 mt-0.5 shrink-0 text-[#F7931A]" aria-hidden="true" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="mt-12 text-center">
                  <Button
                    size="lg"
                    className="h-14 px-8 font-semibold bg-[#F7931A] text-[#1d1100] hover:bg-[#ffa94d]"
                    onClick={() => setStep('shipping')}
                  >
                    Get Your Satoshi Pet
                    <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </section>

            {/* Build Your Own */}
            <section id="diy" className="py-16 sm:py-24 scroll-mt-20 border-y border-white/10 bg-white/[0.02]">
              <div className="max-w-5xl mx-auto px-4">
                <div className="text-center mb-12">
                  <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/15 bg-white/5 text-white/80 text-sm font-medium mb-4">
                    <Github className="h-4 w-4" aria-hidden="true" />
                    100% open source
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Build Your Own Satoshi Pet</h2>
                  <p className="text-white/60 max-w-2xl mx-auto">
                    Don&apos;t want to wait? Build one yourself. The firmware and hardware designs are open source:
                    order the parts, print the case, flash the code, and you&apos;re ready to go.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 mb-10 max-w-2xl mx-auto">
                  <Button asChild size="lg" className="h-14 font-semibold bg-white text-[#05060b] hover:bg-white/90">
                    <a href="https://github.com/brianmurray333/satoshipet-firmware/archive/refs/heads/main.zip" target="_blank" rel="noopener noreferrer">
                      <Download className="h-5 w-5 mr-2" aria-hidden="true" />
                      Download Firmware (.zip)
                    </a>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-14 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                    <a href="https://github.com/brianmurray333/satoshipet-firmware/raw/main/hardware/3d-models/case-v1.stl" target="_blank" rel="noopener noreferrer">
                      <Printer className="h-5 w-5 mr-2" aria-hidden="true" />
                      Download Case STL
                    </a>
                  </Button>
                </div>

                {/* Parts List */}
                <div className="rounded-2xl border border-white/10 bg-[#0b0c12]/80 overflow-hidden mb-6">
                  <div className="p-6 border-b border-white/10">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5 text-[#F7931A]" aria-hidden="true" />
                      Parts List (~$30-40 total)
                    </h3>
                    <p className="text-white/60 text-sm mt-1">Everything you need from Amazon.</p>
                  </div>
                  <ul className="divide-y divide-white/10">
                    {diyParts.map((part) => (
                      <li key={part.name}>
                        <a
                          href={part.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-4 p-4 hover:bg-white/5 transition-colors"
                        >
                          <span className="flex items-center gap-4 min-w-0">
                            <span className="w-10 h-10 shrink-0 rounded-lg bg-white/5 ring-1 ring-white/10 flex items-center justify-center">
                              {part.icon}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-medium">{part.name}</span>
                              <span className="block text-sm text-white/55">{part.desc}</span>
                            </span>
                          </span>
                          <span className="flex items-center gap-2 text-[#F7931A] shrink-0">
                            <span className="text-sm font-medium tabular-nums">{part.price}</span>
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                        <Github className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <div>
                        <h3 className="font-bold">View on GitHub</h3>
                        <p className="text-sm text-white/55">Full source code & docs</p>
                      </div>
                    </div>
                    <p className="text-white/60 text-sm mb-4">Arduino firmware, wiring diagrams and setup instructions.</p>
                    <Button asChild className="w-full bg-white text-[#05060b] hover:bg-white/90">
                      <a href="https://github.com/brianmurray333/satoshipet-firmware" target="_blank" rel="noopener noreferrer">
                        <Github className="h-4 w-4 mr-2" aria-hidden="true" />
                        View Repository
                      </a>
                    </Button>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-[#F7931A]/10 ring-1 ring-[#F7931A]/30 flex items-center justify-center">
                        <GitPullRequest className="h-6 w-6 text-[#F7931A]" aria-hidden="true" />
                      </div>
                      <div>
                        <h3 className="font-bold">Contribute</h3>
                        <p className="text-sm text-white/55">Help us improve</p>
                      </div>
                    </div>
                    <p className="text-white/60 text-sm mb-4">Have a better case design or a code improvement? We welcome issues and pull requests.</p>
                    <Button asChild variant="outline" className="w-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                      <a href="https://github.com/brianmurray333/satoshipet-firmware/issues" target="_blank" rel="noopener noreferrer">
                        <GitPullRequest className="h-4 w-4 mr-2" aria-hidden="true" />
                        Open an Issue / PR
                      </a>
                    </Button>
                  </div>
                </div>

                <p className="mt-6 text-center text-sm text-white/55">
                  DIY builds connect to the same Ganamos platform as official devices, with no restrictions.
                  <br />
                  <span className="text-white/40">Licensed under Apache 2.0 (code) and CERN-OHL-P v2 (hardware)</span>
                </p>

                <div className="mt-8 text-center">
                  <p className="text-white/50 text-sm mb-4">Prefer a pre-assembled device?</p>
                  <Button
                    size="lg"
                    className="h-14 px-8 font-semibold bg-[#F7931A] text-[#1d1100] hover:bg-[#ffa94d]"
                    onClick={() => setStep('shipping')}
                  >
                    <Zap className="h-5 w-5 mr-2" aria-hidden="true" />
                    Buy Pre-Built for {formatSatsK(DEVICE_PRICE_SATS)} sats
                  </Button>
                </div>
              </div>
            </section>

            {/* Final CTA */}
            <section className="relative overflow-hidden py-20 sm:py-28">
              <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(247,147,26,0.20),transparent_60%)]" />
              <div className="max-w-3xl mx-auto px-4 text-center">
                <img src="/images/bitcoin-logo.png" alt="" width={56} height={56} className="mx-auto mb-6 h-14 w-14 drop-shadow-[0_0_24px_rgba(247,147,26,0.7)]" />
                <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4 text-balance">Ready to make Bitcoin fun?</h2>
                <p className="text-white/65 mb-8 max-w-xl mx-auto">
                  {PET_PREORDER_ACTIVE ? "Pre-order" : "Order"} your Satoshi Pet today and start teaching the next generation about Bitcoin through play.
                </p>
                <Button
                  size="lg"
                  className="h-14 px-8 text-lg font-semibold bg-[#F7931A] text-[#1d1100] hover:bg-[#ffa94d] shadow-[0_0_40px_rgba(247,147,26,0.35)]"
                  onClick={() => setStep('shipping')}
                >
                  <Zap className="h-5 w-5 mr-2" aria-hidden="true" />
                  {PET_PREORDER_ACTIVE ? "Pre-Order" : "Order"} for {formatSatsK(DEVICE_PRICE_SATS)} sats
                </Button>
              </div>
            </section>

            {/* FAQ */}
            <section id="faq" className="py-16 sm:py-24 scroll-mt-20">
              <div className="max-w-3xl mx-auto px-4">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-10">Frequently Asked Questions</h2>
                <div className="space-y-3">
                  {faqs.map((faq) => (
                    <details key={faq.q} className="group rounded-xl border border-white/10 bg-white/[0.04] p-5">
                      <summary className="cursor-pointer list-none flex items-center justify-between gap-4 font-semibold">
                        {faq.q}
                        <ChevronDown className="h-5 w-5 shrink-0 text-white/50 transition-transform group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <p className="mt-3 text-white/70 text-sm leading-relaxed">{faq.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {/* Shipping Form Step */}
        {step === 'shipping' && (
          <section className="min-h-screen pt-24 pb-8 sm:pt-32 sm:pb-16">
            <div className="max-w-lg mx-auto px-4">
              <button 
                type="button"
                onClick={() => setStep('landing')}
                className="flex items-center text-gray-400 hover:text-white mb-6"
              >
                <ChevronDown className="h-4 w-4 rotate-90 mr-1" aria-hidden="true" />
                Back
              </button>

              <Card className="shadow-xl bg-[#0b0c12]/90 border-white/10 backdrop-blur-md">
                <CardContent className="p-6 sm:p-8 text-white">
                  {/* Product Summary */}
                  <div className="flex items-center gap-4 pb-6 border-b border-gray-700 mb-6">
                    <img src="/satoshi-pet/hero-mobile.jpg" alt="" width={64} height={64} className="w-16 h-16 rounded-2xl object-cover object-[50%_45%] ring-1 ring-white/10 shrink-0" />
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
                      className="w-full h-12 mt-6 font-semibold bg-[#F7931A] text-[#1d1100] hover:bg-[#ffa94d]"
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
      <footer className="border-t border-white/10 text-white/55 py-10">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src="/images/bitcoin-logo.png" alt="" width={22} height={22} className="h-[22px] w-[22px]" />
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
