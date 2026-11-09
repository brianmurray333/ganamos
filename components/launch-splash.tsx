"use client"

import { useEffect, useState } from "react"

/**
 * Pulsing app icon shown on PWA launch, from the first paint until the app
 * has hydrated. It sits exactly where the static iOS launch image
 * (apple-touch-startup-image) draws the icon, so the handover is seamless,
 * then fades out to reveal the page. Only shown in the installed app
 * (display-mode: standalone); styles live inline in the layout <head> so they
 * apply before any stylesheet loads.
 */
export function LaunchSplash() {
  const [phase, setPhase] = useState<"show" | "hide" | "gone">("show")

  useEffect(() => {
    setPhase("hide")
    const t = window.setTimeout(() => setPhase("gone"), 400)
    return () => window.clearTimeout(t)
  }, [])

  if (phase === "gone") return null
  return (
    <div id="launch-splash" className={phase === "hide" ? "is-hiding" : undefined} aria-hidden="true" data-no-fade>
      <img src="/splash/launch-icon.png" alt="" width={96} height={96} />
    </div>
  )
}

export const LAUNCH_SPLASH_CSS = `
#launch-splash{display:none}
@media (display-mode: standalone){
  #launch-splash{display:flex;position:fixed;inset:0;z-index:2147483647;align-items:center;justify-content:center;background:#020617;transition:opacity .35s ease-out}
}
#launch-splash.is-hiding{opacity:0;pointer-events:none}
#launch-splash img{width:96px;height:96px;border-radius:22px;animation:launch-pulse 1.2s ease-in-out infinite}
@keyframes launch-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.9);opacity:.7}}
@media (prefers-reduced-motion: reduce){#launch-splash img{animation:none}}
`
