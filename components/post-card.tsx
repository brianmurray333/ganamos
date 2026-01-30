"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardFooter } from "@/components/ui/card"
import type { Post } from "@/lib/types"
import { formatTimeAgo } from "@/lib/utils"
import { reverseGeocode, getTravelTimes, getCurrentLocationWithName, type TravelTimes } from "@/lib/geocoding"
import { Car, Footprints, CheckCircle, Clock, Circle } from "lucide-react"
import { Badge } from "@/components/ui/badge"

// State abbreviation mapping
const stateAbbreviations: { [key: string]: string } = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
}

export function abbreviateLocation(location: string): string {
  // Split by comma and process each part
  const parts = location.split(",").map((part) => part.trim())

  return parts
    .map((part) => {
      // Check if this part is a full state name that should be abbreviated
      return stateAbbreviations[part] || part
    })
    .join(", ")
}

// Add a session-scoped in-memory cache for travel times
const travelTimeCache = new Map<string, { walking: string | null; driving: string | null }>()

// Helper function to get post status
function getPostStatus(post: Post): "fixed" | "in_review" | "open" {
  if (post.fixed) return "fixed"
  if (post.under_review) return "in_review"
  return "open"
}

// Status badge configuration
const statusConfig = {
  fixed: {
    label: "Fixed",
    className: "bg-green-500/90 hover:bg-green-500/90 text-white border-0",
    icon: CheckCircle,
  },
  in_review: {
    label: "In Review",
    className: "bg-amber-500/90 hover:bg-amber-500/90 text-white border-0",
    icon: Clock,
  },
  open: {
    label: "Open",
    className: "bg-blue-500/90 hover:bg-blue-500/90 text-white border-0",
    icon: Circle,
  },
}

export function PostCard({ post, showStatusBadge = false }: { post: Post; showStatusBadge?: boolean }) {
  const router = useRouter()
  const [imageError, setImageError] = useState(false)
  const [userId, setUserId] = useState<string>("")
  const [locationName, setLocationName] = useState<string>("")
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [travelTimes, setTravelTimes] = useState<TravelTimes>({ walking: null, driving: null })
  const [isLoadingTravelTimes, setIsLoadingTravelTimes] = useState(false)
  const [showTravelTimes, setShowTravelTimes] = useState(false)
  const prevTravelTimes = useRef<{ walking: string | null; driving: string | null }>({ walking: null, driving: null })

  useEffect(() => {
    const postUserId = post.userId || post.user_id
    if (!postUserId) {
      return
    }

    setUserId(postUserId)
  }, [post.userId, post.user_id])

  // Get user location on mount
  useEffect(() => {
    const getUserLocation = async () => {
      try {
        const locationData = await getCurrentLocationWithName({ useCache: true })
        if (locationData) {
          setUserLocation({
            lat: locationData.latitude,
            lng: locationData.longitude,
          })
        }
      } catch (error) {
        console.error("Error getting user location:", error)
        // Silently fail for post cards - travel times just won't show
      }
    }

    getUserLocation()
  }, [])

  // Fetch travel times when user location and post location are available
  useEffect(() => {
    if (!userLocation || !post.latitude || !post.longitude) return;

    const cacheKey = `${userLocation.lat},${userLocation.lng}|${post.latitude},${post.longitude}`;
    if (travelTimeCache.has(cacheKey)) {
      setTravelTimes(travelTimeCache.get(cacheKey)!);
      return;
    }

    let cancelled = false;
    
    // Use requestIdleCallback to run when browser is idle (fallback to setTimeout)
    const scheduleWork = () => {
      if ('requestIdleCallback' in window) {
        return window.requestIdleCallback(() => {
          if (cancelled) return;
          (async () => {
            const times = await getTravelTimes(
              userLocation.lat,
              userLocation.lng,
              Number(post.latitude),
              Number(post.longitude)
            );
            if (!cancelled) {
              setTravelTimes(times);
              travelTimeCache.set(cacheKey, times);
            }
          })();
        }, { timeout: 2000 }); // Max 2s wait
      } else {
        return window.setTimeout(() => {
          if (cancelled) return;
          (async () => {
            const times = await getTravelTimes(
              userLocation.lat,
              userLocation.lng,
              Number(post.latitude),
              Number(post.longitude)
            );
            if (!cancelled) {
              setTravelTimes(times);
              travelTimeCache.set(cacheKey, times);
            }
          })();
        }, 150);
      }
    };
    
    const handle = scheduleWork();

    return () => { 
      cancelled = true;
      if (typeof handle === 'number') {
        if ('requestIdleCallback' in window) {
          window.cancelIdleCallback(handle);
        } else {
          clearTimeout(handle);
        }
      }
    };
  }, [userLocation, post.latitude, post.longitude]);

  useEffect(() => {
    // Fade in when travelTimes change from null to a value
    if (
      (travelTimes.walking && travelTimes.walking !== prevTravelTimes.current.walking) ||
      (travelTimes.driving && travelTimes.driving !== prevTravelTimes.current.driving)
    ) {
      setShowTravelTimes(false)
      // Allow React to flush DOM, then fade in
      setTimeout(() => setShowTravelTimes(true), 10)
    }
    prevTravelTimes.current = travelTimes
  }, [travelTimes.walking, travelTimes.driving])

  // Handle location display - use stored city or convert coordinates to readable name
  useEffect(() => {
    const handleLocation = async () => {
      // Second priority: use location field
      if (post.location) {
        // Check if location is already a readable name (not coordinates)
        const coordinatePattern = /^-?\d+\.\d+,\s*-?\d+\.\d+$/
        if (coordinatePattern.test(post.location.trim())) {
          // It's coordinates, try to convert if we have lat/lng
          if (post.latitude && post.longitude) {
            try {
              const readableName = await reverseGeocode(post.latitude, post.longitude)
              // Extract only the city part (before the comma)
              const cityOnly = readableName.split(",")[0].trim()
              setLocationName(cityOnly)
            } catch (error) {
              console.error("Error converting coordinates to location name:", error)
              // Extract only the city part from fallback location too
              const cityOnly = post.location.split(",")[0].trim()
              setLocationName(cityOnly)
            }
          } else {
            // Extract only the city part
            const cityOnly = post.location.split(",")[0].trim()
            setLocationName(cityOnly)
          }
        } else {
          // It's already a readable name, extract only the city part
          const cityOnly = post.location.split(",")[0].trim()
          setLocationName(cityOnly)
        }
      }
    }

    // Use requestIdleCallback to run when browser is idle (fallback to setTimeout)
    let handle: number;
    if ('requestIdleCallback' in window) {
      handle = window.requestIdleCallback(() => {
        handleLocation()
      }, { timeout: 1000 }); // Max 1s wait
    } else {
      handle = window.setTimeout(() => {
        handleLocation()
      }, 50);
    }

    return () => {
      if ('requestIdleCallback' in window) {
        window.cancelIdleCallback(handle);
      } else {
        clearTimeout(handle);
      }
    }
  }, [post.location, post.latitude, post.longitude])

  const handleClick = (e: React.MouseEvent) => {
    // Immediately navigate to the post detail page
    // Don't preventDefault as it can interfere with navigation
    e.stopPropagation()
    router.push(`/post/${post.id}`)
  }

  // Preload post data on hover for faster navigation
  const handleMouseEnter = () => {
    // Prefetch the post detail page
    router.prefetch(`/post/${post.id}`)
  }

  // Format the date safely
  const formatAbbreviatedTimeAgo = () => {
    try {
      const dateString = post.created_at || (post.createdAt ? post.createdAt.toString() : undefined)
      if (!dateString) return "now"
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return "now"
      const now = new Date()
      const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
      if (diff < 60) return "now"
      if (diff < 3600) return `${Math.floor(diff / 60)}m`
      if (diff < 86400) return `${Math.floor(diff / 3600)}h`
      if (diff < 604800) return `${Math.floor(diff / 86400)}d`
      return `${Math.floor(diff / 604800)}w`
    } catch (error) {
      return "now"
    }
  }

  // Get the image URL, handling both imageUrl and image_url properties
  const getImageUrl = () => {
    return post.imageUrl || post.image_url || "/placeholder.svg"
  }

  const getInitials = () => {
    if (!post.created_by) return "U"
    return post.created_by
      .split(" ")
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase()
  }

  return (
    <>
      <Card 
        className="overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_12px_rgba(255,255,255,0.03),0_1px_3px_rgba(255,255,255,0.06)] rounded-2xl border border-gray-100 dark:border-gray-700/50 bg-white dark:bg-card cursor-pointer active:scale-[0.98] active:opacity-90 transition-[transform,opacity] touch-manipulation" 
        onClick={handleClick} 
        onMouseEnter={handleMouseEnter}
      >
        <div className="relative w-full h-48">
          {imageError ? (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-400"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            </div>
          ) : (
            <img
              src={getImageUrl() || "/placeholder.svg"}
              alt={post.description}
              className="object-cover w-full h-full"
              onError={() => setImageError(true)}
            />
          )}
          {/* Status Badge */}
          {showStatusBadge && (() => {
            const status = getPostStatus(post)
            const config = statusConfig[status]
            const Icon = config.icon
            return (
              <Badge className={`absolute top-2 left-2 ${config.className} flex items-center gap-1 text-xs font-medium`}>
                <Icon size={12} />
                {config.label}
              </Badge>
            )
          })()}
        </div>

        <CardFooter className="p-4 pt-4 h-[104px] relative">
          <div className="flex items-start justify-between w-full h-full">
            {/* Left side: Fixed positioned content to prevent shifting */}
            <div className="flex-1 relative h-full">
              {/* Description - fixed position */}
              <div className="absolute top-0 left-0 right-0 pr-4">
                <p className="text-base truncate">{post.description}</p>
              </div>

              {/* Location and Travel Times row - fixed position */}
              <div className="absolute top-9 left-0 right-0 flex items-center overflow-hidden">
                {locationName && (
                  <div className="flex items-center min-w-0 max-w-[60%] flex-shrink">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-1 text-muted-foreground flex-shrink-0"
                    >
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span className="text-xs text-muted-foreground truncate">
                      {abbreviateLocation(locationName)}
                    </span>
                  </div>
                )}
                {/* Travel Times (no loading state) */}
                {/* Only show walk time if <30min, drive time if <1hr */}
                {/* If walk time is 10min or less, don't show drive time */}
                {(() => {
                  // Parse walk time in min (including hours and days)
                  let walkMin = null
                  if (travelTimes.walking) {
                    const d = travelTimes.walking.match(/(\d+)d/)
                    const h = travelTimes.walking.match(/(\d+)hr/)
                    const m = travelTimes.walking.match(/(\d+)min/)
                    walkMin = (d ? parseInt(d[1]) * 24 * 60 : 0) + (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0)
                  }
                  // Parse drive time in min (including days)
                  let driveMin = null
                  if (travelTimes.driving) {
                    const d = travelTimes.driving.match(/(\d+)d/)
                    const h = travelTimes.driving.match(/(\d+)hr/)
                    const m = travelTimes.driving.match(/(\d+)min/)
                    driveMin = (d ? parseInt(d[1]) * 24 * 60 : 0) + (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0)
                  }
                  
                  // Don't show drive time if walk time is 10 min or less
                  const showDriveTime = walkMin === null || walkMin > 10
                  
                  return <>
                    {walkMin !== null && walkMin < 30 && (
                      <div className={`flex items-center ml-2 flex-shrink-0 transition-opacity duration-500 ${showTravelTimes ? 'opacity-100' : 'opacity-0'}`}>
                        <Footprints size={14} className="mr-1 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{travelTimes.walking}</span>
                      </div>
                    )}
                    {showDriveTime && driveMin !== null && driveMin < 60 && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&origin=${userLocation?.lat},${userLocation?.lng}&destination=${post.latitude},${post.longitude}&travelmode=driving`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center ml-2 flex-shrink-0 transition-opacity duration-500 ${showTravelTimes ? 'opacity-100' : 'opacity-0'} cursor-pointer hover:text-blue-600`}
                        onClick={e => e.stopPropagation()}
                        title="Open driving directions in Google Maps"
                      >
                        <Car size={14} strokeWidth={2} className="mr-1 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{travelTimes.driving}</span>
                      </a>
                    )}
                  </>
                })()}
              </div>

              {/* Poster info and timestamp row - fixed position */}
              <div className="absolute bottom-0 left-0 right-0 flex items-center space-x-2">
                <div className="flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-1 text-muted-foreground"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span className="text-xs text-muted-foreground">
                    {(() => {
                      const name = post.created_by || "Anonymous"
                      if (name === "Anonymous") return name
                      const parts = name.split(" ")
                      if (parts.length === 1) return parts[0]
                      const firstName = parts[0]
                      const lastInitial = parts[parts.length - 1].charAt(0)
                      return `${firstName} ${lastInitial}.`
                    })()}
                  </span>
                </div>
                {/* Timestamp immediately after poster name */}
                <div className="flex items-center ml-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-1 text-muted-foreground"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span className="text-xs text-muted-foreground">{formatAbbreviatedTimeAgo()}</span>
                </div>
                {/* Group info - only show if post has a group */}
                {post.group && (
                  <div className="flex items-center ml-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-1 text-muted-foreground"
                    >
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="m7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span className="text-xs text-muted-foreground truncate max-w-20">
                      {post.group.name}
                    </span>
                  </div>
                )}
                {/* Assigned to individual - show lock icon with first name */}
                {post.assigned_to_user && (
                  <div className="flex items-center ml-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-1 text-muted-foreground"
                    >
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="m7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span className="text-xs text-muted-foreground truncate max-w-20">
                      {post.assigned_to_user.name?.split(" ")[0] || "Assigned"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bitcoin Map Marker with Sats Reward on the right */}
            <div style={{ position: "relative", width: "48px", height: "48px" }}>
              <div
                className="marker-container cursor-pointer"
                onClick={handleClick}
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "#FED56B",
                  border: "1px solid #C5792D",
                  boxShadow: "0 0 0 1px #F4C14F",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src="/images/bitcoin-logo.png"
                  alt="Bitcoin"
                  width={43}
                  height={43}
                  style={{ zIndex: 1 }}
                />
              </div>
              {/* Badge absolutely positioned over the coin */}
              <div
                style={{
                  position: "absolute",
                  bottom: "-20px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#fff",
                  color: "black",
                  padding: "2px 10px",
                  fontSize: "14.4px",
                  fontWeight: "bold",
                  borderRadius: "14.4px",
                  border: "1px solid #F7931A",
                  boxShadow: "0 2px 3px rgba(0, 0, 0, 0.1)",
                  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                  minWidth: "24px",
                  textAlign: "center",
                  zIndex: 3,
                  pointerEvents: "auto",
                  width: "max-content",
                }}
              >
                {(() => {
                  const sats = post.reward
                  if (sats === 0) return "0"
                  if (sats < 1000) return sats.toString()
                  const inK = sats / 1000
                  if (inK === Math.floor(inK)) {
                    return `${Math.floor(inK)}k`
                  }
                  return `${inK.toFixed(1)}k`.replace(".0k", "k")
                })()}
              </div>
            </div>
          </div>
        </CardFooter>
      </Card>

      <style>{`
        .marker-container {
          position: relative;
          overflow: hidden;
        }
        .marker-container::before {
          content: '';
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
          animation: shine 2.5s infinite ease-in-out;
          z-index: 2;
          pointer-events: none;
        }
        @keyframes shine {
          0% {
            transform: translate(-100%, -100%) rotate(25deg);
          }
          100% {
            transform: translate(100%, 100%) rotate(25deg);
          }
        }
      `}</style>
    </>
  )
}
