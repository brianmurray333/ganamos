/**
 * "The first screen is ready" signal for the PWA launch splash.
 *
 * The home page calls markAppReady() once its feed (cached or fetched) is on
 * screen and the first card photos have loaded; LaunchSplash then fades
 * straight to it instead of revealing the skeleton first.
 */
export const APP_READY_EVENT = "ganamos:app-ready"

declare global {
  interface Window {
    __ganamosAppReady?: boolean
  }
}

export function markAppReady() {
  if (typeof window === "undefined" || window.__ganamosAppReady) return
  window.__ganamosAppReady = true
  window.dispatchEvent(new Event(APP_READY_EVENT))
}

export function isAppReady() {
  return typeof window !== "undefined" && !!window.__ganamosAppReady
}
