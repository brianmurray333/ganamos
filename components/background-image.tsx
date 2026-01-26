"use client"

import { useState } from "react"

export function BackgroundImage() {
  const [imageError, setImageError] = useState(false)

  return (
    <div className="absolute inset-0">
      {imageError ? (
        <div className="w-full h-full bg-gray-200 dark:bg-gray-800" />
      ) : (
        <img
          src="/images/community-fixing.jpg"
          alt="Person fixing a fence in a community"
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      )}
    </div>
  )
}
