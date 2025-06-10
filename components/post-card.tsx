"use client"

import type React from "react"

import { useState, useEffect } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Post } from "@/lib/types"
import { formatSatsValue, formatTimeAgo } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MapModal } from "@/components/map-modal"
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
  const [isMapOpen, setIsMapOpen] = useState(false)

  useEffect(() => {
    const postUserId = post.userId || post.user_id
    if (!postUserId) {
      return
    }

    setUserId(postUserId)
  }, [post.userId, post.user_id])

  // Handle location display - use stored city or convert coordinates to readable name if needed
  const [locationName, setLocationName] = useState<string>("")

  useEffect(() => {
    const handleLocation = async () => {
      // First priority: use stored city if available
      if (post.city) {
        setLocationName(post.city)
        return
      }

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
  }, [post.city, post.location, post.latitude, post.longitude])

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

    if (post.latitude && post.longitude) {
      setIsMapOpen(true)
    }
  }

  // Format the date safely
  const formatDate = () => {
    try {
      // Check if createdAt exists and is valid
      if (!post.createdAt && !post.created_at) return "Recently"

      const date = new Date(post.createdAt || post.created_at)

      // Check if the date is valid
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
          <div className="absolute top-2 right-2">
            <Badge
              variant={post.fixed || post.under_review ? "outline" : "default"}
              className={
                post.fixed
                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-100 dark:hover:bg-emerald-900"
                  : post.under_review
                    ? "bg-orange-100 text-orange-800 hover:bg-orange-100 dark:bg-orange-900 dark:text-orange-100 dark:hover:bg-orange-900"
                    : "flex items-center gap-1"
              }
            >
              {post.fixed ? (
                "Fixed"
              ) : post.under_review ? (
                "Under Review"
              ) : (
                <>
                  <div className="w-3 h-3 relative">
                    <Image
                      src="/images/bitcoin-logo.png"
                      alt="Bitcoin"
                      width={12}
                      height={12}
                      className="object-contain"
                    />
                  </div>
                  {formatSatsValue(post.reward)}
                </>
              )}
            </Badge>
          </div>
        </div>

        <CardContent className="p-4">
          <div className="flex flex-col space-y-3">
            <div>
              <p className="text-base truncate cursor-pointer" onClick={handleClick}>
                {post.description}
              </p>
            </div>

            {/* Profile info row */}
            <div className="flex items-center">
              <div className="flex items-center cursor-pointer hover:opacity-80" onClick={handleProfileClick}>
                <Avatar className="h-6 w-6 mr-2">
                  <AvatarImage src={post.created_by_avatar || "/placeholder.svg"} alt={post.created_by || "User"} />
                  <AvatarFallback>{getInitials()}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{post.created_by || "Anonymous"}</span>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="p-4 pt-0">
          <div className="flex items-center justify-between w-full flex-wrap gap-2">
            <div className="flex items-center space-x-3">
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
            </div>

            {!post.fixed && (
              <Button size="sm" variant="outline" onClick={handleClick} className="dark:border-gray-700">
                View Details
              </Button>
            )}

            {post.fixed && (
              <Button
                size="sm"
                variant="outline"
                className="text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-700 dark:text-emerald-400 dark:border-emerald-800/30 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50"
              >
                Fixed
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>

      {/* Map Modal */}
      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        posts={[post]} // Pass only this post to focus on it
        centerPost={post} // Center the map on this specific post
      />
    </>
  )
}
