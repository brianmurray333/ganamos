"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { createDonationInvoice } from "@/app/actions/donation-actions"
import { QRCodeSVG } from "qrcode.react"
import { LocationInput } from "@/components/location-input"
import { MapView } from "@/components/map-view"
import { Heart, Bitcoin, Copy, Eye, EyeOff } from "lucide-react"
import { createBrowserSupabaseClient } from "@/lib/supabase"

interface DonationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preSelectedLocation?: string | null
}

declare global {
  interface Window {
    google: any
  }
}

export function DonationModal({ open, onOpenChange, preSelectedLocation }: DonationModalProps) {
  const [step, setStep] = useState<"location" | "map" | "invoice" | "success">(preSelectedLocation ? "map" : "location")
  const [locationName, setLocationName] = useState("")
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedBounds, setSelectedBounds] = useState<google.maps.LatLngBounds | null>(null)
  const [paymentRequest, setPaymentRequest] = useState("")
  const [selectedAmount, setSelectedAmount] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(false)
  const [showFullPaymentRequest, setShowFullPaymentRequest] = useState(false)
  const [posts, setPosts] = useState<any[]>([])
  const [isLoadingPosts, setIsLoadingPosts] = useState(false)

  const donationAmounts = [
    { label: "1K sats", value: 1000 },
    { label: "10K sats", value: 10000 },
    { label: "100K sats", value: 100000 },
  ]

  const fetchPosts = async () => {
    setIsLoadingPosts(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false })
        .eq("fixed", false)
        .neq("under_review", true)

      if (error) {
        console.error("Error fetching posts:", error)
        // No mock data fallback - just use empty array
        setPosts([])
      } else {
        setPosts(data || [])
      }
    } catch (error) {
      console.error("Error fetching posts:", error)
      // No mock data fallback - just use empty array
      setPosts([])
    } finally {
      setIsLoadingPosts(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchPosts()
    }
  }, [open])

  useEffect(() => {
    if (preSelectedLocation && open) {
      setLocationName(preSelectedLocation)
      // For pre-selected locations, we'll use a default center point
      // The actual city bounds will be handled by the map view
      setSelectedLocation({ lat: 0, lng: 0 }) // Placeholder coordinates
      setSelectedBounds(null)
    }
  }, [preSelectedLocation, open])

  const handleLocationChange = (value: string, placeDetails?: google.maps.places.PlaceResult) => {
    console.log("Location changed:", value, placeDetails)
    setLocationName(value)

    if (placeDetails?.geometry?.location) {
      const lat = placeDetails.geometry.location.lat()
      const lng = placeDetails.geometry.location.lng()
      console.log("Setting coordinates:", lat, lng)
      setSelectedLocation({ lat, lng })

      // Store bounds for smart zoom
      if (placeDetails.geometry.viewport) {
        setSelectedBounds(placeDetails.geometry.viewport)
      } else if (placeDetails.geometry.bounds) {
        setSelectedBounds(placeDetails.geometry.bounds)
      } else {
        setSelectedBounds(null)
      }
    } else {
      console.log("No coordinates in place details")
      setSelectedLocation(null)
      setSelectedBounds(null)
    }
  }

  const handleContinue = () => {
    console.log("Continue clicked. Location:", locationName, "Coordinates:", selectedLocation)
    if (locationName && selectedLocation) {
      console.log("Transitioning to map step")
      setStep("map")
    } else {
      console.log("Cannot continue - missing location or coordinates")
    }
  }

  const handleDonationClick = async (amount: number) => {
    setSelectedAmount(amount)
    setIsLoading(true)

    try {
      const result = await createDonationInvoice({
        amount,
        locationType: "city",
        locationName,
      })

      if (result.success) {
        setPaymentRequest(result.paymentRequest!)
        setStep("invoice")
      } else {
        console.error(result.error)
      }
    } catch (error) {
      console.error("Error creating donation:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setStep(preSelectedLocation ? "map" : "location")
    setLocationName(preSelectedLocation || "")
    setSelectedLocation(preSelectedLocation ? { lat: 0, lng: 0 } : null)
    setSelectedBounds(null)
    setPaymentRequest("")
    setSelectedAmount(0)
  }

  const handleClose = () => {
    resetForm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-100 rounded-full">
              <Heart className="w-5 h-5 text-orange-600" />
            </div>
            <DialogTitle>Donate Bitcoin to Support Your Community</DialogTitle>
          </div>
          <p className="text-sm text-gray-600">
            Your donation will boost rewards for community issues in your chosen location.
          </p>
        </DialogHeader>

        {step === "location" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="location">Choose Location</Label>
              <LocationInput
                value={locationName}
                onChange={handleLocationChange}
                placeholder="Search for a city, neighborhood, or region..."
              />
            </div>
            <Button onClick={handleContinue} disabled={!locationName || !selectedLocation} className="w-full">
              Continue
            </Button>
          </div>
        )}

        {step === "map" && selectedLocation && (
          <div className="space-y-4">
            <div className="h-64 w-full rounded-lg overflow-hidden">
              {console.log("Rendering map with:", selectedLocation, "bounds:", selectedBounds)}
              <MapView
                posts={posts}
                center={selectedLocation}
                bounds={selectedBounds}
                onClose={() => {}}
                isLoading={isLoadingPosts}
                isModal={true}
                initialSearchQuery={locationName}
              />
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Choose Donation Amount</h3>
              <div className="grid grid-cols-3 gap-3">
                {donationAmounts.map((amount) => (
                  <Button
                    key={amount.value}
                    onClick={() => handleDonationClick(amount.value)}
                    disabled={isLoading}
                    variant="outline"
                    className="flex items-center gap-2 h-16"
                  >
                    <Bitcoin className="w-4 h-4" />
                    {amount.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === "invoice" && (
          <div className="space-y-4 text-center">
            <p>Scan this QR code with your Lightning wallet:</p>
            <div className="flex justify-center">
              <QRCodeSVG value={paymentRequest} size={200} />
            </div>
            <div className="flex items-center gap-2 text-xs bg-gray-100 p-2 rounded">
              <div className="flex-1 font-mono">
                {showFullPaymentRequest
                  ? paymentRequest
                  : `${paymentRequest.slice(0, 20)}...${paymentRequest.slice(-20)}`}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFullPaymentRequest(!showFullPaymentRequest)}
                className="h-6 w-6 p-0"
              >
                {showFullPaymentRequest ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigator.clipboard.writeText(paymentRequest)}
                className="h-6 w-6 p-0"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-sm text-gray-600">
              Donating {selectedAmount.toLocaleString()} sats to {locationName}
            </p>
            <Button onClick={() => setStep("success")} variant="outline">
              I've Paid
            </Button>
          </div>
        )}

        {step === "success" && (
          <div className="text-center space-y-4">
            <div className="text-green-600 text-lg font-semibold">Thank you for your donation!</div>
            <p>
              Your {selectedAmount.toLocaleString()} sats will help boost community fixes in {locationName}.
            </p>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm mb-3">Want to be notified when your donation helps fix an issue?</p>
              <div className="flex gap-2 justify-center">
                <Button asChild>
                  <a href="/auth/register">Create Account</a>
                </Button>
                <Button variant="outline" onClick={handleClose}>
                  No Thanks
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
