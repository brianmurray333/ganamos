export interface LocationData {
  name: string
  latitude: number
  longitude: number
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      throw new Error("Google Maps API key not found")
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`,
    )

    if (!response.ok) {
      throw new Error("Geocoding request failed")
    }

    const data = await response.json()

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const result = data.results[0]

      // Extract city and state from address_components
      let city = ""
      let state = ""

      for (const component of result.address_components) {
        if (component.types.includes("locality")) {
          city = component.long_name
        } else if (component.types.includes("administrative_area_level_1")) {
          state = component.short_name
        }
      }

      if (city && state) {
        return `${city}, ${state}`
      } else if (city) {
        return city
      } else if (state) {
        return state
      }

      // Fallback to formatted_address if available
      if (result.formatted_address) {
        // Clean up formatted address to get just city/state
        const parts = result.formatted_address.split(",")
        if (parts.length >= 2) {
          return parts.slice(0, 2).join(",").trim()
        }
        return result.formatted_address
      }
    }

    // Fallback to coordinates
    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
  } catch (error) {
    console.error("Reverse geocoding failed:", error)
    // Fallback to coordinates on error
    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
  }
}

export async function getCurrentLocationWithName(): Promise<LocationData | null> {
  return new Promise((resolve, reject) => {
    // Changed to reject for better error propagation
    if (!navigator.geolocation) {
      // Create a GeolocationPositionError-like object for consistency
      const error: GeolocationPositionError = {
        code: 0, // Custom code for "not supported"
        message: "Geolocation is not supported by your browser.",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      }
      reject(error) // Reject with the error object
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        try {
          const name = await reverseGeocode(latitude, longitude)
          resolve({
            name,
            latitude,
            longitude,
          })
        } catch (error) {
          console.error("Error getting location name:", error)
          // Resolve with coordinates if reverse geocoding fails
          resolve({
            name: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
            latitude,
            longitude,
          })
        }
      },
      (error) => {
        // This is a GeolocationPositionError
        console.error("Geolocation error in getCurrentLocationWithName:", error.code, error.message)
        reject(error) // Reject with the actual GeolocationPositionError
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  })
}
