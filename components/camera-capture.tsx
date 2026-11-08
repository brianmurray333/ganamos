"use client"

import type React from "react"

import { useRef, useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useMobile } from "@/hooks/use-mobile"

export function CameraCapture({ 
  onCapture, 
  onGalleryClick,
  onSkip,
}: { 
  onCapture: (imageSrc: string) => void
  onGalleryClick?: () => void
  onSkip?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Bumped to force the camera effect to re-run (e.g. after the PWA resumes)
  const [restartKey, setRestartKey] = useState(0)
  // Keep the video hidden until it has been sized to fill the screen, so the
  // user never sees the intrinsic-size "small rectangle" flash.
  const [videoReady, setVideoReady] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment")
  const [videoRotation, setVideoRotation] = useState(0)
  const isMobile = useMobile()

  // Handle device orientation changes to fix upside-down camera issue
  useEffect(() => {
    if (typeof window === "undefined") return

    const handleOrientationChange = () => {
      // Get the current orientation
      const orientation = window.screen?.orientation?.angle ?? window.orientation ?? 0
      
      // On some devices/browsers, when in landscape mode, the camera may appear upside down
      // We detect this and apply a correction rotation
      // Common angles: 0 = portrait, 90 = landscape-left, -90/270 = landscape-right, 180 = portrait-upside-down
      
      // For most devices, we don't need to rotate - the browser handles it
      // But some iOS devices in landscape-right (-90) may need correction
      // We'll track the orientation angle for canvas capture to ensure correct photo orientation
      setVideoRotation(Number(orientation) || 0)
    }

    // Listen to both modern and legacy orientation APIs
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener("change", handleOrientationChange)
    }
    window.addEventListener("orientationchange", handleOrientationChange)
    
    // Initial check
    handleOrientationChange()

    return () => {
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener("change", handleOrientationChange)
      }
      window.removeEventListener("orientationchange", handleOrientationChange)
    }
  }, [])

  // Helper to check if we've already been granted camera access
  // Uses localStorage instead of sessionStorage so permission state persists across PWA sessions
  const CAMERA_PERMISSION_KEY = 'ganamos_camera_permission'
  const CAMERA_PERMISSION_DURATION = 30 * 24 * 60 * 60 * 1000 // 30 days

  const getCameraPermissionFromStorage = () => {
    if (typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem(CAMERA_PERMISSION_KEY)
      if (stored) {
        const { granted, timestamp } = JSON.parse(stored)
        // Check if stored permission is still valid (30 days)
        if (granted && Date.now() - timestamp < CAMERA_PERMISSION_DURATION) {
          return true
        }
      }
    } catch {
      // Silently fail
    }
    return false
  }

  const saveCameraPermissionToStorage = (granted: boolean) => {
    if (typeof window === 'undefined') return
    try {
      if (granted) {
        localStorage.setItem(CAMERA_PERMISSION_KEY, JSON.stringify({ 
          granted: true, 
          timestamp: Date.now() 
        }))
      } else {
        localStorage.removeItem(CAMERA_PERMISSION_KEY)
      }
    } catch {
      // Silently fail
    }
  }

  useEffect(() => {
    // Add a camera flag to the URL to help with navigation bar hiding
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      if (!url.searchParams.has("camera")) {
        url.searchParams.set("camera", "active")
        window.history.replaceState({}, "", url.toString())
      }

      // Robustly hide the navigation bar when camera is active
      function hideNav() {
        // Try id first, fallback to class selector
        const bottomNav = document.getElementById("bottom-nav")
        if (bottomNav) {
          (bottomNav as HTMLElement).style.display = "none"
        }
      }
      hideNav()
      // Use MutationObserver in case nav appears after mount
      const observer = new MutationObserver(hideNav)
      observer.observe(document.body, { childList: true, subtree: true })
      // Store observer for cleanup
      ;(window as any)._cameraNavObserver = observer
    }

    // Set by cleanup so a start that is still in flight (camera switch,
    // resume restart, React strict-mode remount) can't clobber a newer one.
    let cancelled = false

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
          // Check if we already have permission from this session (skip permission check)
          const hasStoredPermission = getCameraPermissionFromStorage()
          
          if (hasStoredPermission) {
            console.log("📷 Camera permission already granted this session, skipping check")
          } else {
            console.log("📷 Checking camera permission...")
            
            // Check camera permission state before requesting (Safari compatibility)
            if (navigator.permissions?.query) {
              try {
                const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName })
                console.log("📷 Camera permission state:", permissionStatus.state)
                
                if (permissionStatus.state === 'denied') {
                  setError('Camera permission denied. Please enable camera access in your browser settings.')
                  return
                }
                
                // If already granted, save to session to skip future checks
                if (permissionStatus.state === 'granted') {
                  saveCameraPermissionToStorage(true)
                }
              } catch (permError) {
                console.warn('📷 Permission API not available, proceeding with getUserMedia:', permError)
              }
            } else {
              console.log("📷 Permissions API not available (Safari?), proceeding with getUserMedia")
            }
          }
          
          const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
          if (cancelled) {
            mediaStream.getTracks().forEach((track) => track.stop())
            return
          }
          console.log("📷 Got media stream:", mediaStream.id)
          
          // Successfully got camera - save permission state for this session
          saveCameraPermissionToStorage(true)
          
          // Store stream ref FIRST before any state updates
          streamRef.current = mediaStream

          if (videoRef.current) {
            const video = videoRef.current
            video.srcObject = mediaStream
            
            // Wait for video to be ready to play
            await new Promise<void>((resolve, reject) => {
              const timeoutId = setTimeout(() => {
                reject(new Error("Video load timeout"))
              }, 5000)
              
              video.onloadedmetadata = () => {
                console.log("📷 Video metadata loaded")
                clearTimeout(timeoutId)
                resolve()
              }
              
              video.onerror = (e) => {
                console.error("📷 Video error:", e)
                clearTimeout(timeoutId)
                reject(new Error("Video element error"))
              }
            })
            
            if (cancelled) return

            // Explicitly call play() for iOS Safari compatibility
            try {
              await video.play()
              console.log("📷 Video playing successfully")
            } catch (playErr) {
              console.warn("📷 Autoplay blocked, user interaction may be needed:", playErr)
            }
          }

          if (cancelled) return

          // Size the video to fill the screen before revealing it
          if (layoutVideo()) setVideoReady(true)

          // Update state AFTER video is playing
          setStream(mediaStream)
          setError(null)
          console.log("📷 Camera setup complete")
        } catch (err) {
          if (cancelled) return
          console.error("Error accessing camera:", err)
          // Clear stored permission on error (might have been revoked)
          saveCameraPermissionToStorage(false)
          setError("Could not access camera. Please check permissions.")
        }
      } catch (e) {
        console.error("Unexpected camera error:", e)
        setError("Camera access is not available in this environment.")
      }
    }

    startCamera()

    return () => {
      cancelled = true
      // Stop the camera stream using ref for reliable cleanup
      if (streamRef.current) {
        console.log("🔴 Camera cleanup: stopping stream tracks")
        streamRef.current.getTracks().forEach((track) => {
          track.stop()
          console.log("🔴 Stopped track:", track.kind, track.label)
        })
        streamRef.current = null
      }
      setStream(null)

      // Remove the camera flag when component unmounts
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href)
        if (url.searchParams.has("camera")) {
          url.searchParams.delete("camera")
          window.history.replaceState({}, "", url.toString())
        }
        // Restore the navigation bar
        const bottomNav = document.getElementById("bottom-nav")
        if (bottomNav) {
          (bottomNav as HTMLElement).style.display = "grid"
        }
        // Disconnect MutationObserver
        if ((window as any)._cameraNavObserver) {
          (window as any)._cameraNavObserver.disconnect()
          delete (window as any)._cameraNavObserver
        }
      }
    }
  }, [facingMode, restartKey])

  // Size the video to "cover" the container ourselves. iOS WebKit sometimes
  // ignores object-fit: cover on MediaStream videos (initially, and after the
  // app returns from the background) and renders them letterboxed at their
  // intrinsic aspect ratio. Explicit sizing avoids relying on object-fit.
  const layoutVideo = useCallback(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container) return false
    const vw = video.videoWidth
    const vh = video.videoHeight
    const cw = container.clientWidth
    const ch = container.clientHeight
    if (!vw || !vh || !cw || !ch) return false
    const scale = Math.max(cw / vw, ch / vh)
    const w = Math.ceil(vw * scale)
    const h = Math.ceil(vh * scale)
    video.style.width = `${w}px`
    video.style.height = `${h}px`
    video.style.left = `${Math.round((cw - w) / 2)}px`
    video.style.top = `${Math.round((ch - h) / 2)}px`
    return true
  }, [])

  // Re-layout on viewport changes and whenever the stream's dimensions change
  useEffect(() => {
    const video = videoRef.current
    const onLayout = () => {
      if (layoutVideo()) setVideoReady(true)
    }
    window.addEventListener("resize", onLayout)
    window.visualViewport?.addEventListener("resize", onLayout)
    video?.addEventListener("resize", onLayout)
    video?.addEventListener("loadedmetadata", onLayout)
    video?.addEventListener("playing", onLayout)
    return () => {
      window.removeEventListener("resize", onLayout)
      window.visualViewport?.removeEventListener("resize", onLayout)
      video?.removeEventListener("resize", onLayout)
      video?.removeEventListener("loadedmetadata", onLayout)
      video?.removeEventListener("playing", onLayout)
    }
  }, [layoutVideo, error])

  // When the PWA comes back to the foreground, iOS has usually suspended or
  // ended the camera track. Restart the camera (or at least resume playback
  // and re-layout) so the preview doesn't get stuck small or frozen.
  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState !== "visible") return
      const tracks = streamRef.current?.getVideoTracks() ?? []
      const dead =
        tracks.length === 0 ||
        tracks.some((t) => t.readyState === "ended" || t.muted)
      if (dead) {
        console.log("📷 App resumed with inactive camera, restarting")
        setVideoReady(false)
        setRestartKey((k) => k + 1)
        return
      }
      const video = videoRef.current
      if (video?.paused) video.play().catch(() => {})
      requestAnimationFrame(() => {
        if (layoutVideo()) setVideoReady(true)
      })
    }
    document.addEventListener("visibilitychange", onResume)
    window.addEventListener("pageshow", onResume)
    return () => {
      document.removeEventListener("visibilitychange", onResume)
      window.removeEventListener("pageshow", onResume)
    }
  }, [layoutVideo])

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current
      const context = canvas.getContext("2d")

      if (context) {
        // Handle orientation for proper photo capture
        const needsRotation = Math.abs(videoRotation) === 90 || Math.abs(videoRotation) === 270
        
        if (needsRotation) {
          // In landscape mode, swap width and height
          canvas.width = video.videoHeight
          canvas.height = video.videoWidth
          
          // Apply rotation transform
          context.save()
          context.translate(canvas.width / 2, canvas.height / 2)
          context.rotate((videoRotation * Math.PI) / 180)
          context.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2)
          context.restore()
        } else {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          context.drawImage(video, 0, 0, canvas.width, canvas.height)
        }

        const imageSrc = canvas.toDataURL("image/jpeg")

        // Stop the camera stream after taking photo
        console.log("📸 Photo taken: stopping camera stream")
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => {
            track.stop()
            console.log("📸 Stopped track:", track.kind)
          })
          streamRef.current = null
        }
        setStream(null)

        onCapture(imageSrc)
      }
    }
  }

  const switchCamera = () => {
    console.log("🔄 Switching camera")
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setStream(null)
    setVideoReady(false)

    setFacingMode((prev) => (prev === "user" ? "environment" : "user"))
  }

  return (
    <div className="fixed inset-0 z-40">
      <style jsx>{`
        .camera-preview-container {
          /* Use inset: 0 as primary - stretches to all viewport edges */
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          /* Fallbacks for older browsers */
          width: 100%;
          height: 100%;
          /* Modern viewport units as additional constraint */
          min-height: 100dvh;
          min-height: -webkit-fill-available;
          background: #000;
          overflow: hidden;
          /* Prevent any layout shift during orientation */
          contain: layout size style;
        }
        .camera-preview-video {
          /* Explicit width/height/left/top are set in JS (layoutVideo) to
             cover the screen; these are fallbacks until then. */
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          max-width: none;
          object-fit: cover;
          transition: opacity 120ms ease-out;
          background: #000;
          /* GPU acceleration for smoother transitions */
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
        }
        .camera-capture-btn {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
          z-index: 50;
        }
      `}</style>
      {error ? (
        <div className="flex items-center justify-center min-h-screen p-4 bg-background">
          <Card className="overflow-hidden border dark:border-gray-800 w-full max-w-sm">
            <CardContent className="p-8">
              <div className="flex items-center justify-center text-center">
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
            </CardContent>
          </Card>
        </div>
      ) : (
        <div ref={containerRef} className="camera-preview-container">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            // @ts-ignore - webkit-playsinline is needed for iOS Safari
            webkit-playsinline=""
            muted
            className="camera-preview-video"
            style={{ opacity: videoReady ? 1 : 0 }}
          />
          {/* Overlay controls on the camera view */}
          <div className="camera-capture-btn">
            <Button
              type="button"
              size="lg"
              onClick={takePhoto}
              className="relative rounded-full w-24 h-24 p-0 bg-white hover:bg-gray-100 shadow-lg border-4 border-white"
            >
              <div className="w-[76px] h-[76px] bg-white rounded-full border-2 border-gray-300"></div>
              <span className="sr-only">Take Photo</span>
            </Button>
          </div>
          {/* Close button */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => window.history.back()}
            className="absolute left-4 h-14 w-14 [&_svg]:size-7 rounded-full bg-black/40 backdrop-blur-sm border-0 hover:bg-black/50 text-white/90"
            style={{ top: `calc(env(safe-area-inset-top, 0px) + 16px)` }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            <span className="sr-only">Close</span>
          </Button>
          {isMobile && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={switchCamera}
              className="absolute right-4 h-14 w-14 [&_svg]:size-7 rounded-full bg-black/40 backdrop-blur-sm border-0 hover:bg-black/50 text-white/90"
              style={{ top: `calc(env(safe-area-inset-top, 0px) + 16px)` }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
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
          {/* Gallery/Upload button - lower left */}
          {onGalleryClick && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onGalleryClick}
              className="absolute left-4 h-14 w-14 [&_svg]:size-7 rounded-full bg-black/40 backdrop-blur-sm border-0 hover:bg-black/50 text-white/90"
              style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + 40px)` }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                <circle cx="9" cy="9" r="2"/>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
              </svg>
              <span className="sr-only">Upload from Gallery</span>
            </Button>
          )}
          {/* Skip button - lower right */}
          {onSkip && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onSkip}
              className="absolute right-4 h-14 w-14 [&_svg]:size-7 rounded-full bg-black/40 backdrop-blur-sm border-0 hover:bg-black/50 text-white/90"
              style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + 40px)` }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
              <span className="sr-only">Skip</span>
            </Button>
          )}
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

// Export for dynamic import
export default CameraCapture
