// Mock location data for the prototype
export type MockLocation = {
  id: string
  name: string
  description: string
  distance: string // e.g. "0.5 miles away"
  lat: number
  lng: number
}

export const mockLocations: MockLocation[] = [
  {
    id: "downtown",
    name: "Downtown",
    description: "City center with shops and restaurants",
    distance: "0.3 miles away",
    lat: 37.7749,
    lng: -122.4194,
  },
  {
    id: "park",
    name: "Central Park",
    description: "Large public park with walking trails",
    distance: "0.8 miles away",
    lat: 37.7694,
    lng: -122.4862,
  },
  {
    id: "beach",
    name: "Ocean Beach",
    description: "Sandy beach with ocean views",
    distance: "1.2 miles away",
    lat: 37.7691,
    lng: -122.5107,
  },
]

// Default location to use when none is selected
export const defaultLocation = mockLocations[0] // Downtown

// Local storage key for saving selected location
export const LOCATION_STORAGE_KEY = "motc_selected_location"

// Get the currently selected location from storage or use default
export function getCurrentLocation(): MockLocation {
  if (typeof window === "undefined") {
    return defaultLocation
  }

  // Always set to downtown if not already set
  const storedLocationId = localStorage.getItem(LOCATION_STORAGE_KEY)
  if (!storedLocationId) {
    saveSelectedLocation("downtown")
    return defaultLocation
  }

  const foundLocation = mockLocations.find((loc) => loc.id === storedLocationId)
  return foundLocation || defaultLocation
}

// Save selected location to storage
export function saveSelectedLocation(locationId: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(LOCATION_STORAGE_KEY, locationId)
  }
}
