"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { X, RefreshCw, AlertCircle, Heart, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Post } from "@/lib/types"
import { formatSatsValue, formatTimeAgo } from "@/lib/utils"
import { useAuth } from "@/components/auth-provider"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { DonationModal } from "@/components/donation-modal"

const containerStyle = {
  width: "100%",
  height: "calc(100vh - 4rem)",
}

const defaultCenter = {
  lat: 37.7749,
  lng: -122.4194,
}

const defaultZoom = 13

// Update the MapViewProps interface to include userLocation
interface MapViewProps {
  posts: Post[]
  centerPost?: Post // Optional post to center the map on
  center?: { lat: number; lng: number } // Custom center coordinates
  bounds?: google.maps.LatLngBounds // Optional bounds to fit the map to
  onClose: () => void
  isLoading?: boolean
  isModal?: boolean // Flag to indicate if map is in a modal
  initialSearchQuery?: string // Initial search query to populate the search bar
  userLocation?: {
    latitude: number
    longitude: number
    zoomType: string
    name: string
    bounds?: google.maps.LatLngBounds
    lat: number
    lng: number
  } | null
  cityName?: string | null
  cityBounds?: {
    north: number
    south: number
    east: number
    west: number
  } | null
}

// Declare google as a global type to avoid linting errors
declare global {
  interface Window {
    google?: any
  }
}

// Update the function parameters to include userLocation
export function MapView({
  posts,
  centerPost,
  center,
  bounds,
  onClose,
  isLoading: externalLoading,
  isModal = false,
  initialSearchQuery = "",
  userLocation,
  cityName,
  cityBounds,
}: MapViewProps) {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null)
  const [mapInitialized, setMapInitialized] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(centerPost || null)
  const markersRef = useRef<{ [key: string]: any }>({})
  const PostMarkerClassRef = useRef<any>(null)

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery)
  const [searchResults, setSearchResults] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [showResults, setShowResults] = useState(false)
  const [autocompleteService, setAutocompleteService] = useState<google.maps.places.AutocompleteService | null>(null)
  const [placesService, setPlacesService] = useState<google.maps.places.PlacesService | null>(null)
  const [mapCenter, setMapCenter] = useState(
    userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : defaultCenter,
  )
  const [zoom, setZoom] = useState(defaultZoom)
  const { user } = useAuth()
  const supabase = createBrowserSupabaseClient()
  const googleMapRef = useRef<google.maps.Map | null>(null)
  const [allPosts, setAllPosts] = useState<Post[]>(posts)
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false)

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      googleMapRef.current = map
      setMapInstance(map)

      // If we have city bounds, fit the map to those bounds
      if (cityBounds) {
        const bounds = new google.maps.LatLngBounds(
          { lat: cityBounds.south, lng: cityBounds.west },
          { lat: cityBounds.north, lng: cityBounds.east },
        )
        map.fitBounds(bounds)
      }
      // Otherwise if we have user location, center on that
      else if (userLocation) {
        map.setCenter({ lat: userLocation.latitude, lng: userLocation.longitude })
        map.setZoom(12)
      }

      // Set city name in search if available
      if (cityName) {
        setSearchQuery(cityName)
      }
    },
    [userLocation, cityBounds, cityName],
  )

  const onUnmount = useCallback(() => {
    setMapInstance(null)
  }, [])

  useEffect(() => {
    const fetchPosts = async () => {
      setIsLoading(true)
      try {
        if (supabase) {
          const { data, error } = await supabase
            .from("posts")
            .select("*")
            .eq("fixed", false)
            .neq("under_review", true) // Add this line
            .order("created_at", { ascending: false })
          if (error) {
            console.error("Error fetching posts:", error)
            setAllPosts([])
          } else {
            setAllPosts(data || [])
          }
        } else {
          setAllPosts([])
        }
      } catch (error) {
        console.error("Error in fetchPosts:", error)
        setAllPosts([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchPosts()
  }, [supabase])

  useEffect(() => {
    if (mapInstance && userLocation) {
      // If we have city bounds, fit the map to those bounds
      if (cityBounds) {
        const bounds = new google.maps.LatLngBounds(
          { lat: cityBounds.south, lng: cityBounds.west },
          { lat: cityBounds.north, lng: cityBounds.east },
        )
        mapInstance.fitBounds(bounds)
      } else {
        // Otherwise just center on user location
        mapInstance.setCenter({ lat: userLocation.latitude, lng: userLocation.longitude })
        mapInstance.setZoom(defaultZoom)
      }
    }
  }, [mapInstance, userLocation, cityBounds])

  const handleMarkerClick = (post: Post) => {
    setSelectedPost(post)
  }

  const handleInfoWindowClose = () => {
    setSelectedPost(null)
  }

  const handleViewPost = () => {
    if (selectedPost) {
      router.push(`/post/${selectedPost.id}`)
    }
  }

  const handleNewPost = () => {
    router.push("/post/new")
  }

  const handleDonationClick = () => {
    setIsDonationModalOpen(true)
  }

  // Debug log for posts prop
  console.log("MapView received posts:", posts)

  // Filter posts that have location data
  const postsWithLocation = allPosts.filter(
    (post) => post.latitude && post.longitude && !isNaN(Number(post.latitude)) && !isNaN(Number(post.longitude)),
  )

  // Debug log for filtered posts
  console.log("Posts with location data:", postsWithLocation)
  postsWithLocation.forEach((post, index) => {
    console.log(`Post ${index} location:`, {
      id: post.id,
      lat: post.latitude,
      lng: post.longitude,
      type: typeof post.latitude,
      isValid: !isNaN(Number(post.latitude)) && !isNaN(Number(post.longitude)),
    })
  })

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

  // Initialize map when component mounts
  useEffect(() => {
    if (mapInitialized) return

    console.log("Map view mounted, starting initialization...")
    setIsLoading(true)
    setLocationError(null)

    loadGoogleMaps()
  }, [mapInitialized])

  // Add a separate effect to update markers when posts change
  useEffect(() => {
    if (mapInstance && mapInitialized && PostMarkerClassRef.current && postsWithLocation.length > 0) {
      console.log("Posts changed, updating markers...")
      addPostMarkers(mapInstance)
    }
  }, [allPosts, mapInstance, mapInitialized])

  // Create PostMarker class after Google Maps is loaded
  const createPostMarkerClass = () => {
    if (!window.google || !window.google.maps) {
      console.error("Cannot create PostMarker class - Google Maps not available")
      return null
    }

    console.log("Creating PostMarker class...")

    // Custom PostMarker class that extends OverlayView
    return class PostMarker extends window.google.maps.OverlayView {
      private position: google.maps.LatLng
      private containerDiv: HTMLDivElement
      private post: Post
      private map: google.maps.Map
      private isSelected: boolean
      private onClick: (post: Post) => void
      private markerId: string
      private isClickable: boolean
      private animationDelay: number

      constructor(
        post: Post,
        map: google.maps.Map,
        isSelected: boolean,
        onClick: (post: Post) => void,
        isClickable = true,
        animationDelay = 0,
      ) {
        super()
        this.post = post
        this.markerId = post.id
        this.isClickable = isClickable
        this.animationDelay = animationDelay * 100 // 100ms stagger between markers
        console.log(`Creating marker for post ${post.id} at ${post.latitude},${post.longitude}`)

        this.position = new window.google.maps.LatLng(Number(post.latitude), Number(post.longitude))
        this.isSelected = isSelected
        this.onClick = onClick
        this.map = map

        // Create container div for the marker
        this.containerDiv = document.createElement("div")
        this.containerDiv.className = "post-marker-container"
        this.containerDiv.style.position = "absolute"
        this.containerDiv.style.userSelect = "none"
        this.containerDiv.style.zIndex = "1"

        // Set cursor based on clickability
        this.containerDiv.style.cursor = this.isClickable ? "pointer" : "default"

        // Debug attribute to help identify in DOM
        this.containerDiv.setAttribute("data-marker-id", post.id)

        // Add click event listener only if clickable
        if (this.isClickable) {
          this.containerDiv.addEventListener("click", (e) => {
            e.stopPropagation()
            console.log(`Marker ${post.id} clicked`)
            this.onClick(this.post)
          })
        }

        // Set the overlay's map
        console.log(`Setting map for marker ${post.id}`)
        this.setMap(map)
      }

      // Called when the overlay is added to the map
      onAdd() {
        console.log(`onAdd called for marker ${this.markerId}`)
        // Create the marker content
        this.updateContent()

        // Add the element to the overlay pane
        const panes = this.getPanes()
        if (!panes) {
          console.error(`No panes available for marker ${this.markerId}`)
          return
        }

        // Use overlayMouseTarget for all markers to ensure visibility
        const targetPane = panes.overlayMouseTarget
        targetPane.appendChild(this.containerDiv)
        console.log(`Marker ${this.markerId} added to DOM in overlayMouseTarget`)
      }

      // Called when the overlay's position should be drawn
      draw() {
        console.log(`draw called for marker ${this.markerId}`)
        // Transform the position to pixel coordinates
        const projection = this.getProjection()
        if (!projection) {
          console.error(`No projection available for marker ${this.markerId}`)
          return
        }

        const point = projection.fromLatLngToDivPixel(this.position)
        if (point) {
          console.log(`Positioning marker ${this.markerId} at pixel coordinates:`, point)
          // Adjust positioning to center the marker (44px width / 2 = 22px)
          this.containerDiv.style.left = point.x - 22 + "px" // Center horizontally (44px / 2)
          this.containerDiv.style.top = point.y - 22 + "px" // Center vertically (44px / 2)

          // Make sure the marker is visible
          this.containerDiv.style.display = "block"
        } else {
          console.error(`Could not get pixel coordinates for marker ${this.markerId}`)
        }
      }

      // Called when the overlay is removed from the map
      onRemove() {
        console.log(`onRemove called for marker ${this.markerId}`)
        if (this.containerDiv.parentElement) {
          this.containerDiv.parentElement.removeChild(this.containerDiv)
          console.log(`Marker ${this.markerId} removed from DOM`)
        }
      }

      // Update the marker's selected state
      setSelected(isSelected: boolean) {
        console.log(`Setting marker ${this.markerId} selected state to ${isSelected}`)
        this.isSelected = isSelected
        this.updateContent()
      }

      // Format sats for display
      private formatSatsForPin(sats: number): string {
        if (sats === 0) return "0"
        if (sats < 1000) return sats.toString()

        const inK = sats / 1000
        if (inK === Math.floor(inK)) {
          return `${Math.floor(inK)}k`
        }
        return `${inK.toFixed(1)}k`.replace(".0k", "k")
      }

      // Update the marker's content based on selection state
      private updateContent() {
        const rewardText = this.formatSatsForPin(this.post.reward)
        const markerScale = this.isSelected ? "1.15" : "1"
        const markerShadow = this.isSelected
          ? "0 0 20px rgba(254, 213, 107, 0.6), 0 4px 12px rgba(0, 0, 0, 0.15)"
          : "0 2px 8px rgba(0, 0, 0, 0.1)"
        const badgeOpacity = this.isSelected ? "1" : "0.95"
        const zIndex = this.isSelected ? "10" : "1"

        this.containerDiv.innerHTML = `
  <style>
@keyframes markerDropIn {
    0% {
      transform: translateY(-25px) scale(1);
      opacity: 0;
    }
    60% {
      transform: translateY(5px) scale(1);
      opacity: 1;
    }
    80% {
      transform: translateY(-3px) scale(1);
      opacity: 1;
    }
    100% {
      transform: translateY(0px) scale(1);
      opacity: 1;
    }
  }
</style>
<div class="btc-marker" style="
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #FED56B;
    border: 1px solid #C5792D;
    box-shadow: ${markerShadow};
    display: flex;
    align-items: center;
    justify-content: center;
    transform: scale(${markerScale});
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease;
    z-index: ${zIndex};
    ${this.animationDelay === 0 ? "" : `animation: markerDropIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) ${this.animationDelay}ms both;`}
  ">
    <img src="/images/bitcoin-logo.png" alt="Bitcoin" style="
      width: 38px;
      height: 38px;
      filter: drop-shadow(0px -1px 1px rgba(255, 255, 255, 0.4));
    ">
    <div class="btc-badge" style="
      position: absolute;
      bottom: -12px;
      left: 50%;
      transform: translateX(-50%);
      background: white;
      color: black;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: bold;
      border-radius: 16px;
      border: 1px solid #C5792D;
      box-shadow: 0 2px 3px rgba(0, 0, 0, 0.1);
      opacity: ${badgeOpacity};
      transition: opacity 0.2s ease;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      min-width: 28px;
      text-align: center;
      z-index: 2;
    ">${rewardText}</div>
  </div>
`
        console.log(`Marker ${this.markerId} content updated with selection state: ${this.isSelected}`)
      }
    }
  }

  // Load Google Maps with better error handling
  const loadGoogleMaps = async () => {
    try {
      console.log("Starting Google Maps loading process...")

      // Check if already loaded
      if (window.google && window.google.maps) {
        console.log("Google Maps already loaded")

        // Create PostMarker class
        PostMarkerClassRef.current = createPostMarkerClass()
        console.log("PostMarker class created:", !!PostMarkerClassRef.current)
        initializeMap()
        return
      }

      // Load Google Maps JavaScript API
      console.log("Loading Google Maps JavaScript API...")

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
              // Create PostMarker class
              PostMarkerClassRef.current = createPostMarkerClass()
              console.log("PostMarker class created:", !!PostMarkerClassRef.current)
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

      // Determine center location
      let defaultCenter = { lat: 37.7749, lng: -122.4194 } // Default fallback

      // If we have a centerPost, use its location
      if (centerPost && centerPost.latitude && centerPost.longitude) {
        defaultCenter = { lat: Number(centerPost.latitude), lng: Number(centerPost.longitude) }
        console.log("Centering map on specific post:", defaultCenter)
      } else if (center) {
        defaultCenter = center
        console.log("Centering map on custom location:", defaultCenter)
      } else if (postsWithLocation.length > 0) {
        // Otherwise use first post with location
        const firstPost = postsWithLocation[0]
        defaultCenter = { lat: Number(firstPost.latitude), lng: Number(firstPost.longitude) }
        console.log("Centering map on first post with location:", defaultCenter)
      }

      // Create map instance
      const map = new window.google.maps.Map(mapRef.current, {
        center: defaultCenter,
        zoom: 2, // Start with a low zoom, will be adjusted by bounds if provided
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

      // Add click listener to map to deselect markers (only if not in modal)
      if (!isModal) {
        map.addListener("click", () => {
          setSelectedPost(null)
          setShowResults(false)
        })
      }

      // If bounds are provided, fit the map to those bounds
      if (bounds) {
        console.log("Fitting map to provided bounds")
        map.fitBounds(bounds)
      } else if (centerPost) {
        // If centering on a specific post, use higher zoom
        map.setZoom(15)
        console.log("Setting zoom to 15 for centerPost")
      }

      // In the initializeMap function, after creating the map instance but before adding markers,
      // add this code to handle user location:

      // Handle user location if provided
      if (userLocation) {
        console.log("User location provided:", userLocation)

        // Set the map center to user location
        const userLatLng = {
          lat: userLocation.latitude,
          lng: userLocation.longitude,
        }
        map.setCenter(userLatLng)

        // If city bounds are provided, use them for smart zooming
        if (cityBounds) {
          console.log("Fitting map to city bounds")
          const bounds = new google.maps.LatLngBounds(
            { lat: cityBounds.south, lng: cityBounds.west },
            { lat: cityBounds.north, lng: cityBounds.east },
          )
          map.fitBounds(bounds)
        } else {
          map.setZoom(12) // City level zoom fallback
        }

        // Set city name in search bar if available
        if (cityName) {
          setSearchQuery(cityName)
        }
      }

      // Skip user location and go straight to adding post markers
      console.log("About to add post markers...")
      addPostMarkers(map)
      setIsLoading(false)
    } catch (error) {
      console.error("Error initializing map:", error)
      setLocationError(`Failed to create map: ${error instanceof Error ? error.message : "Unknown error"}`)
      setIsLoading(false)
    }
  }

  // Add markers for posts with location data
  const addPostMarkers = (map: google.maps.Map) => {
    console.log("addPostMarkers called with map:", !!map)
    console.log("Google Maps available:", !!window.google)
    console.log("PostMarker class available:", !!PostMarkerClassRef.current)

    if (!map || !window.google) {
      console.error("Map or Google Maps not available for adding post markers")
      return
    }

    if (!PostMarkerClassRef.current) {
      console.error("PostMarker class not available - creating it now")
      PostMarkerClassRef.current = createPostMarkerClass()
      if (!PostMarkerClassRef.current) {
        console.error("Failed to create PostMarker class")
        return
      }
    }

    console.log(`Adding ${postsWithLocation.length} post markers...`)

    if (postsWithLocation.length === 0) {
      console.log("No posts with location data")
      return
    }

    // Clear existing markers
    console.log("Clearing existing markers:", Object.keys(markersRef.current).length)
    Object.values(markersRef.current).forEach((marker) => {
      if (marker && typeof marker.setMap === "function") {
        marker.setMap(null)
      }
    })
    markersRef.current = {}

    // Determine if markers should be clickable (not clickable in modal/donation flow)
    const markersClickable = !isModal

    // Add markers for all posts with location
    postsWithLocation.forEach((post, index) => {
      const isSelected = selectedPost && post.id === selectedPost.id
      console.log(`Creating marker ${index + 1} for post:`, post.id)

      try {
        // Create a new marker for this post with animation delay
        const marker = new PostMarkerClassRef.current(
          post,
          map,
          isSelected,
          (clickedPost: Post) => {
            // Handle marker click (only if clickable)
            if (markersClickable) {
              console.log("Marker clicked:", clickedPost.id)
              setSelectedPost(clickedPost)

              // Update all marker styles
              Object.entries(markersRef.current).forEach(([id, marker]) => {
                marker.setSelected(id === clickedPost.id)
              })
            }
          },
          markersClickable,
          index, // Pass index for animation delay
        )

        // Store reference to marker
        markersRef.current[post.id] = marker
        console.log(`Marker ${index + 1} created and stored for post: ${post.id}`)
      } catch (error) {
        console.error(`Error creating marker for post ${post.id}:`, error)
      }
    })

    console.log("Total markers created:", Object.keys(markersRef.current).length)
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
        // Use smart zoom logic based on place geometry
        if (place.geometry.viewport) {
          // If the place has viewport bounds, use them to show the entire area
          mapInstance.fitBounds(place.geometry.viewport)
        } else if (place.geometry.bounds) {
          // If no viewport but has bounds, use those
          mapInstance.fitBounds(place.geometry.bounds)
        } else {
          // Fall back to center and zoom for specific points
          mapInstance.setCenter(place.geometry.location)
          mapInstance.setZoom(15)
        }

        setSearchQuery(description)
        setShowResults(false)
      }
    })
  }

  // Handle preview card click
  const handlePreviewCardClick = () => {
    if (selectedPost) {
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

    loadGoogleMaps()
  }

  // Update marker styles when selectedPost changes
  useEffect(() => {
    if (mapInstance && mapInitialized && Object.keys(markersRef.current).length > 0) {
      console.log("Updating marker selection states due to selectedPost change")
      // Update marker selection states without recreating markers
      Object.entries(markersRef.current).forEach(([id, marker]) => {
        const isSelected = selectedPost && id === selectedPost.id
        marker.setSelected(isSelected)
      })
    }
  }, [selectedPost, mapInstance, mapInitialized])

  // Clean up markers when component unmounts
  useEffect(() => {
    return () => {
      console.log("Cleaning up markers on unmount")
      Object.values(markersRef.current).forEach((marker) => {
        if (marker && typeof marker.setMap === "function") {
          marker.setMap(null)
        }
      })
    }
  }, [])

  const showLoading = isLoading || externalLoading

  // Set container classes based on whether it's in a modal or not
  const containerClasses = isModal ? "h-full w-full relative" : "h-screen w-screen relative"

  // Add this useEffect to handle cityName updates
  useEffect(() => {
    if (cityName && cityName !== searchQuery) {
      setSearchQuery(cityName)
      console.log("MapView: Updated searchQuery with cityName:", cityName)
    }
  }, [cityName, searchQuery])

  return (
    <div className={containerClasses}>
      {/* Close Button - Only show if not in modal */}
      {!isModal && (
        <Button
          variant="outline"
          size="icon"
          onClick={onClose}
          className="absolute top-4 right-4 z-50 h-12 w-12 rounded-full bg-white hover:bg-gray-50 shadow-lg border-gray-200 text-gray-600 hover:text-gray-800"
        >
          <X className="h-5 w-5" />
        </Button>
      )}

      {/* Search Bar with Donation Button - Adjust position if in modal */}
      <div
        className={`absolute ${isModal ? "top-2" : "top-4"} left-1/2 transform -translate-x-1/2 z-50 w-80 max-w-[calc(100%-1rem)]`}
      >
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
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

          {/* Donation Heart Button */}
          <Button
            onClick={handleDonationClick}
            size="icon"
            variant="outline"
            className="h-12 w-12 rounded-full bg-white hover:bg-gray-50 shadow-lg border-gray-200 text-gray-600 hover:text-gray-800"
          >
            <Heart className="h-5 w-5 fill-pink-400 stroke-pink-600 stroke-2" />
          </Button>
        </div>
      </div>

      {showLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-40">
          {/* Replicate LoadingSpinner structure */}
          <div className="mb-4">
            <svg
              className="animate-spin h-10 w-10 text-primary"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
          <p className="text-lg font-medium text-center">Loading...</p>
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

      <div ref={mapRef} className="h-full w-full" />

      {/* Airbnb-style Preview Card - Only show if not in modal and post is selected */}
      {selectedPost && !isModal && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[36rem] max-w-[calc(100%-1rem)]">
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
                  <img src="/images/bitcoin-logo.png" alt="Bitcoin" className="w-4 h-4 object-contain" />
                  <span className="font-medium text-xs text-gray-700">{formatSatsValue(selectedPost.reward)}</span>
                </div>
                <div className="text-xs text-gray-500">{formatPostDate(selectedPost)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Issue Button - Always visible at bottom center */}
      <div
        className={`absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40 transition-all duration-200 ${selectedPost && !isModal ? "translate-y-[-8rem]" : ""}`}
      >
        <Button
          onClick={handleNewPost}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Issue
        </Button>
      </div>

      {/* Donation Modal */}
      <DonationModal
        open={isDonationModalOpen}
        onOpenChange={setIsDonationModalOpen}
        preSelectedLocation={searchQuery || null}
      />
    </div>
  )
}
