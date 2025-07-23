import { GanamosLogoClient } from "./ganamos-logo-client"

interface GanamosLogoProps {
  className?: string
  size?: number
}

export function GanamosLogo({ className, size }: GanamosLogoProps) {
  return (
    <div className={className} style={size ? { width: size, height: size } : undefined}>
      <GanamosLogoClient className={className} size={size} />
    </div>
  )
}