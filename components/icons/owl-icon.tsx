"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

interface OwlIconProps {
  size?: number
  color?: string
  strokeWidth?: number
  className?: string
}

/**
 * Custom Owl icon component for pet selection
 * Uses PNG images - black outline for light mode, white outline for dark mode
 * Automatically switches based on theme using CSS dark mode classes
 */
export function OwlIcon({ 
  size = 24, 
  color = "currentColor", 
  className 
}: OwlIconProps) {
  // If color is explicitly "white", always show white (for the main display circle)
  // Otherwise, use CSS dark mode classes to auto-switch
  const forceWhite = color === "white"
  
  // Make the owl slightly larger to visually match Lucide icons
  const adjustedSize = Math.round(size * 1.15)
  
  // For explicit white color (main circle display), just show white
  if (forceWhite) {
    return (
      <Image
        src="/images/pets/owl_white.png"
        alt="Owl"
        width={adjustedSize}
        height={adjustedSize}
        className={cn("object-contain", className)}
        style={{ width: adjustedSize, height: adjustedSize }}
      />
    )
  }
  
  // For selection tiles, show both images and use CSS to toggle based on theme
  return (
    <div 
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: adjustedSize, height: adjustedSize }}
    >
      {/* Light mode - black outline */}
      <Image
        src="/images/pets/owl_black.png"
        alt="Owl"
        width={adjustedSize}
        height={adjustedSize}
        className="object-contain dark:hidden"
        style={{ width: adjustedSize, height: adjustedSize }}
      />
      {/* Dark mode - white outline */}
      <Image
        src="/images/pets/owl_white.png"
        alt="Owl"
        width={adjustedSize}
        height={adjustedSize}
        className="object-contain hidden dark:block absolute inset-0"
        style={{ width: adjustedSize, height: adjustedSize }}
      />
    </div>
  )
}
