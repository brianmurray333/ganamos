"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { MapPin, Sprout, Loader2, MapPin as DropPin, CheckCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LocationInput } from "@/components/location-input"
import { createDonationInvoice, checkDonationPayment } from "@/app/actions/donation-actions"
import { getLocationRecommendations } from "@/app/actions/location-actions"
import { getCurrentLocationWithName } from "@/lib/geocoding"
import { BitcoinLogo } from "@/components/bitcoin-logo"
import QRCode from "@/components/qr-code"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Copy } from "lucide-react"
import { formatSatsValue } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import Image from "next/image"

interface RecommendedLocation {
  name: string
  type: string
  emoji: string
  openIssues: number
  locationType: string
  locationName: string
}

function Stepper({ currentStep }: { currentStep: number }) {
  const stepLabels = [
    "Donation Amount",
    "Pick Location",
    "Pay Invoice"
  ];

  // Use Tailwind's 'bg-primary' for the active dot to match the button
  return (
    <div className="flex flex-col items-center my-4">
      <div className={`font-light pb-2 ${currentStep === 1 ? "text-white text-lg" : "text-xs text-emerald-600"}`}
        style={currentStep === 1 ? { fontSize: '1rem' } : {}}>
        {stepLabels[currentStep - 1]}
      </div>
      {/* Dots will be rendered below the button, not here */}
    </div>
  );
}

export default function DonatePage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedAmount, setSelectedAmount] = useState<number>(10000)
  const [showKeypad, setShowKeypad] = useState(false)
  const [bitcoinPrice, setBitcoinPrice] = useState<number | null>(null)
  const [isPriceLoading, setIsPriceLoading] = useState(true)
  const [recommendedLocations, setRecommendedLocations] = useState<RecommendedLocation[]>([])
  const [selectedLocation, setSelectedLocation] = useState<RecommendedLocation | null>(null)
  const [customLocation, setCustomLocation] = useState("")
  const [customLocationDetails, setCustomLocationDetails] = useState<any | null>(null)
  const [isLoadingLocations, setIsLoadingLocations] = useState(true)
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false)
  const [invoiceData, setInvoiceData] = useState<{ paymentRequest: string; poolId: string; amount: number } | null>(null)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [paymentHash, setPaymentHash] = useState<string>("")
  const [isCheckingPayment, setIsCheckingPayment] = useState(false)
  const [paymentDetected, setPaymentDetected] = useState(false)
  const [showFullPaymentRequest, setShowFullPaymentRequest] = useState(false)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const googleMapRef = useRef<any>(null)
  const polygonRef = useRef<any>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    async function fetchBitcoinPrice() {
      try {
        const response = await fetch("/api/bitcoin-price")
        
        if (response.ok) {
          const data = await response.json()
          if (data.price && typeof data.price === 'number') {
            setBitcoinPrice(data.price)
          } else {
            setBitcoinPrice(null)
          }
        } else {
          setBitcoinPrice(null)
        }
      } catch (error) {
        console.warn("Failed to fetch Bitcoin price:", error)
        setBitcoinPrice(null)
      } finally {
        setIsPriceLoading(false)
      }
    }
    fetchBitcoinPrice()
  }, [])

  // Reset donation flow state
  const resetDonationFlow = () => {
    setSelectedAmount(10000)
    setShowKeypad(false)
    setSelectedLocation(null)
    setCustomLocation("")
    setCustomLocationDetails(null)
    setInvoiceData(null)
    setPaymentHash("")
    setIsCheckingPayment(false)
    setPaymentDetected(false)
    setShowInvoiceModal(false)
    setShowFullPaymentRequest(false)
  }

  // Remove default location selection on mount
  useEffect(() => {
    async function loadLocationRecommendations() {
      try {
        setIsLoadingLocations(true)
        let userLocation = undefined
        try {
          const currentLocation = await getCurrentLocationWithName({ useCache: true })
          if (currentLocation) {
            userLocation = {
              locality: currentLocation.locality,
              admin_area_1: currentLocation.admin_area_1,
              country: currentLocation.country,
              country_code: currentLocation.country_code,
            }
          }
        } catch (error) {
          console.log("Could not get user location, using global recommendations")
        }
        const recommendations = await getLocationRecommendations(userLocation)
        setRecommendedLocations(recommendations)
        // Do NOT set any location as selected by default
        // setSelectedLocation(null)
      } catch (error) {
        const fallback = {
          name: "Global",
          type: "global",
          emoji: "🌎",
          openIssues: 0,
          locationType: "global",
          locationName: "Global",
        }
        setRecommendedLocations([fallback])
        // Do NOT set any location as selected by default
      } finally {
        setIsLoadingLocations(false)
      }
    }
    loadLocationRecommendations()
  }, [])

  // Initialize or update Google Map and polygon when location changes
  useEffect(() => {
    if (!mapRef.current || typeof window === "undefined" || !window.google) return
    if (!selectedLocation && !customLocationDetails) return

    // Initialize map if not already
    if (!googleMapRef.current) {
      googleMapRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 37.7749, lng: -122.4194 },
        zoom: 4,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      })
    }
    const map = googleMapRef.current

    // Determine bounds and polygon
    let bounds: any = null
    let paths: any[] = []
    if (selectedLocation) {
      if (selectedLocation.type === "global") {
        // World bounds
        bounds = new window.google.maps.LatLngBounds(
          { lat: -85, lng: -180 },
          { lat: 85, lng: 180 }
        )
        paths = [
          { lat: 85, lng: -180 },
          { lat: 85, lng: 180 },
          { lat: -85, lng: 180 },
          { lat: -85, lng: -180 },
        ]
      } else if (selectedLocation.type === "country") {
        // Continental US bounds
        bounds = new window.google.maps.LatLngBounds(
          { lat: 24.396308, lng: -125.0 },
          { lat: 49.384358, lng: -66.93457 }
        )
        paths = [
          { lat: 49.384358, lng: -125.0 },
          { lat: 49.384358, lng: -66.93457 },
          { lat: 24.396308, lng: -66.93457 },
          { lat: 24.396308, lng: -125.0 },
        ]
      } else {
        // For state/city, use a small bounding box around a placeholder center
        const center = { lat: 34, lng: -118 }
        bounds = new window.google.maps.LatLngBounds(
          { lat: center.lat - 0.2, lng: center.lng - 0.2 },
          { lat: center.lat + 0.2, lng: center.lng + 0.2 }
        )
        paths = [
          { lat: center.lat + 0.2, lng: center.lng - 0.2 },
          { lat: center.lat + 0.2, lng: center.lng + 0.2 },
          { lat: center.lat - 0.2, lng: center.lng + 0.2 },
          { lat: center.lat - 0.2, lng: center.lng - 0.2 },
        ]
      }
    } else if (customLocationDetails && customLocationDetails.geometry && customLocationDetails.geometry.location) {
      const center = {
        lat: customLocationDetails.geometry.location.lat(),
        lng: customLocationDetails.geometry.location.lng(),
      }
      bounds = new window.google.maps.LatLngBounds(
        { lat: center.lat - 0.1, lng: center.lng - 0.1 },
        { lat: center.lat + 0.1, lng: center.lng + 0.1 }
      )
      paths = [
        { lat: center.lat + 0.1, lng: center.lng - 0.1 },
        { lat: center.lat + 0.1, lng: center.lng + 0.1 },
        { lat: center.lat - 0.1, lng: center.lng + 0.1 },
        { lat: center.lat - 0.1, lng: center.lng - 0.1 },
      ]
    }
    if (bounds) {
      map.fitBounds(bounds)
    }

    // Remove previous polygon
    if (polygonRef.current) {
      polygonRef.current.setMap(null)
    }
    // Draw new polygon with green outline
    polygonRef.current = new window.google.maps.Polygon({
      paths,
      strokeColor: "#22c55e", // Tailwind emerald-500
      strokeOpacity: 1,
      strokeWeight: 3,
      fillColor: "#22c55e",
      fillOpacity: 0.05,
    })
    polygonRef.current.setMap(map)
  }, [selectedLocation, customLocationDetails])

  // Payment polling effect
  useEffect(() => {
    if (step === 3 && paymentHash && !paymentDetected) {
      setIsCheckingPayment(true)

      const pollPayment = async () => {
        try {
          const result = await checkDonationPayment(paymentHash)

          if (result.success && result.settled) {
            setPaymentDetected(true)
            setIsCheckingPayment(false)

            // Stop polling
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }

            // Show success toast
            toast.success("✅ Payment Received!", {
              description: `Thank you for your ${formatSatsValue(invoiceData?.amount || 0)} donation!`,
            })
          } else if (result.error) {
            console.error("Payment check error:", result.error)
          }
        } catch (error) {
          console.error("Error polling for payment:", error)
        }
      }

      pollingIntervalRef.current = setInterval(pollPayment, 3000) // Poll every 3 seconds

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
        }
      }
    }
  }, [step, paymentHash, paymentDetected, invoiceData])

  const handleAmountSelect = (amount: number) => {
    setSelectedAmount(amount)
    setShowKeypad(false)
  }

  const handleCustomAmountChange = (value: string) => {
    const amount = parseInt(value, 10)
    setSelectedAmount(isNaN(amount) ? 0 : amount)
  }

  const handleLocationSelect = (location: RecommendedLocation) => {
    setSelectedLocation(location)
    setCustomLocation("")
    setCustomLocationDetails(null)
  }

  const handleCustomLocationChange = (value: string, placeDetails?: any) => {
    setCustomLocation(value)
    setCustomLocationDetails(placeDetails || null)
    setSelectedLocation(null)
  }

  const handleDonate = async () => {
    if (!selectedAmount) return

    let locationType = ""
    let locationName = ""

    if (selectedLocation) {
      locationType = selectedLocation.locationType
      locationName = selectedLocation.locationName
    } else if (customLocationDetails) {
      locationType = "place"
      locationName = customLocationDetails.formatted_address || customLocation
    } else if (customLocation) {
      locationType = "place"
      locationName = customLocation
    } else {
      return
    }

    setIsCreatingInvoice(true)

    try {
      const result = await createDonationInvoice({
        amount: selectedAmount,
        locationType,
        locationName,
      })

      if (result.success) {
        setInvoiceData({
          paymentRequest: result.paymentRequest!,
          poolId: result.poolId!,
          amount: selectedAmount,
        })
        setPaymentHash(result.paymentHash!)
        setStep(3)
        setShowInvoiceModal(true)
      } else {
        console.error("Failed to create donation invoice:", result.error)
      }
    } catch (error) {
      console.error("Error creating donation invoice:", error)
    } finally {
      setIsCreatingInvoice(false)
    }
  }

  const canDonate = selectedAmount && selectedAmount > 0 && (selectedLocation || customLocation)

  const calculateUsdValue = (sats: number) => {
    if (!bitcoinPrice) return null
    const btcAmount = sats / 100000000
    const usdValue = btcAmount * bitcoinPrice
    return usdValue.toFixed(2)
  }

  // Step 1: Choose Amount
  const renderStep1 = () => (
    <div className="container px-4 py-6 mx-auto max-w-md">
      <div className="space-y-6">
        <div className="text-center mb-6">
          <h2 className="text-white text-lg font-light">Donation Amount</h2>
        </div>
        
        <div className="flex flex-col items-center space-y-4 py-6">
          <div className="flex items-center justify-between w-full max-w-xs">
            <button
              type="button"
              onClick={() => {
                setSelectedAmount(Math.max(0, selectedAmount - 500))
              }}
              className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-800"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-600 dark:text-gray-300"
              >
                <path d="M5 12h14" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setShowKeypad(!showKeypad)}
              className="w-32 text-center hover:opacity-80 transition-opacity"
            >
              <span className="text-5xl font-light text-gray-900 dark:text-white">
                {selectedAmount === 0 ? "0" : formatSatsValue(selectedAmount).replace(" sats", "").replace(".0", "")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedAmount(selectedAmount + 500)}
              className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-600 dark:text-gray-300"
              >
                <path d="M12 5v14m-7-7h14" />
              </svg>
            </button>
          </div>

          <div className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
            <div className="w-4 h-4 relative">
              <Image
                src="/images/bitcoin-logo.png"
                alt="Bitcoin"
                width={16}
                height={16}
                className="object-contain"
              />
            </div>
            <span>sats to donate</span>
          </div>

          {/* Reserve space for USD conversion to prevent layout shift */}
          <div className="h-4 flex items-center justify-center">
            <p className={`text-xs text-gray-500 dark:text-gray-400 transition-opacity duration-300 ${bitcoinPrice && calculateUsdValue(selectedAmount) ? 'opacity-100' : 'opacity-0'}`}>
              {bitcoinPrice && calculateUsdValue(selectedAmount) && `$${calculateUsdValue(selectedAmount)} USD`}
            </p>
          </div>

          {showKeypad && (
            <div className="w-full max-w-xs pt-4">
              <Input
                type="number"
                value={selectedAmount}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                placeholder="Enter amount"
                className="w-full px-4 py-3 text-center text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                min="0"
                autoFocus
              />
            </div>
          )}
        </div>

        <Button
          onClick={() => setStep(2)}
          disabled={!selectedAmount || selectedAmount === 0}
          className="w-full h-12"
          size="lg"
        >
          Next: Choose Location
        </Button>
        {/* Dots below the button */}
        <div className="flex justify-center space-x-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full ${step === s ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"}`}
            ></div>
          ))}
        </div>
      </div>
    </div>
  );

  // Step 2: Choose Location
  const renderStep2 = () => (
    <div className="container px-4 py-6 mx-auto max-w-md">
      <div className="space-y-6">
        <div className="text-center mb-6 relative">
          <button
            onClick={() => setStep(1)}
            className="absolute left-0 top-1/2 transform -translate-y-1/2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-white text-lg font-light">Pick Location</h2>
        </div>
        
        {/* Primary location search */}
        <div className="mb-6">
          <LocationInput
            value={customLocation}
            onChange={handleCustomLocationChange}
            placeholder="Search for a location..."
            className="w-full"
            autoFocus
          />
        </div>
        
        {/* Compact list of suggested places */}
        <div className="space-y-2 mb-6">
          <div className="text-xs text-gray-500 dark:text-gray-500 mb-3">Suggested locations:</div>
          
          {/* Current City */}
          {recommendedLocations.find((loc) => loc.type === "locality") && (
            <button
              onClick={() => {
                const city = recommendedLocations.find((loc) => loc.type === "locality")
                if (city) {
                  setSelectedLocation(city)
                  setCustomLocation("")
                  setCustomLocationDetails(null)
                }
              }}
              className={`w-full flex items-center justify-between p-2 rounded-lg border transition-colors hover:bg-accent hover:text-accent-foreground ${selectedLocation?.type === "locality" ? "ring-2 ring-primary bg-accent" : ""}`}
            >
              <div className="flex items-center">
                <span className="text-sm mr-3">🏙️</span>
                <div className="text-sm text-gray-600 dark:text-gray-400">{recommendedLocations.find((loc) => loc.type === "locality")?.name}</div>
              </div>
              <div className="text-xs text-gray-500">{recommendedLocations.find((loc) => loc.type === "locality")?.openIssues || 0} issues</div>
            </button>
          )}
          
          {/* State/Province */}
          {recommendedLocations.find((loc) => loc.type === "admin_1") && (
            <button
              onClick={() => {
                const state = recommendedLocations.find((loc) => loc.type === "admin_1")
                if (state) {
                  setSelectedLocation(state)
                  setCustomLocation("")
                  setCustomLocationDetails(null)
                }
              }}
              className={`w-full flex items-center justify-between p-2 rounded-lg border transition-colors hover:bg-accent hover:text-accent-foreground ${selectedLocation?.type === "admin_1" ? "ring-2 ring-primary bg-accent" : ""}`}
            >
              <div className="flex items-center">
                <span className="text-sm mr-3">🏛️</span>
                <div className="text-sm text-gray-600 dark:text-gray-400">{recommendedLocations.find((loc) => loc.type === "admin_1")?.name}</div>
              </div>
              <div className="text-xs text-gray-500">{recommendedLocations.find((loc) => loc.type === "admin_1")?.openIssues || 0} issues</div>
            </button>
          )}
          
          {/* Country */}
          {recommendedLocations.find((loc) => loc.type === "country") && (
            <button
              onClick={() => {
                const country = recommendedLocations.find((loc) => loc.type === "country")
                if (country) {
                  setSelectedLocation(country)
                  setCustomLocation("")
                  setCustomLocationDetails(null)
                }
              }}
              className={`w-full flex items-center justify-between p-2 rounded-lg border transition-colors hover:bg-accent hover:text-accent-foreground ${selectedLocation?.type === "country" && selectedLocation?.name === recommendedLocations.find((loc) => loc.type === "country")?.name ? "ring-2 ring-primary bg-accent" : ""}`}
            >
              <div className="flex items-center">
                <span className="text-sm mr-3">{recommendedLocations.find((loc) => loc.type === "country")?.emoji || "🏳️"}</span>
                <div className="text-sm text-gray-600 dark:text-gray-400">{recommendedLocations.find((loc) => loc.type === "country")?.name}</div>
              </div>
              <div className="text-xs text-gray-500">{recommendedLocations.find((loc) => loc.type === "country")?.openIssues || 0} issues</div>
            </button>
          )}
          
          {/* Global */}
          <button
            onClick={() => {
              setSelectedLocation({
                name: "Global",
                type: "global",
                emoji: "🌎",
                openIssues: recommendedLocations.find((loc) => loc.type === "global")?.openIssues || 0,
                locationType: "global",
                locationName: "Global",
              })
              setCustomLocation("")
              setCustomLocationDetails(null)
            }}
            className={`w-full flex items-center justify-between p-2 rounded-lg border transition-colors hover:bg-accent hover:text-accent-foreground ${selectedLocation?.type === "global" && selectedLocation?.name === "Global" ? "ring-2 ring-primary bg-accent" : ""}`}
          >
            <div className="flex items-center">
              <span className="text-sm mr-3">🌎</span>
              <div className="text-sm text-gray-600 dark:text-gray-400">Global</div>
            </div>
            <div className="text-xs text-gray-500">{recommendedLocations.find((loc) => loc.type === "global")?.openIssues || 0} issues</div>
          </button>
        </div>
        <Button
          className="w-full h-12"
          onClick={handleDonate}
          disabled={!(selectedLocation || customLocationDetails) || isCreatingInvoice}
          size="lg"
        >
          {isCreatingInvoice ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating Invoice...
            </>
          ) : (
            "Next: Create Invoice"
          )}
        </Button>
        {/* Dots below the button */}
        <div className="flex justify-center space-x-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full ${step === s ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"}`}
            ></div>
          ))}
        </div>
      </div>
    </div>
  )

  // Step 3: Lightning Invoice (reuse existing logic)
  const renderStep3 = () => (
    <div className="container px-4 py-6 mx-auto max-w-md flex flex-col items-center justify-center">
      <div className="text-center mb-6 relative w-full">
        <button
          onClick={() => setStep(2)}
          className="absolute left-0 top-1/2 transform -translate-y-1/2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-white text-lg font-light">Pay Invoice</h2>
      </div>
      <div className="space-y-6 w-full flex flex-col items-center">
        {invoiceData ? (
          <>
            {paymentDetected ? (
              // Payment Success State
              <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg text-center">
                <div className="flex justify-center mb-4">
                  <span className="text-6xl">
                    {selectedLocation?.emoji || "🌍"}
                  </span>
                </div>
                <h3 className="text-lg font-semibold mb-2">Payment Confirmed ✅</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Your {formatSatsValue(selectedAmount || 0)} donation to {selectedLocation?.name || customLocation} has been received.
                </p>
                <Button
                  className="w-full h-12 mt-2"
                  size="lg"
                  onClick={() => {
                    // Route to map page, passing location if possible
                    if (selectedLocation) {
                      window.location.href = `/map?locationType=${encodeURIComponent(selectedLocation.locationType)}&locationName=${encodeURIComponent(selectedLocation.locationName)}`
                    } else if (customLocation) {
                      window.location.href = `/map?locationType=place&locationName=${encodeURIComponent(customLocation)}`
                    } else {
                      window.location.href = "/map"
                    }
                  }}
                >
                  See Map
                </Button>
              </div>
            ) : (
              // Payment Pending State
              <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
                <div className="text-center mb-4">
                  <div className="flex items-center justify-center mb-2">
                    <BitcoinLogo className="w-6 h-6 mr-2" />
                    <span className="text-2xl font-bold">{formatSatsValue(selectedAmount || 0)}</span>
                  </div>
                  <p className="text-sm text-gray-600">Donation to {selectedLocation?.name || customLocation}</p>
                </div>
                
                {/* QR Code */}
                <div className="flex justify-center mb-4">
                  <QRCode data={invoiceData.paymentRequest} size={200} />
                </div>

                {/* Payment Request */}
                <div className="mb-4">
                  <div className="relative">
                    <div 
                      className="flex items-center justify-between p-2 border rounded-md bg-blue-50 dark:bg-blue-900/20 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                      onClick={() => setShowFullPaymentRequest(!showFullPaymentRequest)}
                    >
                      <div className="flex-1 font-mono text-xs truncate">
                        {showFullPaymentRequest 
                          ? invoiceData.paymentRequest
                          : `${invoiceData.paymentRequest.slice(0, 20)}...${invoiceData.paymentRequest.slice(-20)}`
                        }
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-2 h-6 w-6 p-0 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(invoiceData.paymentRequest)
                          toast.success("Invoice copied", {
                            description: "Lightning invoice copied to clipboard",
                          })
                        }}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    {showFullPaymentRequest && (
                      <Textarea
                        value={invoiceData.paymentRequest}
                        readOnly
                        className="font-mono text-xs h-20 resize-none mt-2"
                      />
                    )}
                  </div>
                </div>
                
                {/* Payment Status */}
                <div className="text-center">
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                    {isCheckingPayment && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></div>
                    {isCheckingPayment ? "Checking payment..." : "Waiting for payment"}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-4" />
            <p className="text-gray-500">Generating your Lightning invoice...</p>
          </div>
        )}
        {/* Dots below the content */}
        <div className="flex justify-center space-x-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full ${step === s ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"}`}
            ></div>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center">
      {/* Close button in upper right */}
      <div className="w-full max-w-md px-4 pt-4 flex justify-end">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/map")}
          className="rounded-full"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      {/* Sprout icon at the top */}
      <div className="w-full flex justify-center pb-2">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
          <Sprout className="w-8 h-8 text-green-600" strokeWidth={1.5} />
        </div>
      </div>
      {/* Header and subhead always visible */}
      <div className="w-full max-w-md px-4 pb-2 pt-4">
        <h1 className="text-2xl font-bold text-center mb-2">Fund Cleanups with Bitcoin</h1>
        <p className="text-center text-muted-foreground text-sm">
           Donations boost rewards and speed up clean ups
        </p>
        <Separator className="mt-4" />
      </div>
      {/* Step content */}
      <div className="w-full max-w-md flex-1 flex flex-col">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  )
}
