"use client"

import { GanamosLogo } from "./ganamos-logo"

export function HeaderBar() {
  return (
    <div className="fixed top-0 left-0 z-50 w-full h-[100px] bg-white border-b border-gray-100">
      <div className="container mx-auto px-4 h-full flex items-center">
        <GanamosLogo className="h-12 w-auto" />
      </div>
    </div>
  )
}