"use client"

import type React from "react"

import { useRef, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useMobile } from "@/hooks/use-mobile"

export function CameraCapture({ onCapture, onBack }: { onCapture: (imageSrc: string) => void; onBack: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment")
  const isMobile = useMobile()

  // Safe area styles for the camera controls
  const safeAreaStyles = {
    position: "absolute",
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
    left: "0",
    right: "0",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "1rem",
    zIndex: 50,
  } as React.CSSProperties

  useEffect(() => {
    // Add a camera flag to the URL to help with navigation bar hiding
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      if (!url.searchParams.has("camera")) {
        url.searchParams.set("camera", "active")
        window.history.replaceState({}, "", url.toString())
      }

      // Hide the navigation bar when camera is active
      const bottomNav = document.querySelector(".fixed.bottom-0.left-0.z-50.w-full.h-16") as HTMLElement
      if (bottomNav) {
        bottomNav.style.display = "none"
      }
    }

    const startCamera = async () => {
      try {
        const constraints = {
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        }

        try {
          const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
          setStream(mediaStream)

          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream
          }

          setError(null)
        } catch (err) {
          console.error("Error accessing camera:", err)
          setError("Could not access camera. Please check permissions.")
        }
      } catch (e) {
        console.error("Unexpected camera error:", e)
        setError("Camera access is not available in this environment.")
      }
    }

    startCamera()

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }

      // Remove the camera flag when component unmounts
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href)
        if (url.searchParams.has("camera")) {
          url.searchParams.delete("camera")
          window.history.replaceState({}, "", url.toString())
        }

        // Show the navigation bar again when camera is inactive
        const bottomNav = document.querySelector(".fixed.bottom-0.left-0.z-50.w-full.h-16") as HTMLElement
        if (bottomNav) {
          bottomNav.style.display = "grid"
        }
      }
    }
  }, [facingMode])

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current
      const context = canvas.getContext("2d")

      if (context) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0, canvas.width, canvas.height)

        const imageSrc = canvas.toDataURL("image/jpeg")

        // Stop the camera stream after taking photo
        if (stream) {
          stream.getTracks().forEach((track) => track.stop())
          setStream(null)
        }

        onCapture(imageSrc)
      }
    }
  }

  const switchCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }

    setFacingMode((prev) => (prev === "user" ? "environment" : "user"))
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border dark:border-gray-800">
        <CardContent className="p-0 relative">
          {error ? (
            <div className="flex items-center justify-center p-8 text-center">
              <div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mx-auto mb-4 text-muted-foreground"
                >
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <line x1="2" x2="22" y1="2" y2="22" />
                </svg>
                <p className="text-muted-foreground">{error}</p>
                <Button className="mt-4" onClick={() => window.location.reload()}>
                  Try Again
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="absolute top-4 left-4 z-50 bg-black/30 hover:bg-black/40 text-white rounded-full p-2"
                aria-label="Go back"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </Button>
              <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50 bg-black/50 text-white/70 text-xs px-8 py-2 rounded-full shadow-md whitespace-nowrap">
                Take a clear photo of the issue
              </div>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-[85vh] object-cover" />

              {/* Overlay controls on the camera view - using inline styles for safe area */}
              <div style={safeAreaStyles}>
                <Button
                  type="button"
                  size="lg"
                  onClick={takePhoto}
                  className="rounded-full w-16 h-16 p-0 bg-white hover:bg-gray-200 shadow-lg border-4 border-white/75"
                  aria-label="Take Photo"
                >
                  {/* SVG removed for iPhone style button */}
                  <span className="sr-only">Take Photo</span>
                </Button>
              </div>

              {/* Switch camera button positioned at the top-right */}
              {isMobile && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={switchCamera}
                  className="absolute top-4 right-4 bg-black/30 border-0 hover:bg-black/40 text-white"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  <span className="sr-only">Switch Camera</span>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

// Export for dynamic import
export default CameraCapture
