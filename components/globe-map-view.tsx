"use client"

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Clock, Gift, X } from "lucide-react"
import type { Post } from "@/lib/types"
import { formatTimeAgo } from "@/lib/utils"
import Image from "next/image"

interface GlobeMapViewProps {
  posts: Post[]
  userLocation?: {
    latitude: number
    longitude: number
  } | null
  onClose?: () => void
  showPreviewCard?: boolean
  searchedLocation?: {
    lat: number
    lng: number
    zoom?: number
  } | null
}

// Inactivity timeout before resuming auto-rotation (10 seconds)
const INACTIVITY_TIMEOUT = 10000

// Dynamic import for globe.gl since it requires window
const GlobeMapViewComponent = ({
  posts,
  userLocation,
  onClose,
  showPreviewCard = true,
  searchedLocation,
}: GlobeMapViewProps) => {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<any>(null)
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [Globe, setGlobe] = useState<any>(null)

  // Load globe.gl dynamically (client-side only)
  useEffect(() => {
    import("globe.gl").then((mod) => {
      setGlobe(() => mod.default)
    })
  }, [])

  // Memoize posts with valid coordinates to prevent re-renders when typing in search
  const postsWithLocation = useMemo(() => 
    posts.filter(
      (p) => p.latitude && p.longitude && !isNaN(Number(p.latitude)) && !isNaN(Number(p.longitude))
    ),
    [posts]
  )

  // Stop auto-rotation and schedule resume after inactivity
  const stopAutoRotation = useCallback(() => {
    if (globeRef.current) {
      const controls = globeRef.current.controls()
      controls.autoRotate = false
    }
    
    // Clear existing timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
    }
    
    // Schedule resume after inactivity
    inactivityTimerRef.current = setTimeout(() => {
      if (globeRef.current) {
        const controls = globeRef.current.controls()
        controls.autoRotate = true
      }
    }, INACTIVITY_TIMEOUT)
  }, [])

  // Cleanup inactivity timer on unmount
  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
    }
  }, [])

  // Format sats for display
  const formatSatsForPin = (sats: number): string => {
    if (sats === 0) return "0"
    if (sats < 1000) return sats.toString()
    const inK = sats / 1000
    if (inK === Math.floor(inK)) {
      return `${Math.floor(inK)}k`
    }
    return `${inK.toFixed(1)}k`.replace(".0k", "k")
  }

  // Initialize globe
  useEffect(() => {
    if (!containerRef.current || !Globe) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Create globe instance
    const globe = new Globe(container)
      .width(width)
      .height(height)
      .backgroundColor("#020817") // Matches app dark theme background
      .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
      .bumpImageUrl("https://unpkg.com/three-globe/example/img/earth-topology.png")
      .showAtmosphere(true)
      .atmosphereColor("#4a9eff")
      .atmosphereAltitude(0.2)

    globeRef.current = globe

    // Enable slow auto-rotation
    const controls = globe.controls()
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.3 // Very slow rotation (default is 2.0)
    
    // Stop auto-rotation when user interacts with the globe (drag, zoom, etc.)
    controls.addEventListener('start', () => {
      controls.autoRotate = false
      
      // Clear existing timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
    })
    
    // Resume auto-rotation after user stops interacting
    controls.addEventListener('end', () => {
      // Schedule resume after inactivity
      inactivityTimerRef.current = setTimeout(() => {
        if (globeRef.current) {
          globeRef.current.controls().autoRotate = true
        }
      }, INACTIVITY_TIMEOUT)
    })

    // Set initial camera position
    if (userLocation) {
      globe.pointOfView(
        {
          lat: userLocation.latitude,
          lng: userLocation.longitude,
          altitude: 2,
        },
        0
      )
    } else if (postsWithLocation.length > 0) {
      // Center on first post
      const firstPost = postsWithLocation[0]
      globe.pointOfView(
        {
          lat: Number(firstPost.latitude),
          lng: Number(firstPost.longitude),
          altitude: 2,
        },
        0
      )
    }

    // Add points (bitcoin markets) data
    globe
      .pointsData(postsWithLocation)
      .pointLat((d: Post) => Number(d.latitude))
      .pointLng((d: Post) => Number(d.longitude))
      .pointAltitude(0.01)
      .pointRadius(0.3)
      .pointColor(() => "#F7931A") // Bitcoin orange
      .pointLabel((d: Post) => `
        <div style="
          background: rgba(0, 0, 0, 0.85);
          color: white;
          padding: 12px 16px;
          border-radius: 12px;
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 280px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(247, 147, 26, 0.4);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        ">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px; color: #fff;">
            ${d.title}
          </div>
          <div style="
            display: flex;
            align-items: center;
            gap: 6px;
            color: #F7931A;
            font-weight: 700;
            font-size: 13px;
          ">
            <span>₿</span>
            <span>${formatSatsForPin(d.reward)} sats</span>
          </div>
          ${d.location ? `
            <div style="
              margin-top: 6px;
              font-size: 11px;
              color: #9ca3af;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            ">
              📍 ${d.location}
            </div>
          ` : ""}
        </div>
      `)
      .onPointClick((point: Post | null) => {
        if (point && showPreviewCard) {
          setSelectedPost(point)
          // Animate to clicked point
          globe.pointOfView(
            {
              lat: Number(point.latitude),
              lng: Number(point.longitude),
              altitude: 1.5,
            },
            1000
          )
        }
      })

    // Add user location ring if available
    if (userLocation) {
      globe
        .ringsData([
          {
            lat: userLocation.latitude,
            lng: userLocation.longitude,
            maxR: 3,
            propagationSpeed: 2,
            repeatPeriod: 1000,
          },
        ])
        .ringColor(() => "#4285F4")
        .ringMaxRadius("maxR")
        .ringPropagationSpeed("propagationSpeed")
        .ringRepeatPeriod("repeatPeriod")
    }

    // Add HTML markers for bitcoin coins
    globe
      .htmlElementsData(postsWithLocation)
      .htmlLat((d: Post) => Number(d.latitude))
      .htmlLng((d: Post) => Number(d.longitude))
      .htmlAltitude(0.02)
      .htmlElement((d: Post) => {
        const el = document.createElement("div")
        el.innerHTML = `
          <div style="
            position: relative;
            cursor: pointer;
            transform: translate(-50%, -50%);
          ">
            <div style="
              width: 32px;
              height: 32px;
              border-radius: 50%;
              background: linear-gradient(135deg, #FFD93D 0%, #F7931A 50%, #E67E00 100%);
              border: 2px solid rgba(255, 255, 255, 0.3);
              box-shadow: 
                0 0 15px rgba(247, 147, 26, 0.6),
                0 4px 12px rgba(0, 0, 0, 0.4),
                inset 0 2px 4px rgba(255, 255, 255, 0.3);
              display: flex;
              align-items: center;
              justify-content: center;
              animation: bitcoin-marker-pulse 2s ease-in-out infinite;
            ">
              <span style="
                font-size: 18px;
                font-weight: bold;
                color: #fff;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
              ">₿</span>
            </div>
            <div style="
              position: absolute;
              bottom: -16px;
              left: 50%;
              transform: translateX(-50%);
              background: rgba(0, 0, 0, 0.8);
              color: #F7931A;
              padding: 2px 8px;
              border-radius: 10px;
              font-size: 10px;
              font-weight: 700;
              white-space: nowrap;
              font-family: system-ui, -apple-system, sans-serif;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            ">${formatSatsForPin(d.reward)}</div>
          </div>
        `
        el.style.pointerEvents = "auto"
        el.style.cursor = "pointer"
        el.onclick = () => {
          if (showPreviewCard) {
            setSelectedPost(d)
            globe.pointOfView(
              {
                lat: Number(d.latitude),
                lng: Number(d.longitude),
                altitude: 1.5,
              },
              1000
            )
          }
        }
        return el
      })

    setIsLoading(false)

    // Handle resize
    const handleResize = () => {
      if (containerRef.current && globe) {
        globe.width(containerRef.current.clientWidth)
        globe.height(containerRef.current.clientHeight)
      }
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      if (globe) {
        globe._destructor?.()
      }
    }
  }, [Globe, postsWithLocation, userLocation, showPreviewCard])

  // Update points when posts change
  useEffect(() => {
    if (globeRef.current && postsWithLocation.length > 0) {
      globeRef.current.pointsData(postsWithLocation)
      globeRef.current.htmlElementsData(postsWithLocation)
    }
  }, [postsWithLocation])

  // Animate to searched location when it changes
  useEffect(() => {
    if (globeRef.current && searchedLocation) {
      // Stop auto-rotation when navigating to searched location
      stopAutoRotation()
      
      // Calculate altitude based on zoom level (lower zoom = higher altitude)
      // Zoom 15 = altitude ~0.5, Zoom 10 = altitude ~1.5, etc.
      const altitude = searchedLocation.zoom ? Math.max(0.3, 3 - (searchedLocation.zoom / 10)) : 1.5
      
      // Animate to the searched location with smooth transition
      globeRef.current.pointOfView(
        {
          lat: searchedLocation.lat,
          lng: searchedLocation.lng,
          altitude: altitude,
        },
        1500 // 1.5 second animation
      )
    }
  }, [searchedLocation, stopAutoRotation])

  return (
    <div className="relative w-full h-full overflow-hidden bg-background dark:bg-background">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-20">
          <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
        </div>
      )}

      {/* Globe container - shifted down to center between search bar and bottom nav */}
      {/* Globe container - shifted up to center between search bar and bottom nav */}
      <div ref={containerRef} className="w-full h-full" style={{ transform: 'translateY(-30px)' }} />

      {/* CSS for animations */}
      <style jsx global>{`
        @keyframes bitcoin-marker-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 
              0 0 15px rgba(247, 147, 26, 0.6),
              0 4px 12px rgba(0, 0, 0, 0.4),
              inset 0 2px 4px rgba(255, 255, 255, 0.3);
          }
          50% {
            transform: scale(1.1);
            box-shadow: 
              0 0 25px rgba(247, 147, 26, 0.8),
              0 6px 16px rgba(0, 0, 0, 0.5),
              inset 0 2px 4px rgba(255, 255, 255, 0.3);
          }
        }
      `}</style>

      {/* Close button (if modal) */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}


      {/* Selected Post Preview Card */}
      {selectedPost && showPreviewCard && (
        <div
          className="absolute bottom-24 left-4 right-4 z-10 max-w-md mx-auto bg-gray-900/95 backdrop-blur-md rounded-xl shadow-2xl overflow-hidden cursor-pointer border border-amber-500/20"
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
              <h3 className="font-semibold text-white truncate">{selectedPost.title}</h3>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatTimeAgo(new Date(selectedPost.created_at))}</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <Gift className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-sm font-semibold text-amber-400">
                  {formatSatsForPin(selectedPost.reward)} sats
                </span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSelectedPost(null)
              }}
              className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export const GlobeMapView = React.memo(GlobeMapViewComponent)
