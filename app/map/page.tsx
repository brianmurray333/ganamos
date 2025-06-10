"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { MapView } from "@/components/map-view"
import { LoadingSpinner } from "@/components/loading-spinner"
import { useAuth } from "@/components/auth-provider"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { getCurrentLocationWithName } from "@/lib/geocoding"

export default function MapPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [posts, setPosts] = useState([])
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const supabase = createBrowserSupabaseClient()

  const [userLocation, setUserLocation] = useState<{
    latitude: number
    longitude: number
    name: string
    cityBounds?: google.maps.LatLngBounds
  } | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)

  useEffect(() => {
    const initializeMapData = async () => {
      setIsLoading(true)

      try {
        // First get user location
        const location = await getCurrentLocationWithName()
        if (location) {
          setUserLocation({
            latitude: location.latitude,
            longitude: location.longitude,
            name: location.name,
          })

          // Get city bounds using Google Places API
          if (typeof window !== "undefined" && window.google?.maps?.places) {
            const service = new window.google.maps.places.PlacesService(document.createElement("div"))
            const request = {
              query: location.name,
              fields: ["geometry"],
            }

            service.textSearch(request, (results, status) => {
              if (status === window.google.maps.places.PlacesServiceStatus.OK && results?.[0]?.geometry?.viewport) {
                setUserLocation((prev) =>
                  prev
                    ? {
                        ...prev,
                        cityBounds: results[0].geometry.viewport,
                      }
                    : null,
                )
              }
            })
          }
        }
      } catch (error) {
        console.error("Error getting user location:", error)
        setLocationError("Could not get your location")
      }

      // Then fetch posts
      try {
        if (supabase) {
          const { data, error } = await supabase
            .from("posts")
            .select("*")
            .eq("fixed", false)
            .neq("under_review", true)
            .order("created_at", { ascending: false })
          if (error) {
            console.error("Error fetching posts:", error)
            setPosts([])
          } else {
            setPosts(data || [])
          }
        } else {
          setPosts([])
        }
      } catch (error) {
        console.error("Error in fetchPosts:", error)
        setPosts([])
      } finally {
        setIsLoading(false)
      }
    }

    initializeMapData()
  }, [supabase])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <MapView
      posts={posts}
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
