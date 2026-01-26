"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"

interface LocationInputProps {
  value: string
  onChange: (value: string, placeDetails?: google.maps.places.PlaceResult) => void
  placeholder?: string
  className?: string
}

declare global {
  interface Window {
    google?: any
  }
}

export function LocationInput({ value, onChange, placeholder, className }: LocationInputProps) {
  const [searchResults, setSearchResults] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [showResults, setShowResults] = useState(false)
  const [autocompleteService, setAutocompleteService] = useState<google.maps.places.AutocompleteService | null>(null)
  const [placesService, setPlacesService] = useState<google.maps.places.PlacesService | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  // Add global CSS for Google Places autocomplete dropdown
  useEffect(() => {
    if (!document.getElementById("google-places-style")) {
      const style = document.createElement("style")
      style.id = "google-places-style"
      style.innerHTML = `
        .pac-container {
          z-index: 9999 !important;
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  const initializeServices = () => {
    if (!window.google?.maps?.places) return

    const autoService = new window.google.maps.places.AutocompleteService()
    // Create a dummy map for PlacesService (required but not displayed)
    const dummyMap = new window.google.maps.Map(document.createElement("div"))
    const placeService = new window.google.maps.places.PlacesService(dummyMap)

    setAutocompleteService(autoService)
    setPlacesService(placeService)
    setIsLoaded(true)
  }

  useEffect(() => {
    // Check if Google Maps is already loaded
    if (window.google?.maps?.places) {
      initializeServices()
    } else {
      // Wait for Google Maps to load
      const checkGoogleMaps = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(checkGoogleMaps)
          initializeServices()
        }
      }, 100)

      // Cleanup interval after 10 seconds
      setTimeout(() => clearInterval(checkGoogleMaps), 10000)
    }
  }, [])

  // Handle search input (same logic as map search bar)
  const handleSearchInput = (query: string) => {
    onChange(query) // Update parent state

    if (!query.trim() || !autocompleteService) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    autocompleteService.getPlacePredictions(
      {
        input: query,
        types: ["establishment", "geocode"], // Same as map search bar
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

  // Handle place selection (same logic as map search bar)
  const handlePlaceSelect = (placeId: string, description: string) => {
    if (!placesService) return

    placesService.getDetails({ placeId }, (place, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
        onChange(description, place)
        setShowResults(false)
      }
    })
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => handleSearchInput(e.target.value)}
        onFocus={() => {
          if (searchResults.length > 0) setShowResults(true)

          // Ensure Google Maps script is loaded via our secure API endpoint
          if (!window.google?.maps?.places && !document.getElementById("google-maps-script")) {
            fetch("/api/maps")
              .then((response) => response.text())
              .then((scriptContent) => {
                const script = document.createElement("script")
                script.id = "google-maps-script"
                script.text = scriptContent
                document.head.appendChild(script)

                // Wait for Google Maps to load and then initialize
                const checkInterval = setInterval(() => {
                  if (window.google?.maps?.places) {
                    clearInterval(checkInterval)
                    initializeServices()
                  }
                }, 100)

                // Cleanup after 10 seconds
                setTimeout(() => clearInterval(checkInterval), 10000)
              })
              .catch((error) => {
                console.error("Failed to load Google Maps script:", error)
              })
          }
        }}
        onBlur={() => {
          // Delay hiding results to allow for clicks
          setTimeout(() => setShowResults(false), 150)
        }}
        placeholder={placeholder}
        className={className}
      />

      {/* Search Results Dropdown with higher z-index and portal-like positioning */}
      {showResults && searchResults.length > 0 && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <div
            className="absolute bg-white rounded-lg shadow-lg border border-gray-200 max-h-60 overflow-y-auto pointer-events-auto"
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "320px",
              maxWidth: "calc(100vw - 2rem)",
            }}
          >
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
        </div>
      )}
    </div>
  )
}
