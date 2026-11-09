"use client"

import { useEffect } from "react"

/**
 * Fades images in as they finish loading, app-wide, instead of popping in.
 *
 * Any <img> that isn't loaded yet when it appears (or when its src changes)
 * is marked data-fade="pending" (transparent) and switched to "in" on load,
 * so the CSS in globals.css transitions its opacity. Images that are already
 * loaded (e.g. cached) are left alone and show immediately. Opt out with
 * data-no-fade on the image or an ancestor; map tiles are skipped.
 */
export function ImageFadeIn() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof MutationObserver === "undefined") return

    const skip = (img: HTMLImageElement) => !!img.closest("[data-no-fade], .gm-style")

    const reveal = (img: HTMLImageElement) => {
      if (img.dataset.fade === "pending") img.dataset.fade = "in"
    }

    const track = (img: HTMLImageElement) => {
      if (skip(img)) return
      // Nothing painted yet: hide until it loads. Already-loaded images stay as they are.
      if (!img.complete && img.naturalWidth === 0) {
        img.dataset.fade = "pending"
        // The load event may have fired between the checks above
        if (img.complete) reveal(img)
      }
    }

    const onLoadOrError = (e: Event) => {
      const t = e.target
      if (t instanceof HTMLImageElement) reveal(t)
    }
    // load/error don't bubble, but they can be caught in the capture phase
    document.addEventListener("load", onLoadOrError, true)
    document.addEventListener("error", onLoadOrError, true)

    document.querySelectorAll("img").forEach((img) => track(img))

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes") {
          if (m.target instanceof HTMLImageElement) track(m.target)
          continue
        }
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLImageElement) track(node)
          else if (node instanceof Element) node.querySelectorAll("img").forEach((img) => track(img))
        })
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset"] })

    return () => {
      observer.disconnect()
      document.removeEventListener("load", onLoadOrError, true)
      document.removeEventListener("error", onLoadOrError, true)
    }
  }, [])

  return null
}
