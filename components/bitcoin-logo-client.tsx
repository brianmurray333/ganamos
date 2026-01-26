"use client"

import { useState } from "react"

interface BitcoinLogoClientProps {
  className?: string
  size?: number
}

export function BitcoinLogoClient({ className, size }: BitcoinLogoClientProps) {
  const [imageError, setImageError] = useState(false)

  return (
    <img
      src="/images/bitcoin-logo.png"
      alt="Bitcoin"
      className={className}
      style={{ 
        display: 'block',
        ...(size && { width: size, height: size })
      }}
      onError={() => setImageError(true)}
    />
  )
}
