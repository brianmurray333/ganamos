"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface LocationEditorModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  currentLocation: { name: string; lat: number; lng: number; displayName?: string } | null
  onLocationChange: (location: { name: string; lat: number; lng: number; displayName?: string } | null) => void
  onGetCurrentLocation?: () => void
  isGettingLocation?: boolean
}

declare global {
  interface Window {
    google?: any
  }
}

export function LocationEditorModal({
  isOpen,
  onOpenChange,
  currentLocation,
  onLocationChange,
  onGetCurrentLocation,
  isGettingLocation = false,
}: LocationEditorModalProps) {
  const [searchQuery, setSearchQuery] = useState(currentLocation?.displayName || currentLocation?.name || "")
  const [searchResults, setSearchResults] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [showResults, setShowResults] = useState(false)
  const [autocompleteService, setAutocompleteService] = useState<google.maps.places.AutocompleteService | null>(null)
  const [placesService, setPlacesService] = useState<google.maps.places.PlacesService | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  // Initialize Google Maps services
  useEffect(() => {
    if (!isOpen) return

    const initializeServices = () => {
      if (!window.google?.maps?.places) return

      const autoService = new window.google.maps.places.AutocompleteService()
      const dummyMap = new window.google.maps.Map(document.createElement("div"))
      const placeService = new window.google.maps.places.PlacesService(dummyMap)

      setAutocompleteService(autoService)
      setPlacesService(placeService)
      setIsLoaded(true)
    }

    if (window.google?.maps?.places) {
      initializeServices()
    } else {
      const checkGoogleMaps = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(checkGoogleMaps)
          initializeServices()
        }
      }, 100)

      // Timeout after 10 seconds
      const timeout = setTimeout(() => {
        clearInterval(checkGoogleMaps)
        console.warn('Google Maps failed to load within 10 seconds')
      }, 10000)

      return () => {
        clearInterval(checkGoogleMaps)
        clearTimeout(timeout)
      }
    }
  }, [isOpen])

  // Update search query when currentLocation changes
  useEffect(() => {
    if (currentLocation) {
      setSearchQuery(currentLocation.displayName || currentLocation.name)
    }
  }, [currentLocation])

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

  const handlePlaceSelect = (placeId: string, description: string) => {
    if (!placesService) return

    placesService.getDetails({ placeId }, (place, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
        const location = {
          name: description,
          lat: place.geometry?.location?.lat() || 0,
          lng: place.geometry?.location?.lng() || 0,
          displayName: description,
        }
        onLocationChange(location)
        setSearchQuery(description)
        setShowResults(false)
      }
    })
  }

  const handleRemoveLocation = () => {
    onLocationChange(null)
    setSearchQuery("")
    setShowResults(false)
    onOpenChange(false)
  }

  const handleUseCurrentLocation = () => {
    if (onGetCurrentLocation) {
      onGetCurrentLocation()
      // Don't close modal - let user see the location being fetched
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Location</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Input
              type="text"
              placeholder={isLoaded ? "Search for a location..." : "Loading Google Maps..."}
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              className="w-full pr-10"
              autoFocus
              disabled={!isLoaded}
            />
            {!isLoaded && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg
                  className="animate-spin h-4 w-4 text-gray-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
            )}
            
            {/* Autocomplete Results */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto">
                {searchResults.map((result) => (
                  <button
                    key={result.place_id}
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors"
                    onClick={() => handlePlaceSelect(result.place_id, result.description)}
                  >
                    <div className="flex items-start gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mt-0.5 text-gray-400 flex-shrink-0"
                      >
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {result.structured_formatting.main_text}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {result.structured_formatting.secondary_text}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            {onGetCurrentLocation && (
              <Button
                type="button"
                variant="outline"
                onClick={handleUseCurrentLocation}
                disabled={isGettingLocation}
                className="w-full"
              >
                {isGettingLocation ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Getting location...
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 2v4" />
                      <path d="M12 18v4" />
                      <path d="M2 12h4" />
                      <path d="M18 12h4" />
                    </svg>
                    Use Current Location
                  </>
                )}
              </Button>
            )}

            {currentLocation && (
              <Button
                type="button"
                variant="outline"
                onClick={handleRemoveLocation}
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-2"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
                Remove Location
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

