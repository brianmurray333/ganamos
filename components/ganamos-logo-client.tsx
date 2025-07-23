"use client"

import { useState } from "react"

interface GanamosLogoClientProps {
  className?: string
  size?: number
}

export function GanamosLogoClient({ className, size }: GanamosLogoClientProps) {
  const [imageError, setImageError] = useState(false)

  const defaultClassName = "inline-block h-8 w-auto"
  const finalClassName = className || defaultClassName

  return (
    <img
      src="/images/ganamos-logo.png"
      alt="Ganamos"
      className={finalClassName}
      style={{ 
        verticalAlign: "middle",
        ...(size && { width: size, height: size })
      }}
      onError={() => setImageError(true)}
    />
  )
}