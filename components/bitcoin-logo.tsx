import { BitcoinLogoClient } from "./bitcoin-logo-client"

interface BitcoinLogoProps {
  className?: string
  size?: number
}

export function BitcoinLogo({ className, size }: BitcoinLogoProps) {
  return (
    <div 
      className={`flex items-center justify-center shrink-0 ${className || ''}`} 
      style={size ? { width: size, height: size } : undefined}
    >
      <BitcoinLogoClient size={size} />
    </div>
  )
}
