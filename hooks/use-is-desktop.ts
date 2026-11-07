"use client"

import { useEffect, useState } from "react"

/**
 * True at Tailwind's `lg` breakpoint (>= 1024px), where desktop-only UI
 * (desktop header, dashboard map panel) is shown. Use it to avoid mounting
 * expensive desktop-only components on phones, where they'd only be hidden
 * with CSS. Always false during SSR and the first client render.
 */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return isDesktop
}
