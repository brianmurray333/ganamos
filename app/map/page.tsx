"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { MapPageSkeleton } from "@/components/map-placeholder"
import { getCachedLocation, getCurrentLocationWithName } from "@/lib/geocoding"

const MapView = dynamic(
  () => import("@/components/map-view").then((mod) => mod.MapView),
  {
    ssr: false,
    // Same chrome + neutral canvas as app/map/loading.tsx, so nothing changes
    // visually until the real map fades in.
    loading: () => <MapPageSkeleton />,
  }
)

// Stable reference: MapView is memoised on the posts prop and fetches posts itself.
const NO_POSTS: never[] = []

type MapUserLocation = {
  latitude: number
  longitude: number
  zoomType: string
  name: string
  bounds?: any
  lat: number
  lng: number
  cityBounds?: any
}

function toMapLocation(location: { latitude: number; longitude: number; name: string }): MapUserLocation {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    zoomType: "city",
    name: location.name,
    lat: location.latitude,
    lng: location.longitude,
    bounds: undefined,
  }
}

export default function MapPage() {
  const router = useRouter()

  // On large screens, redirect to dashboard (which has side-by-side view)
  useEffect(() => {
    const checkScreenSize = () => {
      if (window.innerWidth >= 1024) {
        // lg breakpoint - redirect to dashboard
        router.replace('/')
      }
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [router])

  // Render the map right away. Previously the page waited for geolocation
  // (up to 10s for a fresh GPS fix) and a full posts query before even
  // mounting the map, behind a "Loading..." spinner. Now we start from the
  // last known location (if any) and refine it in the background; MapView
  // fetches posts itself and recentres when a fresher location arrives.
  const [userLocation, setUserLocation] = useState<MapUserLocation | null>(() => {
    if (typeof window === "undefined") return null
    const cached = getCachedLocation()
    return cached ? toMapLocation(cached) : null
  })

  useEffect(() => {
    let cancelled = false

    const resolveLocation = async () => {
      try {
        const location = await getCurrentLocationWithName({ useCache: true, preferCached: true })
        if (cancelled || !location) return

        setUserLocation((prev) =>
          prev && prev.latitude === location.latitude && prev.longitude === location.longitude && prev.name === location.name
            ? prev
            : toMapLocation(location),
        )

        // Get city bounds using Google Places API
        if (typeof window !== "undefined" && window.google?.maps?.places) {
          const service = new window.google.maps.places.PlacesService(document.createElement("div"))
          service.textSearch({ query: location.name, fields: ["geometry"] } as any, (results: any, status: any) => {
            if (cancelled) return
            if (status === window.google.maps.places.PlacesServiceStatus.OK && results?.[0]?.geometry?.viewport) {
              setUserLocation((prev) => (prev ? { ...prev, cityBounds: results[0].geometry.viewport } : null))
            }
          })
        }
      } catch (error) {
        // No location (denied / unavailable / timeout): the map still works,
        // it just isn't centred on the user.
        console.error("Error getting user location:", error)
      }
    }

    resolveLocation()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <MapView
      posts={NO_POSTS}
      onClose={() => window.history.back()}
      userLocation={userLocation}
      cityName={userLocation?.name || null}
      cityBounds={
        userLocation?.cityBounds
          ? {
              north: userLocation.cityBounds.getNorthEast().lat(),
              south: userLocation.cityBounds.getSouthWest().lat(),
              east: userLocation.cityBounds.getNorthEast().lng(),
              west: userLocation.cityBounds.getSouthWest().lng(),
            }
          : null
      }
    />
  )
}
