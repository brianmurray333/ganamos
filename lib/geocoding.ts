export interface LocationData {
  name: string
  latitude: number
  longitude: number
  // Add standardized components
  locality?: string
  admin_area_1?: string
  admin_area_2?: string
  country?: string
  country_code?: string
}

export interface StandardizedLocation {
  locality?: string // City
  admin_area_1?: string // State/Province/Prefecture
  admin_area_2?: string // County/District
  country?: string
  country_code?: string
}

export interface TravelTimes {
  walking: string | null
  driving: string | null
}

// Location permission state management
export interface LocationPermissionState {
  status: 'granted' | 'denied' | 'prompt' | 'unknown'
  lastChecked: number
  cachedLocation?: LocationData
}

const LOCATION_PERMISSION_KEY = 'ganamos_location_permission'
const CACHED_LOCATION_KEY = 'ganamos_cached_location'
const PERMISSION_CACHE_DURATION = 14 * 24 * 60 * 60 * 1000 // 2 weeks

// In-memory cache for geocoding results to prevent duplicate API calls
const geocodingCache = new Map<string, {result: string, timestamp: number}>()
const geocodingPromises = new Map<string, Promise<string>>()
const GEOCODING_CACHE_DURATION = 60 * 60 * 1000 // 1 hour

// Get stored location permission state
export function getLocationPermissionState(): LocationPermissionState {
  if (typeof window === 'undefined') {
    return { status: 'unknown', lastChecked: 0 }
  }

  try {
    const stored = localStorage.getItem(LOCATION_PERMISSION_KEY)
    if (stored) {
      const state = JSON.parse(stored) as LocationPermissionState
      // Check if cache is still valid (24 hours)
      if (Date.now() - state.lastChecked < PERMISSION_CACHE_DURATION) {
        return state
      }
    }
  } catch (error) {
    console.error('Error reading location permission state:', error)
  }

  return { status: 'unknown', lastChecked: 0 }
}

// Save location permission state
export function saveLocationPermissionState(state: LocationPermissionState): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(LOCATION_PERMISSION_KEY, JSON.stringify({
      ...state,
      lastChecked: Date.now()
    }))
  } catch (error) {
    console.error('Error saving location permission state:', error)
  }
}

// Get cached location data
export function getCachedLocation(): LocationData | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(CACHED_LOCATION_KEY)
    if (stored) {
      const cached = JSON.parse(stored)
      // Check if cache is still valid (24 hours)
      if (Date.now() - cached.timestamp < PERMISSION_CACHE_DURATION) {
        return cached.location
      }
    }
  } catch (error) {
    console.error('Error reading cached location:', error)
  }

  return null
}

// Save location data to cache
export function saveCachedLocation(location: LocationData): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(CACHED_LOCATION_KEY, JSON.stringify({
      location,
      timestamp: Date.now()
    }))
  } catch (error) {
    console.error('Error saving cached location:', error)
  }
}

// Clear location permission and cached data (for settings/reset)
export function clearLocationData(): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(LOCATION_PERMISSION_KEY)
    localStorage.removeItem(CACHED_LOCATION_KEY)
    console.log('Location permission and cached data cleared')
  } catch (error) {
    console.error('Error clearing location data:', error)
  }
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const cacheKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`
  
  // Check memory cache first
  const cached = geocodingCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < GEOCODING_CACHE_DURATION) {
    console.log('Returning cached geocoding result for:', cacheKey)
    return cached.result
  }
  
  // Check if there's already a pending request for this location
  const pendingPromise = geocodingPromises.get(cacheKey)
  if (pendingPromise) {
    console.log('Returning pending geocoding promise for:', cacheKey)
    return pendingPromise
  }
  
  // Create new promise for this request
  const promise = (async () => {
    try {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      if (!apiKey) {
        throw new Error("Google Maps API key not found")
      }

      // Use centralized config for URL resolution (supports mock mode)
      const url =
        typeof window === 'undefined' && (await import('./env')).serverEnv?.googleMaps.useMock
          ? (await import('./env')).serverEnv!.googleMaps.getGeocodingUrl(latitude, longitude)
          : `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error("Geocoding request failed")
      }

      const data = await response.json()

      let result = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`

      if (data.status === "OK" && data.results && data.results.length > 0) {
        const firstResult = data.results[0]

        // Extract city and state from address_components
        let city = ""
        let state = ""

        for (const component of firstResult.address_components) {
          if (component.types.includes("locality")) {
            city = component.long_name
          } else if (component.types.includes("administrative_area_level_1")) {
            state = component.short_name
          }
        }

        if (city && state) {
          result = `${city}, ${state}`
        } else if (city) {
          result = city
        } else if (state) {
          result = state
        } else if (firstResult.formatted_address) {
          // Fallback to formatted_address if available
          const parts = firstResult.formatted_address.split(",")
          if (parts.length >= 2) {
            result = parts.slice(0, 2).join(",").trim()
          } else {
            result = firstResult.formatted_address
          }
        }
      }

      // Cache the result
      geocodingCache.set(cacheKey, { result, timestamp: Date.now() })
      return result
    } catch (error) {
      console.error("Reverse geocoding failed:", error)
      // Fallback to coordinates on error
      const fallback = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
      // Cache error fallback too (shorter duration implicitly via timestamp)
      geocodingCache.set(cacheKey, { result: fallback, timestamp: Date.now() })
      return fallback
    } finally {
      // Remove from pending promises
      geocodingPromises.delete(cacheKey)
    }
  })()
  
  // Store the pending promise
  geocodingPromises.set(cacheKey, promise)
  
  return promise
}

export async function getStandardizedLocation(
  latitude: number,
  longitude: number,
): Promise<StandardizedLocation | null> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      throw new Error("Google Maps API key not found")
    }

    // Use centralized config for URL resolution (supports mock mode)
    const url =
      typeof window === 'undefined' && (await import('./env')).serverEnv?.googleMaps.useMock
        ? (await import('./env')).serverEnv!.googleMaps.getGeocodingUrl(latitude, longitude)
        : `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error("Geocoding request failed")
    }

    const data = await response.json()

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const result = data.results[0]
      const location: StandardizedLocation = {}

      // Extract standardized components
      for (const component of result.address_components) {
        if (component.types.includes("locality")) {
          location.locality = component.long_name
        } else if (component.types.includes("administrative_area_level_1")) {
          location.admin_area_1 = component.long_name
        } else if (component.types.includes("administrative_area_level_2")) {
          location.admin_area_2 = component.long_name
        } else if (component.types.includes("country")) {
          location.country = component.long_name
          location.country_code = component.short_name
        }
      }

      return location
    }

    return null
  } catch (error) {
    console.error("Standardized geocoding failed:", error)
    return null
  }
}

export async function getCurrentLocationWithName(options?: { 
  forceRefresh?: boolean 
  useCache?: boolean 
}): Promise<LocationData | null> {
  const { forceRefresh = false, useCache = true } = options || {}

  // Check permission state first
  const permissionState = getLocationPermissionState()
  
  // If user previously denied permission, don't ask again
  if (permissionState.status === 'denied' && !forceRefresh) {
    // If denied but we have cached location, return it as fallback
    if (useCache) {
      const cachedLocation = getCachedLocation()
      if (cachedLocation) {
        console.log('Permission denied, using cached location data')
        return Promise.resolve(cachedLocation)
      }
    }
    const error: GeolocationPositionError = {
      code: 1, // PERMISSION_DENIED
      message: "Location permission was previously denied.",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    }
    throw error
  }

  // Get cached location for fallback (if permission granted and fresh fetch fails)
  const cachedLocationForFallback = useCache ? getCachedLocation() : null

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      const error: GeolocationPositionError = {
        code: 0, // Custom code for "not supported"
        message: "Geolocation is not supported by your browser.",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      }
      // Save denied state
      saveLocationPermissionState({ status: 'denied', lastChecked: Date.now() })
      reject(error)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        try {
          const name = await reverseGeocode(latitude, longitude)
          const standardized = await getStandardizedLocation(latitude, longitude)

          const locationData: LocationData = {
            name,
            latitude,
            longitude,
            ...standardized,
          }

          // Save successful permission state and cache location
          saveLocationPermissionState({ status: 'granted', lastChecked: Date.now() })
          saveCachedLocation(locationData)

          resolve(locationData)
        } catch (error) {
          console.error("Error getting location name:", error)
          // Resolve with coordinates if reverse geocoding fails
          const locationData: LocationData = {
            name: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
            latitude,
            longitude,
          }
          
          // Still save permission state and cache even with geocoding failure
          saveLocationPermissionState({ status: 'granted', lastChecked: Date.now() })
          saveCachedLocation(locationData)
          
          resolve(locationData)
        }
      },
      (error) => {
        console.error("Geolocation error in getCurrentLocationWithName:", error.code, error.message)
        
        // Save permission state based on error type
        if (error.code === 1) { // PERMISSION_DENIED
          saveLocationPermissionState({ status: 'denied', lastChecked: Date.now() })
        } else {
          // For other errors (timeout, unavailable, etc.), try cached location as fallback
          // if permission was previously granted
          if (permissionState.status === 'granted' && cachedLocationForFallback) {
            console.log('Fresh location failed, using cached location as fallback')
            resolve(cachedLocationForFallback)
            return
          }
          // For other errors, don't change permission state
          console.log('Geolocation failed but not due to permission denial')
        }
        
        reject(error)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }, // Use 5-minute cache for position
    )
  })
}

export async function getTravelTimes(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number
): Promise<TravelTimes> {
  try {
    // Call the Next.js API route instead of Google directly
    const origin = `${originLat},${originLng}`
    const destination = `${destinationLat},${destinationLng}`
    const res = await fetch(`/api/travel-times?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`)
    if (!res.ok) throw new Error("Failed to fetch travel times from API route")
    const data = await res.json()
    return { walking: data.walking, driving: data.driving }
  } catch (error) {
    console.error("Error getting travel times:", error)
    return { walking: null, driving: null }
  }
}
