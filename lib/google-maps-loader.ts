/**
 * Centralized Google Maps loader utility
 * Ensures the Google Maps JavaScript API is loaded only once
 * and prevents multiple script tag injections
 */

let loadPromise: Promise<void> | null = null
let isLoaded = false

/**
 * Checks if Google Maps is fully loaded, including ControlPosition
 * which may not be immediately available with async loading
 */
function isGoogleMapsFullyLoaded(): boolean {
  return !!(
    window.google?.maps?.Map &&
    window.google?.maps?.ControlPosition &&
    window.google?.maps?.LatLng
  )
}

/**
 * Waits for Google Maps to be fully initialized with all sub-components
 */
function waitForGoogleMapsReady(timeout: number = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isGoogleMapsFullyLoaded()) {
      resolve()
      return
    }

    const startTime = Date.now()
    const checkInterval = setInterval(() => {
      if (isGoogleMapsFullyLoaded()) {
        clearInterval(checkInterval)
        resolve()
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval)
        reject(new Error("Google Maps components loading timeout"))
      }
    }, 50)
  })
}

/**
 * Loads the Google Maps JavaScript API if not already loaded
 * @returns Promise that resolves when Google Maps is ready
 */
export function loadGoogleMaps(): Promise<void> {
  // If already loaded, return immediately
  if (isLoaded && isGoogleMapsFullyLoaded()) {
    return Promise.resolve()
  }

  // If already loading, return the existing promise
  if (loadPromise) {
    return loadPromise
  }

  // Check if script tag already exists (but not yet loaded)
  const existingScript = document.querySelector('script[src*="maps.googleapis.com"]')
  if (existingScript) {
    // Script exists, wait for it to fully load
    loadPromise = waitForGoogleMapsReady()
      .then(() => {
        isLoaded = true
        loadPromise = null
      })
      .catch((error) => {
        loadPromise = null
        throw error
      })
    return loadPromise
  }

  // Create new load promise
  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    // Add loading=async parameter as recommended by Google
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&loading=async`
    script.async = true
    script.defer = true

    script.onload = () => {
      // Wait for all Google Maps components to be fully initialized
      waitForGoogleMapsReady()
        .then(() => {
          isLoaded = true
          loadPromise = null
          resolve()
        })
        .catch((error) => {
          loadPromise = null
          reject(error)
        })
    }

    script.onerror = (error) => {
      loadPromise = null
      reject(new Error("Failed to load Google Maps script"))
    }

    document.head.appendChild(script)
  })

  return loadPromise
}
