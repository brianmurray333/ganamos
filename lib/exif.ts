/**
 * EXIF metadata extraction utilities
 * Used to extract GPS coordinates from uploaded images
 */

import exifr from 'exifr'

export interface ExifLocation {
  latitude: number
  longitude: number
  altitude?: number
  timestamp?: Date
}

/**
 * Extract GPS coordinates from an image file
 * @param file - Image file or Blob
 * @returns GPS coordinates if available, null otherwise
 */
export async function extractExifLocation(file: File | Blob): Promise<ExifLocation | null> {
  try {
    // Parse EXIF data from the image
    const exifData = await exifr.parse(file, {
      gps: true,  // Only extract GPS data
      pick: ['latitude', 'longitude', 'GPSAltitude', 'DateTimeOriginal', 'CreateDate']
    })

    if (!exifData || !exifData.latitude || !exifData.longitude) {
      console.log('No GPS data found in image')
      return null
    }

    const location: ExifLocation = {
      latitude: exifData.latitude,
      longitude: exifData.longitude,
    }

    // Add altitude if available
    if (exifData.GPSAltitude) {
      location.altitude = exifData.GPSAltitude
    }

    // Add timestamp if available
    if (exifData.DateTimeOriginal) {
      location.timestamp = new Date(exifData.DateTimeOriginal)
    } else if (exifData.CreateDate) {
      location.timestamp = new Date(exifData.CreateDate)
    }

    console.log('📍 Extracted GPS from EXIF:', location)
    return location

  } catch (error) {
    console.error('Error extracting EXIF data:', error)
    return null
  }
}

/**
 * Extract GPS coordinates from a base64 data URL
 * @param dataUrl - Base64 encoded image data URL
 * @returns GPS coordinates if available, null otherwise
 */
export async function extractExifLocationFromDataUrl(dataUrl: string): Promise<ExifLocation | null> {
  try {
    // Convert data URL to blob
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    
    return await extractExifLocation(blob)
  } catch (error) {
    console.error('Error extracting EXIF from data URL:', error)
    return null
  }
}

/**
 * Check if an image has GPS data
 * @param file - Image file or Blob
 * @returns true if GPS data exists
 */
export async function hasGpsData(file: File | Blob): Promise<boolean> {
  try {
    const exifData = await exifr.gps(file)
    return exifData !== null && exifData !== undefined
  } catch (error) {
    return false
  }
}

