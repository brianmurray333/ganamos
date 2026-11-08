import { Earth, Gift } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Shared look for the full-screen map's chrome, used by both the real map
 * (components/map-view.tsx) and the placeholder shown before it is ready, so
 * the swap from placeholder to map doesn't move anything.
 */
export const MAP_SEARCH_WRAPPER_CLASS =
  "absolute left-1/2 -translate-x-1/2 z-50 w-72 max-w-[calc(100%-2rem)]"
export const MAP_SEARCH_TOP = "calc(env(safe-area-inset-top, 0px) + 16px)"
export const MAP_SEARCH_INPUT_CLASS =
  "w-full px-4 py-3 pr-10 rounded-full shadow-lg text-sm bg-white dark:bg-gray-900/90 dark:backdrop-blur-md border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
export const MAP_FAB_STACK_CLASS = "absolute z-20 flex flex-col gap-3 right-6"
export const MAP_FAB_CLASS =
  "flex items-center justify-center w-12 h-12 rounded-full bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm shadow-lg border border-gray-200 dark:border-gray-700"

/**
 * Background colour shown before map tiles arrive. The light value is close to
 * Google's default roadmap land colour and is also passed to the Map as
 * `backgroundColor`, so tiles stream in without grey squares. In dark mode a
 * dim neutral avoids flashing a bright screen on tap; the tiles then fade in.
 */
export const MAP_CANVAS_LIGHT = "#ece9e3"

/** Neutral, text-free stand-in for the map tiles. */
export function MapCanvasPlaceholder({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid="map-canvas-placeholder"
      className={cn("absolute inset-0 overflow-hidden bg-[#ece9e3] dark:bg-[#1b1f27]", className)}
    >
      {/* Very faint sheen; off for prefers-reduced-motion */}
      <div className="absolute inset-0 hidden motion-safe:block motion-safe:animate-map-sheen bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/[0.04]" />
    </div>
  )
}

/**
 * What /map looks like before the map component (and Google Maps) has loaded:
 * the canvas plus the page's real chrome in its final position. Used by
 * app/map/loading.tsx and as the dynamic() fallback for the map component.
 */
export function MapPageSkeleton() {
  return (
    <div className="fixed inset-0" aria-busy="true" data-testid="map-page-skeleton">
      <MapCanvasPlaceholder />
      <div className={MAP_SEARCH_WRAPPER_CLASS} style={{ top: MAP_SEARCH_TOP }}>
        <input
          type="text"
          placeholder="Search location..."
          disabled
          aria-hidden="true"
          tabIndex={-1}
          className={cn(MAP_SEARCH_INPUT_CLASS, "disabled:opacity-100 disabled:cursor-default")}
        />
      </div>
      <div className={cn(MAP_FAB_STACK_CLASS, "bottom-[100px]")} aria-hidden="true">
        <div className={MAP_FAB_CLASS}>
          <Gift className="w-6 h-6 text-gray-500 dark:text-gray-400" />
        </div>
        <div className={MAP_FAB_CLASS}>
          <Earth className="w-6 h-6 text-gray-500 dark:text-gray-400" />
        </div>
      </div>
    </div>
  )
}
