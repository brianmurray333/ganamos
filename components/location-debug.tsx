"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

export function LocationDebug() {
  const [status, setStatus] = useState<string>("Ready to test")
  const [position, setPosition] = useState<GeolocationPosition | null>(null)
  const [error, setError] = useState<GeolocationPositionError | null>(null)

  const testBasicGeolocation = () => {
    setStatus("Testing basic geolocation...")
    setPosition(null)
    setError(null)

    if (!navigator.geolocation) {
      setStatus("❌ Geolocation not supported")
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("✅ Geolocation successful")
        setPosition(pos)
        console.log("Geolocation success:", pos)
      },
      (err) => {
        setStatus(`❌ Geolocation failed: ${err.message}`)
        setError(err)
        console.error("Geolocation error:", err)
        console.error("Error code:", err.code)
        console.error("Error message:", err.message)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    )
  }

  const testLowAccuracyGeolocation = () => {
    setStatus("Testing low accuracy geolocation...")
    setPosition(null)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("✅ Low accuracy geolocation successful")
        setPosition(pos)
        console.log("Low accuracy geolocation success:", pos)
      },
      (err) => {
        setStatus(`❌ Low accuracy geolocation failed: ${err.message}`)
        setError(err)
        console.error("Low accuracy geolocation error:", err)
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 300000,
      },
    )
  }

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <h3 className="font-semibold">Location Debug Tool</h3>

      <div className="space-y-2">
        <Button onClick={testBasicGeolocation} variant="outline" className="w-full">
          Test Basic Geolocation
        </Button>
        <Button onClick={testLowAccuracyGeolocation} variant="outline" className="w-full">
          Test Low Accuracy Geolocation
        </Button>
      </div>

      <div className="text-sm">
        <p>
          <strong>Status:</strong> {status}
        </p>

        {position && (
          <div className="mt-2 p-2 bg-green-50 rounded">
            <p>
              <strong>✅ Position:</strong>
            </p>
            <p>Latitude: {position.coords.latitude}</p>
            <p>Longitude: {position.coords.longitude}</p>
            <p>Accuracy: {position.coords.accuracy}m</p>
            <p>Timestamp: {new Date(position.timestamp).toLocaleString()}</p>
          </div>
        )}

        {error && (
          <div className="mt-2 p-2 bg-red-50 rounded">
            <p>
              <strong>❌ Error:</strong>
            </p>
            <p>Code: {error.code}</p>
            <p>Message: {error.message}</p>
            <p>
              Code meaning:{" "}
              {error.code === 1
                ? "PERMISSION_DENIED"
                : error.code === 2
                  ? "POSITION_UNAVAILABLE"
                  : error.code === 3
                    ? "TIMEOUT"
                    : "UNKNOWN"}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
