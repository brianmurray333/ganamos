"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Loader2, X, RefreshCw, MapPin, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Post } from "@/lib/types"
import { formatSatsValue, formatTimeAgo } from "@/lib/utils"

interface MapModalProps {
  isOpen: boolean
  onClose: () => void
  posts: Post[]
  centerPost?: Post // Optional post to center the map on
}

// Declare google as a global type to avoid linting errors
declare global {
  interface Window {
    google?: any
  }
}

export function MapModal({ isOpen, onClose, posts, centerPost }: MapModalProps) {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null)
  const [mapInitialized, setMapInitialized] = useState(false)
  const [loadingStep, setLoadingStep] = useState<string>("Initializing...")
  const [selectedPost, setSelectedPost] = useState<Post | null>(centerPost || null)

  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [showResults, setShowResults] = useState(false)
  const [autocompleteService, setAutocompleteService] = useState<google.maps.places.AutocompleteService | null>(null)
  const [placesService, setPlacesService] = useState<google.maps.places.PlacesService | null>(null)

  // Filter posts that have location data
  const postsWithLocation = posts.filter(
    (post) => post.latitude && post.longitude && !isNaN(Number(post.latitude)) && !isNaN(Number(post.longitude)),
  )

  // Initialize map when modal opens
  useEffect(() => {
    if (!isOpen || mapInitialized) return

    console.log("Map modal opened, starting initialization...")
    setIsLoading(true)
    setLocationError(null)
    setLoadingStep("Loading map library...")

    loadGoogleMaps()
  }, [isOpen, mapInitialized])

  // Load Google Maps with better error handling
  const loadGoogleMaps = async () => {
    try {
      console.log("Starting Google Maps loading process...")

      // Check if already loaded
      if (window.google && window.google.maps) {
        console.log("Google Maps already loaded")
        setLoadingStep("Initializing map...")
        initializeMap()
        return
      }

      // Load Google Maps JavaScript API
      console.log("Loading Google Maps JavaScript API...")
      setLoadingStep("Loading map components...")

      await new Promise<void>((resolve, reject) => {
        // Check if script already exists
        const existingScript = document.querySelector('script[src*="maps.googleapis.com"]')
        if (existingScript) {
          existingScript.remove()
        }

        const script = document.createElement("script")
        script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`
        script.async = true
        script.defer = true

        script.onload = () => {
          console.log("Google Maps script loaded successfully")
          // Give it a moment to initialize
          setTimeout(() => {
            if (window.google && window.google.maps) {
              console.log("Google Maps is available")
              resolve()
            } else {
              console.error("Google Maps loaded but not available")
              reject(new Error("Google Maps failed to initialize"))
            }
          }, 100)
        }

        script.onerror = (error) => {
          console.error("Failed to load Google Maps script:", error)
          reject(new Error("Failed to load map library"))
        }

        // Add timeout
        setTimeout(() => {
          reject(new Error("Script loading timeout"))
        }, 10000)

        document.head.appendChild(script)
        console.log("Google Maps script element added to DOM")
      })

      console.log("Google Maps loaded, initializing map...")
      setLoadingStep("Setting up map...")
      initializeMap()
    } catch (error) {
      console.error("Error loading Google Maps:", error)
      setLocationError(`Failed to load map: ${error instanceof Error ? error.message : "Unknown error"}`)
      setIsLoading(false)
    }
  }

  // Initialize the map
  const initializeMap = () => {
    console.log("Initializing map...")

    if (!window.google || !window.google.maps) {
      console.error("Google Maps is not available")
      setLocationError("Map library not loaded properly")
      setIsLoading(false)
      return
    }

    if (!mapRef.current) {
      console.error("Map container ref is not available")
      setLocationError("Map container not ready")
      setIsLoading(false)
      return
    }

    if (mapInstance) {
      console.log("Map instance already exists")
      return
    }

    try {
      console.log("Creating map instance...")
      setLoadingStep("Creating map...")

      // Determine center location
      let defaultCenter = { lat: 37.7749, lng: -122.4194 } // Default fallback

      // If we have a centerPost, use its location
      if (centerPost && centerPost.latitude && centerPost.longitude) {
        defaultCenter = { lat: Number(centerPost.latitude), lng: Number(centerPost.longitude) }
        console.log("Centering map on specific post:", defaultCenter)
      } else if (postsWithLocation.length > 0) {
        // Otherwise use first post with location
        const firstPost = postsWithLocation[0]
        defaultCenter = { lat: Number(firstPost.latitude), lng: Number(firstPost.longitude) }
      }

      // Create map instance
      const map = new window.google.maps.Map(mapRef.current, {
        center: defaultCenter,
        zoom: 15, // Higher zoom when centering on specific location
        mapTypeId: window.google.maps.MapTypeId.ROADMAP,
        zoomControl: true,
        mapTypeControl: false,
        scaleControl: true,
        streetViewControl: false,
        rotateControl: false,
        fullscreenControl: false,
      })

      console.log("Map instance created")

      setMapInstance(map)
      setMapInitialized(true)

      // Initialize Places services
      const autoService = new window.google.maps.places.AutocompleteService()
      const placeService = new window.google.maps.places.PlacesService(map)
      setAutocompleteService(autoService)
      setPlacesService(placeService)

      // Add click listener to map to deselect markers
      map.addListener("click", () => {
        setSelectedPost(null)
        setShowResults(false)
      })

      // Skip user location and go straight to adding post markers
      addPostMarkers(map)
      setIsLoading(false)
    } catch (error) {
      console.error("Error initializing map:", error)
      setLocationError(`Failed to create map: ${error instanceof Error ? error.message : "Unknown error"}`)
      setIsLoading(false)
    }
  }

  // Format sats for pin display (simplified version)
  const formatSatsForPin = (sats: number): string => {
    if (sats === 0) return "0"
    if (sats < 1000) return sats.toString()

    const inK = sats / 1000
    if (inK === Math.floor(inK)) {
      return `${Math.floor(inK)}k`
    }
    return `${inK.toFixed(1)}k`.replace(".0k", "k")
  }

  // Create custom Airbnb-style oval marker icon
  const createCustomMarkerIcon = (post: Post, isSelected: boolean) => {
    const rewardText = formatSatsForPin(post.reward)
    const backgroundColor = isSelected ? "#FEF3C7" : "#ffffff"
    const textColor = isSelected ? "#000000" : "#000000"
    const bitcoinColor = "#F7931A"
    const borderColor = "#d1d5db"

    // Calculate width based on text length with proper padding
    const textWidth = rewardText.length * 7 + 12 // Approximate width calculation with more right padding
    const totalWidth = 24 + textWidth // Bitcoin symbol + text + padding

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg width="${totalWidth}" height="32" viewBox="0 0 ${totalWidth} 32" xmlns="http://www.w3.org/2000/svg">
        <!-- Oval background with shadow -->
        <rect x="1" y="1" width="${totalWidth - 2}" height="30" rx="15" ry="15" 
              fill="${backgroundColor}" 
              stroke="#F7931A" 
              strokeWidth="1" />
        <!-- Bitcoin symbol - adjusted position and size -->
        <text x="12" y="20" textAnchor="middle" fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif" fontSize="8" fontWeight="900" fill="${bitcoinColor}">₿</text>
        <!-- Reward amount - adjusted position -->
        <text x="24" y="20" fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif" fontSize="12" fontWeight="500" fill="${textColor}">${rewardText}</text>
      </svg>
    `)}`,
      scaledSize: new window.google.maps.Size(totalWidth, 32),
      anchor: new window.google.maps.Point(totalWidth / 2, 16),
    }
  }

  // Format date for preview card
  const formatPostDate = (post: Post) => {
    try {
      if (!post.createdAt && !post.created_at) return "Recently"
      const date = new Date(post.createdAt || post.created_at)
      if (isNaN(date.getTime())) return "Recently"
      return formatTimeAgo(date)
    } catch (error) {
      return "Recently"
    }
  }

  // Add markers for posts with location data
  const addPostMarkers = (map: google.maps.Map) => {
    if (!map || !window.google) {
      console.error("Map or Google Maps not available for adding post markers")
      return
    }

    console.log(`Adding ${postsWithLocation.length} post markers...`)

    if (postsWithLocation.length === 0) {
      console.log("No posts with location data")
      return
    }

    // Store markers for updating their styles
    const markers: { [key: string]: google.maps.Marker } = {}

    // Add markers for all posts with location
    postsWithLocation.forEach((post, index) => {
      const postLoc = { lat: Number(post.latitude), lng: Number(post.longitude) }
      const isSelected = selectedPost && post.id === selectedPost.id

      const marker = new window.google.maps.Marker({
        position: postLoc,
        map: map,
        title: post.title || "Issue",
        icon: createCustomMarkerIcon(post, isSelected),
      })

      markers[post.id] = marker

      // Add click listener to marker
      marker.addListener("click", (e: any) => {
        e.stop() // Prevent map click event
        setSelectedPost(post)

        // Update all marker styles
        postsWithLocation.forEach((p) => {
          const isNowSelected = p.id === post.id
          markers[p.id].setIcon(createCustomMarkerIcon(p, isNowSelected))
        })
      })

      console.log(`Added marker ${index + 1} for post: ${post.title}`)
    })

    // Update markers when selectedPost changes
    const updateMarkerStyles = () => {
      postsWithLocation.forEach((post) => {
        const isSelected = selectedPost && post.id === selectedPost.id
        if (markers[post.id]) {
          markers[post.id].setIcon(createCustomMarkerIcon(post, isSelected))
        }
      })
    }

    // Call updateMarkerStyles when selectedPost changes
    updateMarkerStyles()
  }

  // Handle search input
  const handleSearchInput = (query: string) => {
    setSearchQuery(query)

    if (!query.trim() || !autocompleteService) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    autocompleteService.getPlacePredictions(
      {
        input: query,
        types: ["establishment", "geocode"],
      },
      (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSearchResults(predictions)
          setShowResults(true)
        } else {
          setSearchResults([])
          setShowResults(false)
        }
      },
    )
  }

  // Handle place selection
  const handlePlaceSelect = (placeId: string, description: string) => {
    if (!placesService || !mapInstance) return

    placesService.getDetails({ placeId }, (place, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
        mapInstance.setCenter(place.geometry.location)
        mapInstance.setZoom(15)
        setSearchQuery(description)
        setShowResults(false)
      }
    })
  }

  // Handle preview card click
  const handlePreviewCardClick = () => {
    if (selectedPost) {
      onClose()
      router.push(`/post/${selectedPost.id}`)
    }
  }

  // Handle preview card close
  const handlePreviewCardClose = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click
    setSelectedPost(null)
  }

  // Retry loading the map
  const retryMapLoad = () => {
    console.log("Retrying map load...")
    setIsLoading(true)
    setLocationError(null)
    setMapInitialized(false)
    setMapInstance(null)
    setLoadingStep("Retrying...")
    loadGoogleMaps()
  }

  // Clean up when modal closes
  useEffect(() => {
    if (!isOpen && mapInstance) {
      console.log("Cleaning up map instance...")
      setMapInstance(null)
      setMapInitialized(false)
      setSelectedPost(null)
      setLocationError(null)
      setIsLoading(true)
    }
  }, [isOpen, mapInstance])

  // Update marker styles when selectedPost changes
  useEffect(() => {
    if (mapInstance && mapInitialized) {
      // This will trigger a re-render of markers with updated styles
      addPostMarkers(mapInstance)
    }
  }, [selectedPost])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] p-0">
        <DialogHeader className="absolute top-4 right-4 z-50 flex flex-row items-center gap-2">
          <DialogTitle className="sr-only">Issue Locations Map</DialogTitle>
          <DialogDescription className="sr-only">
            Map showing locations of community issues and your current location
          </DialogDescription>
          <Button
            variant="outline"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-white hover:bg-gray-50 shadow-lg border-gray-200 text-gray-600 hover:text-gray-800"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {/* Search Bar */}
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 w-80 max-w-[calc(100vw-2rem)]">
          <div className="relative">
            <input
              type="text"
              placeholder="Search here"
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              className="w-full px-4 py-3 pr-10 rounded-full bg-white shadow-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent caret-gray-900"
            />

            {/* Clear button */}
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("")
                  setSearchResults([])
                  setShowResults(false)
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
              >
                <X className="w-3 h-3 text-gray-600" />
              </button>
            )}

            {/* Search Results Dropdown */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute top-full mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-60 overflow-y-auto z-10">
                {searchResults.map((result) => (
                  <button
                    key={result.place_id}
                    onClick={() => handlePlaceSelect(result.place_id, result.description)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-sm"
                  >
                    <div className="font-medium text-gray-900">{result.structured_formatting.main_text}</div>
                    <div className="text-gray-500 text-xs">{result.structured_formatting.secondary_text}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="h-[80vh] w-full relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-40">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                <span>{loadingStep}</span>
              </div>
            </div>
          )}

          {locationError && (
            <div className="absolute top-4 left-4 z-50 bg-white/90 dark:bg-gray-800/90 p-3 rounded-lg shadow-md max-w-xs">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm mb-2">{locationError}</p>
                  <Button variant="outline" size="sm" onClick={retryMapLoad} className="w-full text-xs">
                    <RefreshCw className="h-3 w-3 mr-1" /> Try Again
                  </Button>
                </div>
              </div>
            </div>
          )}

          {mapInitialized && postsWithLocation.length === 0 && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-40">
              <div className="text-center p-4 max-w-xs">
                <MapPin className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p className="font-medium mb-2">No issues with location data</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  None of the current issues have location information attached.
                </p>
              </div>
            </div>
          )}

          <div ref={mapRef} className="h-full w-full rounded-lg overflow-hidden" />

          {/* Airbnb-style Preview Card */}
          {selectedPost && (
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[30rem] max-w-[calc(100vw-2rem)]">
              <div
                className="bg-white rounded-xl shadow-lg p-3 cursor-pointer hover:shadow-xl transition-shadow relative"
                onClick={handlePreviewCardClick}
              >
                {/* Close button */}
                <button
                  onClick={handlePreviewCardClose}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors z-10"
                >
                  <X className="w-3 h-3 text-gray-600" />
                </button>

                <div className="flex gap-3">
                  <img
                    src={selectedPost.imageUrl || selectedPost.image_url || "/placeholder.svg"}
                    alt="Issue"
                    className="w-16 h-16 rounded-lg object-cover bg-gray-100 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0 pr-6">
                    <p className="font-medium text-sm text-gray-900 line-clamp-2 mb-2">
                      {selectedPost.description || "No description available"}
                    </p>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="font-semibold text-orange-500">₿</span>
                      <span className="font-medium text-xs text-gray-700">{formatSatsValue(selectedPost.reward)}</span>
                    </div>
                    <div className="text-xs text-gray-500">{formatPostDate(selectedPost)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
