"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { X, Camera } from "lucide-react"
import jsQR from "jsqr"

interface QRScannerProps {
  onScan: (data: string) => void
  onClose: () => void
  isOpen: boolean
}

export function QRScanner({ onScan, onClose, isOpen }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize camera when component opens
  useEffect(() => {
    if (isOpen) {
      startCamera()
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [isOpen])

  const startCamera = async () => {
    try {
      setError(null)
      setIsScanning(true)

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Use back camera on mobile
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()

        // Start scanning for QR codes
        startQRDetection()
      }
    } catch (err) {
      console.error("Error accessing camera:", err)
      setError("Unable to access camera. Please check permissions.")
      setIsScanning(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
    
    setIsScanning(false)
  }

  const startQRDetection = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    if (!context) return

    // Scan for QR codes every 500ms
    scanIntervalRef.current = setInterval(() => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0, canvas.width, canvas.height)

        try {
          // Use browser's built-in barcode detection if available
          if ('BarcodeDetector' in window) {
            const barcodeDetector = new (window as any).BarcodeDetector({
              formats: ['qr_code']
            })
            
            barcodeDetector.detect(canvas)
              .then((barcodes: any[]) => {
                if (barcodes.length > 0) {
                  const qrData = barcodes[0].rawValue
                  console.log('QR Code detected:', qrData)
                  onScan(qrData)
                  stopCamera()
                }
              })
              .catch((err: any) => {
                console.log('Barcode detection error:', err)
              })
          } else {
            // Fallback: Use jsQR library for browsers without BarcodeDetector
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            })
            
            if (code) {
              console.log('QR Code detected (jsQR):', code.data)
              onScan(code.data)
              stopCamera()
            }
          }
        } catch (err) {
          console.error('QR detection error:', err)
        }
      }
    }, 500)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-black/50">
        <h2 className="text-white text-lg font-semibold">Scan QR Code</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-white/20"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Camera View */}
      <div className="relative w-full h-full flex items-center justify-center">
        {error ? (
          <div className="text-center text-white space-y-4">
            <Camera className="h-16 w-16 mx-auto opacity-50" />
            <p className="text-lg">{error}</p>
            <Button onClick={startCamera} variant="outline" className="text-black">
              Try Again
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            
            {/* Scanning overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                {/* Scanning frame */}
                <div className="w-64 h-64 border-2 border-white rounded-lg relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-lg"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-lg"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-lg"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-lg"></div>
                </div>
                
                {/* Instructions */}
                <p className="text-white text-center mt-4 text-sm">
                  Position QR code within the frame
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Hidden canvas for QR detection */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Bottom instructions */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-black/50">
        <p className="text-white text-center text-sm">
          {isScanning ? "Scanning for QR code..." : "Camera loading..."}
        </p>
      </div>
    </div>
  )
}
