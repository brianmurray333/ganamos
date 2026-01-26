"use client"

import { MapPin } from "lucide-react"
import { useEffect, useState } from "react"

interface StaticMapWidgetProps {
  latitude: number
  longitude: number
  title?: string
  locationLabel?: string
  className?: string
  height?: number
}

export function StaticMapWidget({
  latitude,
  longitude,
  title = "Location",
  locationLabel = "Issue Location",
  className = "",
  height = 250,
}: StaticMapWidgetProps) {
  const [mapUrl, setMapUrl] = useState<string | null>(null)
  const [error, setError] = useState<boolean>(false)

  // Fetch static map URL from helper API
  useEffect(() => {
    const fetchMapUrl = async () => {
      try {
        const params = new URLSearchParams({
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          width: "640",
          height: "400",
          zoom: "15",
        })

        const response = await fetch(`/api/maps/static-url?${params.toString()}`)
        
        if (!response.ok) {
          console.error("Failed to fetch map URL:", response.status)
          setError(true)
          return
        }

        const data = await response.json()
        setMapUrl(data.url)
      } catch (err) {
        console.error("Error fetching map URL:", err)
        setError(true)
      }
    }

    fetchMapUrl()
  }, [latitude, longitude])

  // Generate URL to open in native maps app
  const getDirectionsUrl = () => {
    // Detect if iOS/Apple device
    const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
    
    if (isApple) {
      // Apple Maps
      return `http://maps.apple.com/?q=${latitude},${longitude}&ll=${latitude},${longitude}`
    } else {
      // Google Maps (Android and desktop)
      return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    }
  }

  const handleMapClick = () => {
    window.open(getDirectionsUrl(), "_blank", "noopener,noreferrer")
  }

  // Loading or error state
  if (!mapUrl || error) {
    return (
      <div className={`relative w-full rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 ${className}`} style={{ height: `${height}px` }}>
        <button
          onClick={handleMapClick}
          className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label="Open in maps app"
        >
          <MapPin className="w-8 h-8 mb-2" />
          <p className="text-sm">{error ? "Map unavailable" : "Loading map..."}</p>
          {error && <p className="text-xs mt-1">Tap to open in Maps</p>}
        </button>
      </div>
    )
  }

  return (
    <div className={`relative w-full rounded-lg overflow-hidden ${className}`}>
      <button
        onClick={handleMapClick}
        className="relative w-full h-full group cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg overflow-hidden"
        style={{ height: `${height}px` }}
        aria-label="Open in maps app"
      >
        <img
          src={mapUrl}
          alt={`Map showing ${title}`}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
        
        {/* Overlay gradient for better button visibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        
        {/* "Open in Maps" button overlay */}
        <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-white text-gray-900 px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Open in Maps
          </div>
        </div>

        {/* Location indicator (always visible) - max 50% width, truncates on overflow */}
        <div className="absolute top-3 left-3 max-w-[50%] bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md">
          <div className="flex items-center gap-1.5 text-xs font-medium min-w-0">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse flex-shrink-0" />
            <span className="text-gray-900 dark:text-gray-100 truncate">{locationLabel}</span>
          </div>
        </div>
      </button>
    </div>
  )
}
