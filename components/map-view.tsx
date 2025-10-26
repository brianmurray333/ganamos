"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { X, RefreshCw, AlertCircle, Heart, Plus, Clock } from "lucide-react"
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
  bounds?: any // google.maps.LatLngBounds at runtime
  onClose: () => void
  isLoading?: boolean
  isModal?: boolean // Flag to indicate if map is in a modal
  initialSearchQuery?: string // Initial search query to populate the search bar
  userLocation?: {
    latitude: number
    longitude: number
    zoomType: string
    name: string
    bounds?: any // google.maps.LatLngBounds at runtime
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
function MapViewComponent({
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
  const [mapLoaded, setMapLoaded] = useState(false) // Track when map is visually loaded
  const [selectedPost, setSelectedPost] = useState<Post | null>(centerPost || null)
  const markersRef = useRef<{ [key: string]: any }>({})
  const PostMarkerClassRef = useRef<any>(null)
  const userLocationMarkerRef = useRef<google.maps.Marker | null>(null)

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
  const [userCleared, setUserCleared] = useState(false)

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      googleMapRef.current = map
      setMapInstance(map)

      // If we have city bounds, fit the map to those bounds
      if (cityBounds) {
        const bounds: any = new (window as any).google.maps.LatLngBounds(
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

  const fetchPosts = useCallback(async () => {
    setIsLoading(true)
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from("posts")
          .select(`
            *,
            group:group_id(
              id,
              name,
              description
            )
          `)
          .eq("fixed", false)
          .neq("under_review", true)
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
  }, [supabase])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  useEffect(() => {
    if (mapInstance && userLocation) {
      // If we have city bounds, fit the map to those bounds
      if (cityBounds) {
        const bounds: any = new (window as any).google.maps.LatLngBounds(
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

  // Filter posts that have location data - memoized to prevent recalculation on every render
  const postsWithLocation = useMemo(() => {
    // Guard against undefined or null
    if (!allPosts || !Array.isArray(allPosts)) return []
    
    return allPosts.filter((post) => {
      // Guard against null/undefined posts
      if (!post) return false
      
      const lat = Number(post.latitude)
      const lng = Number(post.longitude)
      
      // Check for valid coordinates (not NaN and not zero)
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0
    })
  }, [allPosts])

  // Format date for preview card
  const formatPostDate = (post: Post) => {
    try {
      if (!post.createdAt && !post.created_at) return "Recently"
      const date = new Date(post.createdAt || post.created_at || Date.now())
      if (isNaN(date.getTime())) return "Recently"
      return formatTimeAgo(date)
    } catch (error) {
      return "Recently"
    }
  }

  // Initialize map when component mounts
  useEffect(() => {
    if (mapInitialized) return

    setIsLoading(true)
    setLocationError(null)

    loadGoogleMaps()
  }, [mapInitialized])

  // Removed the problematic useEffect that was causing multiple marker redraws
  // Markers are now only added once during map initialization (line ~723)

  // Create PostMarker class after Google Maps is loaded
  const createPostMarkerClass = () => {
    if (!window.google || !window.google.maps) {
      console.error("Cannot create PostMarker class - Google Maps not available")
      return null
    }


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
      private hasAnimated: boolean // Track if marker has been animated

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
        this.hasAnimated = false // Initialize animation flag

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
            this.onClick(this.post)
          })
        }

        // Set the overlay's map
        this.setMap(map)
      }

      // Called when the overlay is added to the map
      onAdd() {
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
      }

      // Called when the overlay's position should be drawn
      draw() {
        // Transform the position to pixel coordinates
        const projection = this.getProjection()
        if (!projection) {
          console.error(`No projection available for marker ${this.markerId}`)
          return
        }

        const point = projection.fromLatLngToDivPixel(this.position)
        if (point) {
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
        if (this.containerDiv.parentElement) {
          this.containerDiv.parentElement.removeChild(this.containerDiv)
        }
      }

      // Update the marker's selected state
      setSelected(isSelected: boolean) {
        this.isSelected = isSelected
        this.updateSelection()
      }

      // Update only the selection state without recreating HTML
      private updateSelection() {
        const markerElement = this.containerDiv.querySelector('.btc-marker') as HTMLElement
        const badgeElement = this.containerDiv.querySelector('.btc-badge') as HTMLElement
        
        if (markerElement && badgeElement) {
          const markerScale = this.isSelected ? "1.1" : "1"
          const badgeOpacity = this.isSelected ? "1" : "0.95"
          
          markerElement.style.transform = `scale(${markerScale})`
          badgeElement.style.opacity = badgeOpacity
        }
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
        const markerScale = this.isSelected ? "1.1" : "1"
        const badgeOpacity = this.isSelected ? "1" : "0.95"
        
        // Only apply animation if this is the first time creating the marker
        const animationStyle = this.hasAnimated ? "" : `animation: markerDropIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) ${this.animationDelay}ms both;`

        this.containerDiv.innerHTML = `
  <style>
@keyframes markerDropIn {
  0% {
    transform: translateY(-25px) scale(${markerScale});
    opacity: 0;
  }
  60% {
    transform: translateY(5px) scale(${markerScale});
    opacity: 1;
  }
  80% {
    transform: translateY(-3px) scale(${markerScale});
    opacity: 1;
  }
  100% {
    transform: translateY(0px) scale(${markerScale});
    opacity: 1;
  }
}
@keyframes shine {
  0% {
    transform: translate(-100%, -100%) rotate(25deg);
  }
  100% {
    transform: translate(100%, 100%) rotate(25deg);
  }
}
</style>
<div class="marker-wrapper" style="
  position: relative;
  width: 44px;
  height: 44px;
  transition: transform 0.2s ease;
  transform: scale(${markerScale});
  ${animationStyle}
">
  <div class="btc-marker" style="
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: #FED56B;
    border: 1px solid #C5792D;
    box-shadow: 0 0 0 1px #F4C14F;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  ">
    <img src="/images/bitcoin-logo.png" alt="Bitcoin" style="
      width: 38px;
      height: 38px;
      filter: drop-shadow(0px -1px 1px rgba(255, 255, 255, 0.4));
      position: relative;
      overflow: hidden;
    ">
    <div class="shine-effect" style="
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: linear-gradient(
        120deg,
        rgba(255, 255, 255, 0) 30%,
        rgba(255, 255, 255, 0.5) 50%,
        rgba(255, 255, 255, 0) 70%
      );
      transform: rotate(0deg);
      animation: shine 2.5s infinite ease-in-out;
      z-index: 2;
      pointer-events: none;
    "></div>
  </div>
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
    z-index: 3;
  ">${rewardText}</div>
</div>
`
        // Mark that this marker has been animated
        this.hasAnimated = true
      }
    }
  }

  // Load Google Maps with better error handling
  const loadGoogleMaps = async () => {
    try {

      // Check if already loaded
      if (window.google && window.google.maps) {

        // Create PostMarker class
        PostMarkerClassRef.current = createPostMarkerClass()
        initializeMap()
        return
      }

      // Load Google Maps JavaScript API

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
          // Give it a moment to initialize
          setTimeout(() => {
            if (window.google && window.google.maps) {
              // Create PostMarker class
              PostMarkerClassRef.current = createPostMarkerClass()
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
      })


      initializeMap()
    } catch (error) {
      console.error("Error loading Google Maps:", error)
      setLocationError(`Failed to load map: ${error instanceof Error ? error.message : "Unknown error"}`)
      setIsLoading(false)
    }
  }

  // Initialize the map
  const initializeMap = () => {

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
      return
    }

    try {

      // Determine center location
      let defaultCenter = { lat: 37.7749, lng: -122.4194 } // Default fallback

      // If we have a centerPost, use its location
      if (centerPost && centerPost.latitude && centerPost.longitude) {
        defaultCenter = { lat: Number(centerPost.latitude), lng: Number(centerPost.longitude) }
      } else if (center) {
        defaultCenter = center
      } else if (postsWithLocation.length > 0) {
        // Otherwise use first post with location
        const firstPost = postsWithLocation[0]
        defaultCenter = { lat: Number(firstPost.latitude), lng: Number(firstPost.longitude) }
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
        gestureHandling: "greedy",
      })


      setMapInstance(map)
      setMapInitialized(true)

      // Initialize Places services
      const autoService = new (window as any).google.maps.places.AutocompleteService()
      const placeService = new (window as any).google.maps.places.PlacesService(map)
      setAutocompleteService(autoService)
      setPlacesService(placeService)

      // Set mapLoaded to true when map tiles are ready
      window.google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
        setTimeout(() => {
          setMapLoaded(true)
        }, 100) // Small delay to ensure map is visually rendered
      })

      // Add click listener to map to deselect markers (only if not in modal)
      if (!isModal) {
        map.addListener("click", () => {
          setSelectedPost(null)
          setShowResults(false)
        })
      }

      // If bounds are provided, fit the map to those bounds
      if (bounds) {
        map.fitBounds(bounds)
      } else if (centerPost) {
        // If centering on a specific post, use higher zoom
        map.setZoom(15)
      }

      // In the initializeMap function, after creating the map instance but before adding markers,
      // add this code to handle user location:

      // Handle user location if provided
      if (userLocation) {

        // Set the map center to user location
        const userLatLng = {
          lat: userLocation.latitude,
          lng: userLocation.longitude,
        }
        map.setCenter(userLatLng)

        // If city bounds are provided, use them for smart zooming
        if (cityBounds) {
          const bounds: any = new (window as any).google.maps.LatLngBounds(
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
      addPostMarkers(map)
      
      // Add user location marker with pulsing dot
      addUserLocationMarker(map)
      
      setIsLoading(false)
    } catch (error) {
      console.error("Error initializing map:", error)
      setLocationError(`Failed to create map: ${error instanceof Error ? error.message : "Unknown error"}`)
      setIsLoading(false)
    }
  }

  // Create user location marker with pulsing dot
  const addUserLocationMarker = (map: google.maps.Map) => {
    if (!userLocation || !map || !window.google) {
      return
    }

    // Remove existing user location marker
    if (userLocationMarkerRef.current) {
      userLocationMarkerRef.current.setMap(null)
    }

    // Create custom pulsing dot icon
    const pulsingDotIcon = {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: '#4285F4',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      strokeOpacity: 1,
    }

    // Create the user location marker
    const userMarker = new window.google.maps.Marker({
      position: { lat: userLocation.latitude, lng: userLocation.longitude },
      map: map,
      icon: pulsingDotIcon,
      title: 'Your Location',
      zIndex: 1000, // Ensure it appears above other markers
    })

    // Add pulsing animation using CSS
    const markerElement = userMarker.getIcon()
    
    // Create a custom overlay for the pulsing effect
    class PulsingDot extends window.google.maps.OverlayView {
      private position: google.maps.LatLng
      private div: HTMLElement | null = null

      constructor(position: google.maps.LatLng) {
        super()
        this.position = position
      }

      onAdd() {
        const div = document.createElement('div')
        div.style.cssText = `
          position: absolute;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background-color: #4285F4;
          border: 3px solid white;
          box-shadow: 0 0 0 0 rgba(66, 133, 244, 0.7);
          animation: map-location-pulse 2s infinite;
          transform: translate(-50%, -50%);
          z-index: 1000;
        `
        
        // Add CSS animation if not already added
        if (!document.getElementById('map-location-pulse-animation')) {
          const style = document.createElement('style')
          style.id = 'map-location-pulse-animation'
          style.textContent = `
            @keyframes map-location-pulse {
              0% {
                box-shadow: 0 0 0 0 rgba(66, 133, 244, 0.7);
              }
              70% {
                box-shadow: 0 0 0 10px rgba(66, 133, 244, 0);
              }
              100% {
                box-shadow: 0 0 0 0 rgba(66, 133, 244, 0);
              }
            }
          `
          document.head.appendChild(style)
        }

        this.div = div
        const panes = this.getPanes()
        if (panes) {
          panes.overlayMouseTarget.appendChild(div)
        }
      }

      draw() {
        if (this.div) {
          const overlayProjection = this.getProjection()
          const position = overlayProjection.fromLatLngToDivPixel(this.position)
          if (position) {
            this.div.style.left = position.x + 'px'
            this.div.style.top = position.y + 'px'
          }
        }
      }

      onRemove() {
        if (this.div && this.div.parentNode) {
          this.div.parentNode.removeChild(this.div)
          this.div = null
        }
      }
    }

    // Create and add the pulsing dot overlay
    const pulsingDot = new PulsingDot(
      new window.google.maps.LatLng(userLocation.latitude, userLocation.longitude)
    )
    pulsingDot.setMap(map)

    userLocationMarkerRef.current = userMarker

  }

  // Add markers for posts with location data
  const addPostMarkers = (map: google.maps.Map) => {

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


    if (postsWithLocation.length === 0) {
      return
    }

    // Clear existing markers
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

      try {
        // Create a new marker for this post with animation delay
        const marker = new PostMarkerClassRef.current(
          post,
          map,
          isSelected,
          (clickedPost: Post) => {
            // Handle marker click (only if clickable)
            if (markersClickable) {
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
      } catch (error) {
        console.error(`Error creating marker for post ${post.id}:`, error)
      }
    })

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
    setIsLoading(true)
    setLocationError(null)
    setMapInitialized(false)
    setMapInstance(null)

    loadGoogleMaps()
  }

  // Update marker styles when selectedPost changes
  useEffect(() => {
    if (mapInstance && mapInitialized && PostMarkerClassRef.current) {
      // Update marker selection states
      Object.entries(markersRef.current).forEach(([id, marker]) => {
        marker.setSelected(selectedPost && id === selectedPost.id)
      })
    }
  }, [selectedPost])

  // Clean up markers when component unmounts
  useEffect(() => {
    return () => {
      Object.values(markersRef.current).forEach((marker) => {
        if (marker && typeof marker.setMap === "function") {
          marker.setMap(null)
        }
      })
    }
  }, [])

  const showLoading = isLoading || externalLoading

  // Set container classes based on whether it's in a modal or not
  const containerClasses = isModal ? "h-full w-full relative" : "min-h-[calc(100vh-4rem)] pb-16 w-full relative"

  // Add this useEffect to handle cityName updates
  useEffect(() => {
    if (cityName && cityName !== searchQuery && !userCleared) {
      setSearchQuery(cityName)
    }
  }, [cityName, userCleared])

  return (
    <div className={containerClasses}>
      {/* Search Bar with Donation Button - Adjust position if in modal - Fade in after map loads */}
      <div
        className={`absolute ${isModal ? "top-2" : "top-4"} left-1/2 transform -translate-x-1/2 z-50 w-80 max-w-[calc(100%-1rem)] transition-opacity duration-300 ${mapLoaded ? 'opacity-100' : 'opacity-0'}`}
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
                  setUserCleared(true)
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

      <div ref={mapRef} className="h-full w-full" style={{ minHeight: 'calc(100vh - 4rem)', paddingBottom: '4rem' }} />

      {/* Airbnb-style Preview Card - Only show if not in modal and post is selected */}
      {selectedPost && !isModal && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 w-[36rem] max-w-[calc(100%-1rem)]">
          <div
            className="bg-white rounded-xl shadow-xl p-3 cursor-pointer hover:shadow-2xl transition-shadow relative"
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
                <p className="font-medium text-lg text-gray-900 line-clamp-2 mb-2">
                  {selectedPost.description || "No description available"}
                </p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <img src="/images/bitcoin-logo.png" alt="Bitcoin" className="w-4 h-4 object-contain" />
                    <span className="font-medium text-xs text-gray-700">{formatSatsValue(selectedPost.reward)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    {formatPostDate(selectedPost)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Donation Modal */}
      <DonationModal
        open={isDonationModalOpen}
        onOpenChange={setIsDonationModalOpen}
        preSelectedLocation={searchQuery || null}
      />
    </div>
  )
}

// Memoize MapView to prevent unnecessary re-renders when props haven't changed
export const MapView = React.memo(MapViewComponent, (prevProps, nextProps) => {
  // Return true if props are equal (component should NOT re-render)
  // Return false if props changed (component SHOULD re-render)
  
  // Compare posts array by reference (already memoized in parent)
  if (prevProps.posts !== nextProps.posts) return false
  
  // Compare centerPost by ID
  if (prevProps.centerPost?.id !== nextProps.centerPost?.id) return false
  
  // Compare loading state
  if (prevProps.isLoading !== nextProps.isLoading) return false
  
  // Compare user location coordinates
  if (prevProps.userLocation?.lat !== nextProps.userLocation?.lat ||
      prevProps.userLocation?.lng !== nextProps.userLocation?.lng) return false
  
  // Compare center coordinates
  if (prevProps.center?.lat !== nextProps.center?.lat ||
      prevProps.center?.lng !== nextProps.center?.lng) return false
  
  // If all comparisons passed, props are equal - don't re-render
  return true
})
