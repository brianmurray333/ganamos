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
  // The location pill and "Open in Maps" button appear together with the map
  // image, not before it.
  const [imageLoaded, setImageLoaded] = useState(false)

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

  if (error) {
    return (
      <div className={`relative w-full rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 ${className}`} style={{ height: `${height}px` }}>
        <button
          onClick={handleMapClick}
          className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label="Open in maps app"
        >
          <MapPin className="w-8 h-8 mb-2" />
          <p className="text-sm">Map unavailable</p>
          <p className="text-xs mt-1">Tap to open in Maps</p>
        </button>
      </div>
    )
  }

  return (
    <div
      className={`relative w-full rounded-lg overflow-hidden bg-muted ${imageLoaded ? "" : "animate-pulse"} ${className}`}
      style={{ height: `${height}px` }}
    >
      {mapUrl && (
        <button
          onClick={handleMapClick}
          className={`relative w-full h-full group cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg overflow-hidden transition-opacity duration-500 ease-out ${imageLoaded ? "opacity-100" : "opacity-0"}`}
          aria-label="Open in maps app"
          data-no-fade
        >
          <img
            src={mapUrl}
            alt={`Map showing ${title}`}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            onLoad={() => setImageLoaded(true)}
            onError={() => setError(true)}
          />

          {/* "Open in Maps" button: always shown on touch screens, on hover with a mouse */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
            <div className="bg-white text-gray-900 px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 whitespace-nowrap">
              <MapPin className="w-4 h-4" />
              Open in Maps
            </div>
          </div>

          {/* Location label - max 60% width, truncates on overflow */}
          <div className="absolute top-3 left-3 max-w-[60%] bg-white/90 dark:bg-gray-900/85 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md">
            <div className="flex items-center gap-1.5 text-xs font-medium min-w-0">
              <div className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" />
              <span className="text-gray-900 dark:text-gray-100 truncate">{locationLabel}</span>
            </div>
          </div>
        </button>
      )}
    </div>
  )
}
