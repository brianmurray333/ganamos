"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardFooter } from "@/components/ui/card"
import type { Post } from "@/lib/types"
import { formatTimeAgo } from "@/lib/utils"
import { reverseGeocode } from "@/lib/geocoding"

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

function abbreviateLocation(location: string): string {
  // Split by comma and process each part
  const parts = location.split(",").map((part) => part.trim())

  return parts
    .map((part) => {
      // Check if this part is a full state name that should be abbreviated
      return stateAbbreviations[part] || part
    })
    .join(", ")
}

export function PostCard({ post }: { post: Post }) {
  const router = useRouter()
  const [imageError, setImageError] = useState(false)
  const [userId, setUserId] = useState<string>("")
  // Remove this line
  // const [isMapOpen, setIsMapOpen] = useState(false)

  useEffect(() => {
    const postUserId = post.userId || post.user_id
    if (!postUserId) {
      return
    }

    setUserId(postUserId)
  }, [post.userId, post.user_id])

  // Handle location display - use stored city or convert coordinates to readable name
  const [locationName, setLocationName] = useState<string>("")

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

    handleLocation()
  }, [post.location, post.latitude, post.longitude])

  const handleClick = () => {
    router.push(`/post/${post.id}`)
  }

  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering the card click
    if (userId) {
      router.push(`/profile/${userId}`)
    }
  }

  const handleLocationClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering the card click

    if (locationName) {
      // Navigate to map page with the location as a search parameter
      router.push(`/map?search=${encodeURIComponent(locationName)}`)
    } else if (post.latitude && post.longitude) {
      // If we don't have a location name but have coordinates, pass those
      router.push(`/map?lat=${post.latitude}&lng=${post.longitude}`)
    }
  }

  // Format the date safely
  const formatDate = () => {
    try {
      // Check if createdAt exists and is valid
      const dateString = post.created_at || (post.createdAt ? post.createdAt.toString() : undefined)
      if (!dateString) return "Recently"
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return "Recently"
      return formatTimeAgo(date)
    } catch (error) {
      console.error("Error formatting date:", error)
      return "Recently"
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
      <Card className="overflow-hidden border dark:border-gray-800 cursor-pointer" onClick={handleClick}>
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
        </div>

        <CardFooter className="p-4 pt-4">
          <div className="flex items-start justify-between w-full relative">
            {/* Left side: Location/Timestamp row above Poster info */}
            <div className="flex flex-col space-y-2">
              {/* Description */}
              <div>
                <p className="text-base truncate">{post.description}</p>
              </div>

              {/* Location and timestamp row - flipped order */}
              <div className="flex items-center space-x-3">
                {locationName && (
                  <div
                    className="flex items-center cursor-pointer hover:text-blue-600 transition-colors"
                    onClick={handleLocationClick}
                  >
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
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span className="text-xs text-muted-foreground hover:text-blue-600 transition-colors">
                      {abbreviateLocation(locationName)}
                    </span>
                  </div>
                )}

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
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span className="text-xs text-muted-foreground">{formatDate()}</span>
                </div>
              </div>

              {/* Poster info row */}
              <div className="flex items-center space-x-3">
                <div className="flex items-center cursor-pointer hover:opacity-80" onClick={handleProfileClick}>
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
                
                {/* Group info - only show if post has a group */}
                {post.group && (
                  <div className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
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
              </div>
            </div>

            {/* Bitcoin Map Marker with Sats Reward on the right */}
            <div style={{ position: "relative", width: "48px", height: "48px" }}>
            <div
                className="marker-container"
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
                  pointerEvents: "none",
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

      {/* Map Modal - No longer needed as we're navigating to the map page
      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        posts={[post]} 
        centerPost={post} 
      />
      */}

      <style jsx>{`
        .marker-container {
          position: relative;
          overflow: hidden;
          pointer-events: none;
        }
        .marker-container img {
          pointer-events: none;
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
          z-index: 1;
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
