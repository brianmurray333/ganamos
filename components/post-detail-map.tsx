"use client"

import React, { useState, useEffect, useRef } from "react"
import type { Post } from "@/lib/types"
import { loadGoogleMaps } from "@/lib/google-maps-loader"

interface PostDetailMapProps {
  post: Post
}

declare global {
  interface Window {
    google?: any
  }
}

function PostDetailMapComponent({ post }: PostDetailMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null)
  const [mapInitialized, setMapInitialized] = useState(false)
  const markersRef = useRef<{ [key: string]: any }>({})
  const PostMarkerClassRef = useRef<any>(null)

  // Create PostMarker class - same as production
  const createPostMarkerClass = () => {
    if (!window.google || !window.google.maps) {
      return null
    }

    return class PostMarker extends window.google.maps.OverlayView {
      private position: google.maps.LatLng
      private containerDiv: HTMLDivElement
      private post: Post
      private map: google.maps.Map
      private isSelected: boolean
      private onClick: (post: Post) => void
      private markerId: string
      private isClickable: boolean
      private animationDelay: number
      private hasAnimated: boolean

      constructor(
        post: Post,
        map: google.maps.Map,
        isSelected: boolean,
        onClick: (post: Post) => void,
        isClickable = true,
        animationDelay = 0,
      ) {
        super()
        this.post = post
        this.markerId = post.id
        this.isClickable = isClickable
        this.animationDelay = animationDelay * 50
        this.hasAnimated = false

        this.position = new window.google.maps.LatLng(Number(post.latitude), Number(post.longitude))
        this.isSelected = isSelected
        this.onClick = onClick
        this.map = map

        this.containerDiv = document.createElement("div")
        this.containerDiv.className = "post-marker-container"
        this.containerDiv.style.position = "absolute"
        this.containerDiv.style.userSelect = "none"
        this.containerDiv.style.zIndex = "1"
        this.containerDiv.style.cursor = this.isClickable ? "pointer" : "default"
        this.containerDiv.setAttribute("data-marker-id", post.id)

        if (this.isClickable) {
          const handleClick = (e: Event) => {
            e.stopPropagation()
            e.preventDefault()
            this.onClick(this.post)
          }
          this.containerDiv.addEventListener("click", handleClick)
          this.containerDiv.addEventListener("touchend", handleClick)
        }

        this.setMap(map)
      }

      onAdd() {
        this.updateContent()
        const panes = this.getPanes()
        if (!panes) return
        panes.overlayMouseTarget.appendChild(this.containerDiv)
      }

      draw() {
        const projection = this.getProjection()
        if (!projection) return

        const point = projection.fromLatLngToDivPixel(this.position)
        if (point) {
          this.containerDiv.style.left = point.x - 22 + "px"
          this.containerDiv.style.top = point.y - 22 + "px"
          this.containerDiv.style.display = "block"
        }
      }

      onRemove() {
        if (this.containerDiv.parentElement) {
          this.containerDiv.parentElement.removeChild(this.containerDiv)
        }
      }

      setSelected(isSelected: boolean) {
        this.isSelected = isSelected
        this.updateSelection()
      }

      private updateSelection() {
        const markerElement = this.containerDiv.querySelector('.btc-marker') as HTMLElement
        const badgeElement = this.containerDiv.querySelector('.btc-badge') as HTMLElement
        
        if (markerElement && badgeElement) {
          const markerScale = this.isSelected ? "1.1" : "1"
          const badgeOpacity = this.isSelected ? "1" : "0.95"
          markerElement.style.transform = `scale(${markerScale})`
          badgeElement.style.opacity = badgeOpacity
        }
      }

      private formatSatsForPin(sats: number): string {
        if (sats === 0) return "0"
        if (sats < 1000) return sats.toString()
        const inK = sats / 1000
        if (inK === Math.floor(inK)) {
          return `${Math.floor(inK)}k`
        }
        return `${inK.toFixed(1)}k`.replace(".0k", "k")
      }

      private updateContent() {
        const rewardText = this.formatSatsForPin(this.post.reward)
        const markerScale = this.isSelected ? "1.1" : "1"
        const badgeOpacity = this.isSelected ? "1" : "0.95"
        const animationStyle = this.hasAnimated ? "" : `animation: markerDropIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) ${this.animationDelay}ms both;`

        this.containerDiv.innerHTML = `
<div class="marker-wrapper" style="
  position: relative;
  width: 44px;
  height: 44px;
  transition: transform 0.2s ease;
  transform: scale(${markerScale});
  ${animationStyle}
">
  <div class="btc-marker" style="
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: #FED56B;
    border: 1px solid #C5792D;
    box-shadow: 0 0 0 1px #F4C14F;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  ">
    <img src="/images/bitcoin-logo.png" alt="Bitcoin" style="
      width: 38px;
      height: 38px;
      filter: drop-shadow(0px -1px 1px rgba(255, 255, 255, 0.4));
      position: relative;
      overflow: hidden;
    ">
    <div class="shine-effect" style="
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: linear-gradient(
        120deg,
        rgba(255, 255, 255, 0) 30%,
        rgba(255, 255, 255, 0.5) 50%,
        rgba(255, 255, 255, 0) 70%
      );
      transform: rotate(0deg);
      animation: markerShine 2.5s infinite ease-in-out;
      z-index: 2;
      pointer-events: none;
    "></div>
  </div>
  <div class="btc-badge" style="
    position: absolute;
    bottom: -12px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    color: black;
    padding: 2px 8px;
    font-size: 12px;
    font-weight: bold;
    border-radius: 16px;
    border: 1px solid #C5792D;
    box-shadow: 0 2px 3px rgba(0, 0, 0, 0.1);
    opacity: ${badgeOpacity};
    transition: opacity 0.2s ease;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    min-width: 28px;
    text-align: center;
    z-index: 3;
  ">${rewardText}</div>
</div>
`
        this.hasAnimated = true
      }
    }
  }

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInitialized || !post.latitude || !post.longitude) return

    const initMap = async () => {
      try {
        await loadGoogleMaps()
        createMap()
      } catch (error) {
        console.error('Error loading Google Maps:', error)
      }
    }

    const createMap = () => {
      if (!mapRef.current || !window.google) return

      const center = {
        lat: Number(post.latitude),
        lng: Number(post.longitude),
      }

      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 16, // Zoom in closer for detail view
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_CENTER,
        },
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
          }
        ],
        gestureHandling: 'greedy',
      })

      setMapInstance(map)
      setMapInitialized(true)
      PostMarkerClassRef.current = createPostMarkerClass()

      // Add marker for this post when map is ready
      window.google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
        if (PostMarkerClassRef.current && post.latitude && post.longitude) {
          try {
            const marker = new PostMarkerClassRef.current(
              post,
              map,
              true, // Selected
              () => {}, // No-op onClick since we're already on the detail page
              false, // Not clickable
              0,
            )
            markersRef.current[post.id] = marker
          } catch (error) {
            console.error(`Error creating marker for post ${post.id}:`, error)
          }
        }
      })
    }

    initMap()
  }, [mapInitialized, post])

  return (
    <div className="relative w-full h-full">
      {/* Map container with rounded edges */}
      <div ref={mapRef} className="absolute inset-0 rounded-r-xl" />
    </div>
  )
}

export const PostDetailMap = React.memo(PostDetailMapComponent)

