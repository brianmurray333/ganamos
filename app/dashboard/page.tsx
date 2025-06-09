"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { PostCard } from "@/components/post-card"
import { mockPosts } from "@/lib/mock-data"
import { getCurrentLocation, saveSelectedLocation } from "@/lib/mock-location"
import { formatSatsValue } from "@/lib/utils"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { Plus, X, Filter, Map, User } from "lucide-react"
import type { Post } from "@/lib/types"
import { AccountSwitcherDropdown } from "@/components/account-switcher-dropdown"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getCurrentLocationWithName } from "@/lib/geocoding"

interface ActiveFilters {
  count: number
  dateFilter: string
  rewardRange: [number, number]
  location: string
  searchQuery: string
  timestamp?: string
}

export default function DashboardPage() {
  const {
    user,
    profile,
    loading,
    session,
    sessionLoaded,
    isConnectedAccount,
    connectedAccounts,
    fetchConnectedAccounts,
  } = useAuth()
  const router = useRouter()
  const [currentLocation, setCurrentLocation] = useState(getCurrentLocation())
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createBrowserSupabaseClient()

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [hasMore, setHasMore] = useState(true)

  const [activeFilters, setActiveFilters] = useState<ActiveFilters | null>(null)
  const [filterCleared, setFilterCleared] = useState(false)

  // Map modal state
  // const [isMapOpen, setIsMapOpen] = useState(false)

  // Add session guard with useEffect
  useEffect(() => {
    if (sessionLoaded && !session) {
      console.log("Dashboard - No session after loading, redirecting to login")
      router.push("/auth/login")
    }
  }, [session, sessionLoaded, router])

  useEffect(() => {
    if (user) {
      fetchConnectedAccounts()
    }
  }, [user, fetchConnectedAccounts])

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login")
      return
    }

    // Always set location to Downtown
    if (typeof window !== "undefined") {
      // Set Downtown as the default location
      saveSelectedLocation("downtown")
      setCurrentLocation(getCurrentLocation())
    }

    // Load active filters from localStorage
    const loadFilters = () => {
      const filtersJson = localStorage.getItem("activeFilters")
      if (filtersJson) {
        try {
          const filters = JSON.parse(filtersJson)
          setActiveFilters(filters)
          // Reset to page 1 when filters change
          setCurrentPage(1)
          fetchPosts(1, filters)
        } catch (e) {
          console.error("Error parsing filters:", e)
          fetchPosts(1, null)
        }
      } else {
        fetchPosts(1, null)
      }
    }

    loadFilters()

    // Set up event listener for storage changes
    const handleStorageChange = () => {
      loadFilters()
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [user, loading, router])

  // Effect to handle filter cleared state
  useEffect(() => {
    if (filterCleared) {
      fetchPosts(1, null)
      setFilterCleared(false)
    }
  }, [filterCleared])

  const clearFilters = () => {
    localStorage.removeItem("activeFilters")
    setActiveFilters(null)
    // Reset to page 1 and refresh posts without filters
    setCurrentPage(1)
    setPosts([]) // Clear posts immediately to avoid showing filtered results
    setIsLoading(true) // Show loading state
    setFilterCleared(true) // Set flag to trigger re-fetch
  }

  const fetchPosts = async (page = currentPage, filters = activeFilters) => {
    console.log("Fetching posts with filters:", filters)
    // Enhanced logging before API call
    console.log("Session before API call:", !!session)
    if (session) {
      console.log("Session expiry:", new Date(session.expires_at! * 1000).toISOString())
    }

    setIsLoading(true)
    try {
      // Try to fetch from Supabase first
      if (supabase) {
        // Calculate pagination range
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        console.log(`Fetching posts from ${from} to ${to}`)

        let query = supabase
          .from("posts")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .eq("fixed", false)
          .neq("under_review", true)

        // Apply filters if active
        if (filters) {
          // Apply search query filter
          if (filters.searchQuery) {
            query = query.ilike("title", `%${filters.searchQuery}%`)
          }

          // Apply date filter
          if (filters.dateFilter === "today") {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            query = query.gte("created_at", today.toISOString())
          } else if (filters.dateFilter === "week") {
            const weekAgo = new Date()
            weekAgo.setDate(weekAgo.getDate() - 7)
            query = query.gte("created_at", weekAgo.toISOString())
          }

          // Apply reward range filter
          if (filters.rewardRange[0] > 0) {
            query = query.gte("reward", filters.rewardRange[0])
          }
          if (filters.rewardRange[1] < 10000) {
            query = query.lte("reward", filters.rewardRange[1])
          }
        }

        // Apply pagination
        query = query.range(from, to)

        const { data, error, count } = await query

        if (data && !error) {
          if (page === 1) {
            setPosts(data)
          } else {
            setPosts((prev) => [...prev, ...data])
          }

          // Check if there are more posts to load
          setHasMore(count ? from + data.length < count : false)
          setIsLoading(false)
          return
        }
      }

      // Fall back to mock data if Supabase fails
      let filteredPosts = [...mockPosts].filter((post) => !post.fixed && !post.under_review)

      // Apply filters to mock data if active
      if (filters) {
        if (filters.searchQuery) {
          filteredPosts = filteredPosts.filter((post) =>
            post.title.toLowerCase().includes(filters.searchQuery.toLowerCase()),
          )
        }

        if (filters.dateFilter === "today") {
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          filteredPosts = filteredPosts.filter((post) => {
            const postDate = new Date(post.created_at)
            return postDate >= today
          })
        } else if (filters.dateFilter === "week") {
          const weekAgo = new Date()
          weekAgo.setDate(weekAgo.getDate() - 7)
          filteredPosts = filteredPosts.filter((post) => {
            const postDate = new Date(post.created_at)
            return postDate >= weekAgo
          })
        }

        filteredPosts = filteredPosts.filter(
          (post) => post.reward >= filters.rewardRange[0] && post.reward <= filters.rewardRange[1],
        )
      }

      console.log(`Filtered posts count: ${filteredPosts.length}`)

      const mockPaginatedPosts = filteredPosts.slice((page - 1) * pageSize, page * pageSize)

      if (page === 1) {
        setPosts(mockPaginatedPosts)
      } else {
        setPosts((prev) => [...prev, ...mockPaginatedPosts])
      }

      // Check if there are more mock posts to load
      setHasMore(page * pageSize < filteredPosts.length)
    } catch (error) {
      console.error("Error fetching posts:", error)
      // Fall back to mock data with simplified filter logic
      let filteredPosts = [...mockPosts].filter((post) => !post.fixed && !post.under_review)

      // Apply basic filters even in error case
      if (filters && filters.dateFilter === "today") {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        filteredPosts = filteredPosts.filter((post) => new Date(post.created_at) >= today)
      }

      const mockPaginatedPosts = filteredPosts.slice((page - 1) * pageSize, page * pageSize)

      if (page === 1) {
        setPosts(mockPaginatedPosts)
      } else {
        setPosts((prev) => [...prev, ...mockPaginatedPosts])
      }

      setHasMore(page * pageSize < filteredPosts.length)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSatsClick = () => {
    router.push("/wallet")
  }

  // Session guard with early return
  if (sessionLoaded && !session) {
    return null // Will redirect in useEffect
  }

  // IMPORTANT CHANGE: Skip the full-screen loading state when we're coming from auth
  // Only show loading state if we're not in the auth flow (sessionLoaded is true but still loading user data)
  if (!sessionLoaded && (loading || !user)) {
    // We're still in the auth flow, don't show another loading screen
    return null
  } else if (loading || !user) {
    // We're not in the auth flow, but still loading user data (e.g., after a refresh)
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <div className="sticky top-0 z-10 bg-gradient-to-b from-background via-background to-transparent pb-4">
        <div className="container px-1 pt-6 mx-auto max-w-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    const locationData = await getCurrentLocationWithName()
                    if (locationData) {
                      // Pass location data to map page to zoom to city bounds
                      router.push(`/map?lat=${locationData.latitude}&lng=${locationData.longitude}&zoom=city`)
                    } else {
                      router.push("/map")
                    }
                  } catch (error) {
                    console.error("Error getting location:", error)
                    router.push("/map")
                  }
                }}
                className="flex items-center gap-1 h-9 px-3 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                aria-label="View map"
              >
                <Map className="h-4 w-4" />
                <span className="text-sm font-medium">Map</span>
              </Button>

              {activeFilters && activeFilters.count > 0 && (
                <button
                  onClick={clearFilters}
                  className="flex items-center px-3 py-1 text-sm font-medium bg-blue-100 rounded-full text-blue-800 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800 transition-all"
                >
                  <Filter className="mr-1 h-3.5 w-3.5" />
                  {activeFilters.count} {activeFilters.count === 1 ? "Filter" : "Filters"}
                  <X className="ml-1 h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                onClick={handleSatsClick}
                className="flex items-center px-3 py-1 text-sm font-medium bg-amber-100 rounded-full text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
              >
                <Image src="/images/bitcoin-logo.png" alt="Bitcoin" width={16} height={16} className="mr-1" />
                {profile ? formatSatsValue(profile.balance) : formatSatsValue(0)}
              </Button>

              {/* Show avatar if user has connected accounts */}
              {connectedAccounts.length > 0 && (
                <AccountSwitcherDropdown>
                  <Button variant="ghost" className="h-9 w-9 rounded-full p-0">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.name || "User"} />
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </AccountSwitcherDropdown>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center w-full px-4">
        <div className="relative w-full max-w-md pb-20">
          {/* Feed content */}
          {posts.length === 0 && isLoading ? (
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg dark:border-gray-800 overflow-hidden">
                  <div className="w-full h-48 bg-gray-200 dark:bg-gray-800 animate-pulse"></div>
                  <div className="p-4">
                    <div className="h-5 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-2 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full mb-1 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-2/3 animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {posts.length > 0 ? (
                <>
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}

                  {hasMore && (
                    <div className="flex justify-center mt-6">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const nextPage = currentPage + 1
                          setCurrentPage(nextPage)
                          fetchPosts(nextPage)
                        }}
                        disabled={isLoading}
                        className="w-full"
                      >
                        {isLoading ? (
                          <div className="flex items-center">
                            <svg
                              className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                            Loading...
                          </div>
                        ) : (
                          "Load More"
                        )}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-8 text-center border rounded-lg dark:border-gray-800 bg-white/90 dark:bg-gray-900/90">
                  <div className="flex flex-col items-center">
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
                      className="text-muted-foreground mb-4"
                    >
                      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                    <p className="text-lg font-medium mb-2">No issues found</p>
                    <p className="text-muted-foreground mb-6">
                      {activeFilters && activeFilters.count > 0
                        ? "Try removing some filters to see more results"
                        : "Be the first to post an issue in your community"}
                    </p>
                    <Button onClick={() => router.push("/post/new")} className="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                      Post a new issue
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fixed position container that centers the button horizontally */}
      <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center pointer-events-none">
        {/* Container with the same width as the feed */}
        <div className="w-full max-w-md px-4 relative pointer-events-none">
          {/* Button positioned at the right side of this container */}
          <button
            onClick={() => router.push("/post/new")}
            className="absolute right-4 bottom-0 flex items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 transition-all w-14 h-14 pointer-events-auto"
            aria-label="New Post"
          >
            <Plus className="w-8 h-8" />
          </button>
        </div>
      </div>
    </>
  )
}
