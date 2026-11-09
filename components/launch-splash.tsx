"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { APP_READY_EVENT, isAppReady } from "@/lib/app-ready"

/** Longest the splash waits for the home feed before revealing whatever is there (the skeleton). */
const LAUNCH_MAX_MS = 2500

/**
 * App icon shown on PWA launch, from first paint until the first screen is
 * ready. It sits exactly where the static iOS launch image draws the icon, so
 * the handover is invisible, and it stays still (a gentle pulse starts only if
 * loading takes over a second).
 *
 * On Home it waits for markAppReady() (feed + first photos on screen), capped
 * at LAUNCH_MAX_MS, then cross-fades straight to the loaded feed. On any other
 * route it fades out as soon as the app has hydrated. Only shown in the
 * installed app (display-mode: standalone); styles are inlined in the layout
 * <head> so they apply before any stylesheet loads.
 */
export function LaunchSplash() {
  const pathname = usePathname()
  const [phase, setPhase] = useState<"show" | "hide" | "gone">("show")

  useEffect(() => {
    let hidden = false
    let goneTimer: number | undefined
    const hide = () => {
      if (hidden) return
      hidden = true
      setPhase("hide")
      goneTimer = window.setTimeout(() => setPhase("gone"), 400)
    }

    if (pathname !== "/" || isAppReady()) {
      hide()
      return () => window.clearTimeout(goneTimer)
    }

    window.addEventListener(APP_READY_EVENT, hide)
    const capTimer = window.setTimeout(hide, Math.max(0, LAUNCH_MAX_MS - performance.now()))
    return () => {
      window.removeEventListener(APP_READY_EVENT, hide)
      window.clearTimeout(capTimer)
      window.clearTimeout(goneTimer)
    }
    // Launch only: later navigations never bring the splash back
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase === "gone") return null
  return (
    <div id="launch-splash" className={phase === "hide" ? "is-hiding" : undefined} aria-hidden="true" data-no-fade>
      <img src="/splash/launch-icon.png" alt="" width={96} height={96} />
    </div>
  )
}

/**
 * The iOS launch image centres the icon on the whole screen, but with the
 * default status bar style the page starts below the status bar, so a plain
 * centred icon sat half a status bar lower and visibly jumped at the handover.
 * This runs in <head> before first paint and records half the height hidden
 * above the page; the CSS below lifts the icon by that much.
 */
export const LAUNCH_SPLASH_SCRIPT = `(function(){try{
  if(!window.matchMedia('(display-mode: standalone)').matches)return;
  var shift=(screen.height-window.innerHeight)/2;
  if(shift>0&&shift<60)document.documentElement.style.setProperty('--launch-shift',shift+'px');
}catch(e){}})();`

export const LAUNCH_SPLASH_CSS = `
#launch-splash{display:none}
@media (display-mode: standalone){
  #launch-splash{display:flex;position:fixed;inset:0;z-index:2147483647;align-items:center;justify-content:center;background:#020617;transition:opacity .35s ease-out;padding-bottom:calc(var(--launch-shift,0px) * 2)}
}
#launch-splash.is-hiding{opacity:0;pointer-events:none}
#launch-splash img{width:96px;height:96px;border-radius:22px;animation:launch-pulse 1.2s ease-in-out 1s infinite}
@keyframes launch-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.92);opacity:.75}}
@media (prefers-reduced-motion: reduce){#launch-splash img{animation:none}}
`
