"use client"

import React, { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Plus, Clock, Gift } from "lucide-react"
import type { Post } from "@/lib/types"
import { formatTimeAgo } from "@/lib/utils"
import { getCurrentLocationWithName } from "@/lib/geocoding"
import { loadGoogleMaps } from "@/lib/google-maps-loader"
import Image from "next/image"

const defaultCenter = {
  lat: 37.7749,
  lng: -122.4194,
}

const defaultZoom = 13

interface DashboardMapProps {
  posts: Post[]
  onNewIssue: () => void
  mapInstance?: google.maps.Map | null
  onMapReady?: (map: google.maps.Map) => void
}

declare global {
  interface Window {
    google?: any
  }
}

function DashboardMapComponent({ posts, onNewIssue, mapInstance: externalMapInstance, onMapReady }: DashboardMapProps) {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(externalMapInstance || null)
  const [mapInitialized, setMapInitialized] = useState(false)
  const [mapTilesLoaded, setMapTilesLoaded] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const markersRef = useRef<{ [key: string]: any }>({})
  const PostMarkerClassRef = useRef<any>(null)
  const userLocationMarkerRef = useRef<google.maps.Marker | null>(null)
  const [userLocation, setUserLocation] = useState<{
    latitude: number
    longitude: number
    name: string
    lat: number
    lng: number
  } | null>(null)
  const isUnmountedRef = useRef(false)

  // Create PostMarker class - same as production
  const createPostMarkerClass = () => {
    if (!window.google || !window.google.maps) {
      return null
    }

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
      private hasAnimated: boolean

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
        this.animationDelay = animationDelay * 50
        this.hasAnimated = false

        this.position = new window.google.maps.LatLng(Number(post.latitude), Number(post.longitude))
        this.isSelected = isSelected
        this.onClick = onClick
        this.map = map

        this.containerDiv = document.createElement("div")
        this.containerDiv.className = "post-marker-container"
        this.containerDiv.style.position = "absolute"
        this.containerDiv.style.userSelect = "none"
        this.containerDiv.style.zIndex = "1"
        this.containerDiv.style.cursor = this.isClickable ? "pointer" : "default"
        this.containerDiv.setAttribute("data-marker-id", post.id)

        if (this.isClickable) {
          const handleClick = (e: Event) => {
            e.stopPropagation()
            e.preventDefault()
            this.onClick(this.post)
          }
          this.containerDiv.addEventListener("click", handleClick)
          this.containerDiv.addEventListener("touchend", handleClick)
        }

        this.setMap(map)
      }

      onAdd() {
        this.updateContent()
        const panes = this.getPanes()
        if (!panes) return
        panes.overlayMouseTarget.appendChild(this.containerDiv)
      }

      draw() {
        const projection = this.getProjection()
        if (!projection) return

        const point = projection.fromLatLngToDivPixel(this.position)
        if (point) {
          this.containerDiv.style.left = point.x - 22 + "px"
          this.containerDiv.style.top = point.y - 22 + "px"
          this.containerDiv.style.display = "block"
        }
      }

      onRemove() {
        if (this.containerDiv.parentElement) {
          this.containerDiv.parentElement.removeChild(this.containerDiv)
        }
      }

      setSelected(isSelected: boolean) {
        this.isSelected = isSelected
        this.updateSelection()
      }

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

      private formatSatsForPin(sats: number): string {
        if (sats === 0) return "0"
        if (sats < 1000) return sats.toString()
        const inK = sats / 1000
        if (inK === Math.floor(inK)) {
          return `${Math.floor(inK)}k`
        }
        return `${inK.toFixed(1)}k`.replace(".0k", "k")
      }

      private updateContent() {
        const rewardText = this.formatSatsForPin(this.post.reward)
        const markerScale = this.isSelected ? "1.1" : "1"
        const badgeOpacity = this.isSelected ? "1" : "0.95"
        const animationStyle = this.hasAnimated ? "" : `animation: markerDropIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) ${this.animationDelay}ms both;`

        this.containerDiv.innerHTML = `
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
      animation: markerShine 2.5s infinite ease-in-out;
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
        this.hasAnimated = true
      }
    }
  }

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInitialized) return
    isUnmountedRef.current = false

    const initMap = async () => {
      try {
        const location = await getCurrentLocationWithName()
        if (location) {
          setUserLocation({
            latitude: location.lat,
            longitude: location.lng,
            name: location.name || '',
            lat: location.lat,
            lng: location.lng,
          })
        }
      } catch (e) {
        console.log('Could not get user location')
      }

      try {
        await loadGoogleMaps()
        createMap()
      } catch (error) {
        console.error('Error loading Google Maps:', error)
      }
    }

    const createMap = () => {
      if (!mapRef.current || !window.google) return

      const center = userLocation 
        ? { lat: userLocation.latitude, lng: userLocation.longitude }
        : defaultCenter

      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: defaultZoom,
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_CENTER,
        },
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
          }
        ],
        gestureHandling: 'greedy',
      })

      setMapInstance(map)
      setMapInitialized(true)
      PostMarkerClassRef.current = createPostMarkerClass()
      
      if (onMapReady) {
        onMapReady(map)
      }

      // Wait for tiles to load before adding markers and fitting bounds
      window.google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
        // Signal that map tiles are loaded
        setMapTilesLoaded(true)
        
        // Fit bounds to posts
        if (posts.length > 0) {
          const bounds = new window.google.maps.LatLngBounds()
          posts.forEach((post) => {
            if (post.latitude && post.longitude) {
              bounds.extend({ lat: post.latitude, lng: post.longitude })
            }
          })
          if (userLocation) {
            bounds.extend({ lat: userLocation.latitude, lng: userLocation.longitude })
          }
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 60 })
          }
        }
      })
    }

    initMap()

    return () => {
      isUnmountedRef.current = true
    }
  }, [mapInitialized, userLocation, posts, onMapReady])

  // Add markers when posts change (only after map tiles are loaded)
  useEffect(() => {
    if (!mapInstance || !PostMarkerClassRef.current || isUnmountedRef.current || !mapTilesLoaded) return

    // Clear existing markers
    Object.values(markersRef.current).forEach((marker: any) => {
      if (marker && typeof marker.setMap === "function") {
        marker.setMap(null)
      }
    })
    markersRef.current = {}

    const postsWithLocation = posts.filter(p => p.latitude && p.longitude)
    if (postsWithLocation.length === 0) return

    const bounds = mapInstance.getBounds()
    
    // Sort posts: those in viewport come first
    const sortedPosts = [...postsWithLocation].sort((a, b) => {
      if (!bounds) return 0
      const aInView = bounds.contains({ lat: Number(a.latitude), lng: Number(a.longitude) })
      const bInView = bounds.contains({ lat: Number(b.latitude), lng: Number(b.longitude) })
      if (aInView && !bInView) return -1
      if (!aInView && bInView) return 1
      return 0
    })

    sortedPosts.forEach((post, index) => {
      if (isUnmountedRef.current) return

      const isSelected = selectedPost && post.id === selectedPost.id
      const isInViewport = bounds?.contains({ lat: Number(post.latitude), lng: Number(post.longitude) })
      const animationDelay = isInViewport ? 0 : Math.min(index, 10)

      try {
        const marker = new PostMarkerClassRef.current(
          post,
          mapInstance,
          isSelected,
          (clickedPost: Post) => {
            if (!isUnmountedRef.current) {
              setSelectedPost(clickedPost)
              Object.entries(markersRef.current).forEach(([id, m]) => {
                m.setSelected(id === clickedPost.id)
              })
            }
          },
          true,
          animationDelay,
        )
        markersRef.current[post.id] = marker
      } catch (error) {
        console.error(`Error creating marker for post ${post.id}:`, error)
      }
    })
  }, [posts, mapInstance, selectedPost, mapTilesLoaded])

  // Add user location marker
  useEffect(() => {
    if (!mapInstance || !userLocation || isUnmountedRef.current) return

    if (userLocationMarkerRef.current) {
      userLocationMarkerRef.current.setMap(null)
    }

    const pulsingDotIcon = {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: '#4285F4',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3,
    }

    userLocationMarkerRef.current = new window.google.maps.Marker({
      position: { lat: userLocation.latitude, lng: userLocation.longitude },
      map: mapInstance,
      icon: pulsingDotIcon,
      title: 'Your Location',
      zIndex: 1000,
    })
  }, [mapInstance, userLocation])

  return (
    <div className="relative w-full h-full">
      {/* Map container with rounded edges */}
      <div ref={mapRef} className="absolute inset-0 rounded-r-xl" />

      {/* Floating New Issue Button */}
      <button
        onClick={onNewIssue}
        className="absolute bottom-6 right-6 z-10 flex items-center justify-center w-14 h-14 rounded-full bg-primary hover:bg-primary/90 transition-all duration-200 transform hover:scale-105 shadow-lg"
        aria-label="New Issue"
      >
        <Plus className="w-6 h-6 text-white stroke-[2.5]" />
      </button>

      {/* Selected Post Preview Card */}
      {selectedPost && (
        <div
          className="absolute bottom-24 left-4 right-4 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden cursor-pointer"
          onClick={() => router.push(`/post/${selectedPost.id}`)}
        >
          <div className="flex">
            {selectedPost.image_url && (
              <div className="w-24 h-24 flex-shrink-0 relative">
                <Image
                  src={selectedPost.image_url}
                  alt={selectedPost.title}
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <div className="flex-1 p-3 min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                {selectedPost.title}
              </h3>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatTimeAgo(selectedPost.created_at)}</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <Gift className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                  {selectedPost.reward < 1000 ? `${selectedPost.reward}` : `${(selectedPost.reward / 1000).toFixed(1)}k`.replace('.0k', 'k')} sats
                </span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSelectedPost(null)
              }}
              className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export const DashboardMap = React.memo(DashboardMapComponent)
