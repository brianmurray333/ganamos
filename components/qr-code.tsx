"use client"

import { useEffect, useRef } from "react"
import QRCodeStyling from "qr-code-styling"

interface QRCodeProps {
  data: string
  size?: number
  color?: string
  backgroundColor?: string
  cornerColor?: string
  cornerSquareRadius?: number
  cornerDotRadius?: number
}

export default function QRCode({
  data,
  size = 300,
  color = "#000000",
  backgroundColor = "#ffffff",
  cornerColor = "#000000",
  cornerSquareRadius = 0,
  cornerDotRadius = 0,
}: QRCodeProps) {
  const qrRef = useRef<HTMLDivElement>(null)
  const qrCode = useRef<QRCodeStyling>()

  useEffect(() => {
    if (!qrRef.current) return

    if (!qrCode.current) {
      qrCode.current = new QRCodeStyling({
        width: size,
        height: size,
        type: "svg",
        data: data,
        dotsOptions: {
          color: color,
          type: "rounded",
        },
        cornersSquareOptions: {
          color: cornerColor,
          type: "extra-rounded",
          radius: cornerSquareRadius,
        },
        cornersDotOptions: {
          color: cornerColor,
          type: "rounded",
          radius: cornerDotRadius,
        },
        backgroundOptions: {
          color: backgroundColor,
        },
      })
      qrCode.current.append(qrRef.current)
    } else {
      qrCode.current.update({
        data: data,
        width: size,
        height: size,
        dotsOptions: {
          color: color,
        },
        cornersSquareOptions: {
          color: cornerColor,
        },
        cornersDotOptions: {
          color: cornerColor,
        },
        backgroundOptions: {
          color: backgroundColor,
        },
      })
    }
  }, [data, size, color, backgroundColor, cornerColor, cornerSquareRadius, cornerDotRadius])

  return <div ref={qrRef} className="flex justify-center items-center" />
}
