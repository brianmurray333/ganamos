"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { useAuth } from "@/components/auth-provider"
import { useDashboardCache } from "@/components/dashboard-cache-provider"
import { Button } from "@/components/ui/button"
import { PostCard } from "@/components/post-card"
import { getCurrentLocation, saveSelectedLocation } from "@/lib/mock-location"
import { formatSatsValue } from "@/lib/utils"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { Plus, X, Filter, User, SlidersHorizontal, ChevronDown, ArrowUpDown } from "lucide-react"
import dynamic from "next/dynamic"
import { DonationModal } from "@/components/donation-modal"
import { useDonationModal } from "@/components/donation-modal-provider"

// Dynamically import the map to avoid SSR issues with Google Maps
// Use the same MapView component as mobile for consistency
const MapView = dynamic(
  () => import("@/components/map-view").then((mod) => mod.MapView),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl flex items-center justify-center">
        <span className="text-gray-400">Loading map...</span>
      </div>
    )
  }
)
import type { Post } from "@/lib/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ActiveFilters {
  count: number
  dateFilter: string
  rewardRange: [number, number]
  location: string
  searchQuery: string
  sortBy?: 'proximity' | 'recency' | 'reward'
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
    mainAccountProfile,
    activeUserId,
    switchToAccount,
    resetToMainAccount,
  } = useAuth()
  const router = useRouter()
  const { cache, setCachedPosts, clearCache, isCacheFresh } = useDashboardCache()
  const [currentLocation, setCurrentLocation] = useState(getCurrentLocation())
  const [posts, setPosts] = useState<Post[]>(cache.posts)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createBrowserSupabaseClient()

  const [currentPage, setCurrentPage] = useState(cache.currentPage)
  const [pageSize, setPageSize] = useState(5)
  const [hasMore, setHasMore] = useState(cache.hasMore)

  const [activeFilters, setActiveFilters] = useState<ActiveFilters | null>(cache.activeFilters)
  const [filterCleared, setFilterCleared] = useState(false)
  const [showBalancePulse, setShowBalancePulse] = useState(false)
  const prevBalance = useRef<number | null>(null)
  const donationModal = useDonationModal()
  const showDonationModal = donationModal?.isOpen ?? false
  const closeDonationModal = donationModal?.closeDonationModal ?? (() => {})

  const prevDeps = useRef({ user, loading, router })
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const initialDataLoaded = useRef(false)
  const cacheInitialized = useRef(false)

  // Add a ref to track the last fetched page
  const lastFetchedPage = useRef(1)
  
  // Add a ref to prevent concurrent fetches
  const fetchingPosts = useRef(false)

  // Initialize from cache on mount
  useEffect(() => {
    if (!cacheInitialized.current && cache.posts.length > 0 && isCacheFresh()) {
      console.log("Using fresh cached data - skipping initial fetch")
      setPosts(cache.posts)
      setCurrentPage(cache.currentPage)
      setHasMore(cache.hasMore)
      setActiveFilters(cache.activeFilters)
      setIsLoading(false)
      initialDataLoaded.current = true
      cacheInitialized.current = true
    }
  }, [cache, isCacheFresh])

  // Anonymous users are now allowed - no session redirect

  useEffect(() => {
    if (prevDeps.current.router !== router) {
      console.log("Router object changed.")
    }
    prevDeps.current = { user, loading, router }

    // Always set location to Downtown
    if (typeof window !== "undefined") {
      // Set Downtown as the default location
      saveSelectedLocation("downtown")
      setCurrentLocation(getCurrentLocation())
    }

    // Load active filters from localStorage
    const loadFilters = () => {
      const filtersJson = localStorage.getItem("activeFilters")
      setCurrentPage(1) // Reset to first page
      if (filtersJson) {
        try {
          const filters = JSON.parse(filtersJson)
          if (!filters.sortBy) filters.sortBy = "proximity"
          setActiveFilters(filters)
        } catch (e) {
          console.error("Error parsing filters:", e)
          // Set default filters if parsing fails
          setActiveFilters({
            sortBy: "proximity",
            count: 0,
            dateFilter: "any",
            rewardRange: [0, 10000],
            location: "",
            searchQuery: "",
          })
        }
      } else {
        // Set default filters if none are in storage
        setActiveFilters({
          sortBy: "proximity",
          count: 0,
          dateFilter: "any",
          rewardRange: [0, 10000],
          location: "",
          searchQuery: "",
        })
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

  // Refetch posts when sortBy changes
  useEffect(() => {
    if (activeFilters && typeof activeFilters.sortBy === 'string') {
      fetchPosts(1, activeFilters)
    }
  }, [activeFilters?.sortBy])

  // Watch for balance changes and trigger pulse animation
  useEffect(() => {
    if (profile?.balance !== undefined && profile.balance !== null) {
      // If this is the first time we're seeing the balance, just store it
      if (prevBalance.current === null) {
        console.log('💰 Initial balance set:', profile.balance)
        prevBalance.current = profile.balance
        return
      }

      // If balance increased, trigger pulse animation
      if (profile.balance > prevBalance.current) {
        console.log('💰 Balance increased!', prevBalance.current, '→', profile.balance)
        console.log('🎉 Triggering pulse animation')
        setShowBalancePulse(true)
        
        // Update the previous balance immediately
        prevBalance.current = profile.balance
        
        // Stop the pulse after 3 seconds
        const timeout = setTimeout(() => {
          console.log('⏱️ Pulse animation timeout - stopping pulse')
          setShowBalancePulse(false)
        }, 3000)

        return () => clearTimeout(timeout)
      }

      // If balance is same or decreased, just update tracking
      if (profile.balance !== prevBalance.current) {
        console.log('💰 Balance changed:', prevBalance.current, '→', profile.balance)
        prevBalance.current = profile.balance
      }
    }
  }, [profile?.balance])

  // Get accounts to show in header avatars (excluding current active account)
  const getHeaderAvatars = () => {
    const accounts = [...connectedAccounts]
    
    // If viewing from child account, add main account to the list
    if (activeUserId && user && mainAccountProfile) {
      accounts.unshift(mainAccountProfile)
    }
    
    // Filter out the currently active account
    return accounts.filter(account => account !== null && account.id !== activeUserId)
  }

  // Check if header data is ready to display
  const isHeaderReady = () => {
    return profile !== null && !loading && !isLoading
  }

  // Preload avatar images to ensure they all appear together
  useEffect(() => {
    if (profile && connectedAccounts.length > 0) {
      const avatarUrls = getHeaderAvatars()
        .map(account => account.avatar_url)
        .filter(url => url != null)
      
      avatarUrls.forEach(url => {
        if (typeof window !== 'undefined') {
          const img = document.createElement('img')
          img.src = url!
        }
      })
    }
  }, [profile, connectedAccounts])

  const clearFilters = () => {
    localStorage.removeItem("activeFilters")
    setActiveFilters(null)
    // Reset to page 1 and refresh posts without filters
    setCurrentPage(1)
    setPosts([]) // Clear posts immediately to avoid showing filtered results
    setIsLoading(true) // Show loading state
    setFilterCleared(true) // Set flag to trigger re-fetch
    clearCache() // Clear the cache since filters changed
  }

  const fetchPosts = useCallback(async (page = currentPage, filters = activeFilters) => {
    // Prevent concurrent fetches
    if (fetchingPosts.current) {
      console.log("Skipping fetch - already in progress")
      return
    }
    
    fetchingPosts.current = true
    
    console.log("Fetching posts with filters:", filters)
    // Enhanced logging before API call
    console.log("Session before API call:", !!session)
    if (session) {
      console.log("Session expiry:", new Date(session.expires_at! * 1000).toISOString())
    }

    setIsLoading(true)
    try {
      if (supabase) {
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        console.log(`Fetching posts from ${from} to ${to}`)

        let query = supabase
          .from("posts")
          .select(`
            *,
            group:group_id(
              id,
              name,
              description
            ),
            assigned_to_user:assigned_to(
              id,
              name
            )
          `, { count: "exact" })
          .eq("fixed", false)
          .neq("under_review", true)
          .is("deleted_at", null)

        // Apply sorting
        const sortBy = filters?.sortBy || 'proximity'
        if (sortBy === 'recency') {
          query = query.order('created_at', { ascending: false })
        } else if (sortBy === 'reward') {
          query = query.order('reward', { ascending: false })
        } else if (sortBy === 'proximity' && currentLocation?.lat && currentLocation?.lng) {
          // If using PostGIS or similar, you could use .order('distance', ...) with a computed column
          // For now, fallback to recency if proximity sort not supported
          query = query.order('created_at', { ascending: false })
        } else {
          query = query.order('created_at', { ascending: false })
        }

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

        // Handle 416 Range Not Satisfiable error
        if (error && error.code === '416') {
          console.warn('Received 416 Range Not Satisfiable, setting hasMore to false')
          setHasMore(false)
          setIsLoading(false)
          return
        }

        if (data && !error) {
          console.log(`fetchPosts page ${page} success:`, {
            dataLength: data.length,
            isFirstPage: page === 1,
            totalCount: count,
            from,
            to
          })
          
          const hasMorePages = count ? from + data.length < count : false
          
          // Build the final posts array with deduplication
          let finalPosts: typeof data = data

          // Use functional update to avoid stale closures and ensure dedup uses the latest posts
          setPosts(prev => {
            if (page === 1) {
              finalPosts = data
              console.log('Setting posts to new data (page 1)')
              return data
            }

            const existingIds = new Set(prev.map(p => p.id))
            const newPosts = data.filter(p => !existingIds.has(p.id))
            finalPosts = [...prev, ...newPosts]

            console.log('Appending posts to existing data (page > 1)')
            console.log('Previous posts count:', prev.length, 'New posts to add:', newPosts.length, 'Duplicates filtered:', data.length - newPosts.length)
            return finalPosts
          })
          setCurrentPage(page) // Only update after successful fetch
          setHasMore(hasMorePages)
          setIsLoading(false)
          
          // Save to cache
          setCachedPosts(finalPosts, page, hasMorePages, filters)
          return
        }
      }

      // Fall back to mock data if Supabase fails
      // let filteredPosts = [...mockPosts].filter((post) => !post.fixed && !post.under_review)

      // Apply filters to mock data if active
      // if (filters) {
      //   if (filters.searchQuery) {
      //     filteredPosts = filteredPosts.filter((post) =>
      //       post.title.toLowerCase().includes(filters.searchQuery.toLowerCase()),
      //     )
      //   }

      //   if (filters.dateFilter === "today") {
      //     const today = new Date()
      //     today.setHours(0, 0, 0, 0)
      //     filteredPosts = filteredPosts.filter((post) => {
      //       const postDate = new Date(post.created_at)
      //       return postDate >= today
      //     })
      //   } else if (filters.dateFilter === "week") {
      //     const weekAgo = new Date()
      //     weekAgo.setDate(weekAgo.getDate() - 7)
      //     filteredPosts = filteredPosts.filter((post) => {
      //       const postDate = new Date(post.created_at)
      //       return postDate >= weekAgo
      //     })
      //   }

      //   filteredPosts = filteredPosts.filter(
      //     (post) => post.reward >= filters.rewardRange[0] && post.reward <= filters.rewardRange[1],
      //   )
      // }

      // console.log(`Filtered posts count: ${filteredPosts.length}`)

      // const mockPaginatedPosts = filteredPosts.slice((page - 1) * pageSize, page * pageSize)

      // if (page === 1) {
      //   setPosts(mockPaginatedPosts)
      // } else {
      //   setPosts((prev) => [...prev, ...mockPaginatedPosts])
      // }

      // // Check if there are more mock posts to load
      // setHasMore(page * pageSize < filteredPosts.length)
    } catch (error) {
      console.error("Error fetching posts:", error)
      // Fall back to mock data with simplified filter logic
      // let filteredPosts = [...mockPosts].filter((post) => !post.fixed && !post.under_review)

      // // Apply basic filters even in error case
      // if (filters && filters.dateFilter === "today") {
      //   const today = new Date()
      //   today.setHours(0, 0, 0, 0)
      //   filteredPosts = filteredPosts.filter((post) => new Date(post.created_at) >= today)
      // }

      // const mockPaginatedPosts = filteredPosts.slice((page - 1) * pageSize, page * pageSize)

      // if (page === 1) {
      //   setPosts(mockPaginatedPosts)
      // } else {
      //   setPosts((prev) => [...prev, ...mockPaginatedPosts])
      // }

      // setHasMore(page * pageSize < filteredPosts.length)
    } finally {
      setIsLoading(false)
      fetchingPosts.current = false
    }
  }, [supabase, session, currentLocation, pageSize, activeFilters])

  // Initial data loading effect - works for both anonymous and authenticated users
  useEffect(() => {
    if (sessionLoaded && activeFilters && !initialDataLoaded.current) {
      console.log("Dashboard - Initial data fetch triggered", { user: !!user, session: !!session })
      fetchPosts(1, activeFilters)
      initialDataLoaded.current = true
    }
  }, [sessionLoaded, user, session, activeFilters, fetchPosts])

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && posts.length === 0 && !isLoading && user && initialDataLoaded.current) {
        // Tab became visible and we have no posts, reload them
        console.log("Dashboard - Tab became visible, reloading posts")
        setCurrentPage(1) // Reset to page 1
        lastFetchedPage.current = 1 // Reset tracking
        fetchPosts(1, activeFilters)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [posts.length, isLoading, user, activeFilters])

  // Infinite scroll effect
  useEffect(() => {
    if (!hasMore || isLoading) return
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new window.IntersectionObserver(
      (entries) => {
        console.log('Infinite scroll triggered:', {
          isIntersecting: entries[0].isIntersecting,
          hasMore,
          isLoading,
          currentPage,
          lastFetchedPage: lastFetchedPage.current,
          fetchingPosts: fetchingPosts.current
        })
        if (
          entries[0].isIntersecting &&
          hasMore &&
          !isLoading &&
          !fetchingPosts.current && // Don't trigger if already fetching
          currentPage === lastFetchedPage.current
        ) {
          console.log('✅ Fetching next page:', currentPage + 1)
          // Only fetch if we haven't already fetched the next page
          lastFetchedPage.current = currentPage + 1
          fetchPosts(currentPage + 1)
        } else if (entries[0].isIntersecting) {
          console.log('❌ Skipping infinite scroll - conditions not met')
        }
      },
      { root: null, rootMargin: "100px", threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoading, currentPage, fetchPosts])

  const handleSatsClick = () => {
    router.push("/wallet")
  }

  function handleSortChange(sort: 'proximity' | 'recency' | 'reward') {
    const prev: Partial<ActiveFilters> = (activeFilters || {})
    const newFilters = {
      count: prev.count ?? 0,
      dateFilter: prev.dateFilter ?? 'any',
      rewardRange: prev.rewardRange ?? [0, 10000],
      location: prev.location ?? '',
      searchQuery: prev.searchQuery ?? '',
      sortBy: sort,
      timestamp: prev.timestamp ?? new Date().toISOString(),
    }
    setActiveFilters(newFilters)
    localStorage.setItem('activeFilters', JSON.stringify(newFilters))
  }

  // Show loading state only when session is still being loaded
  if (!sessionLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  return (
    <>
      {/* Desktop: Side-by-side layout */}
      <div 
        data-testid="dashboard-loaded"
        className="lg:flex lg:h-[calc(100vh-64px)] lg:overflow-hidden bg-white dark:bg-background"
      >
        {/* Left Panel - Feed (scrollable) - Thinner */}
        <div className="w-full lg:w-[380px] xl:w-[420px] lg:flex-shrink-0 lg:overflow-y-auto lg:border-r lg:border-gray-200 lg:dark:border-gray-800">
          
          {/* Mobile Header - Floating sats balance pill OR sign-up CTA for anonymous */}
          <div className="lg:hidden sticky top-0 z-10 bg-gradient-to-b from-background via-background to-transparent pb-2 w-full flex justify-center will-change-transform" style={{ contain: 'layout style paint', transform: 'translate3d(0,0,0)' }}>
            <div className="w-full max-w-md pt-3 px-4 relative min-h-[56px]">
              {!user ? (
                // Anonymous user - show sign-up CTA
                <div className="flex items-center justify-end gap-2 animate-in fade-in duration-200 fill-mode-both">
                  <Button 
                    onClick={() => router.push("/auth/register")}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Sign Up to Earn
                  </Button>
                </div>
              ) : isHeaderReady() && (
            // Header content - fades in when ready
            <div className="flex items-center justify-end animate-in fade-in duration-200 fill-mode-both">
              {/* Sats Balance Pill */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="relative">
                    {/* Pulse Rings - only show when balance increases */}
                    {showBalancePulse && (
                      <>
                        <div className="absolute inset-0 rounded-full border-2 border-amber-400/40 dark:border-amber-500/30 animate-ping" style={{ animationDuration: '1.5s' }}></div>
                        <div className="absolute inset-0 rounded-full border-2 border-amber-500/30 dark:border-amber-400/20 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.3s' }}></div>
                        <div className="absolute inset-0 rounded-full border-2 border-amber-400/20 dark:border-amber-300/15 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.6s' }}></div>
                      </>
                    )}
                    
                    <Button 
                      variant="ghost" 
                      className="flex items-center gap-2 h-10 px-3 bg-amber-100 rounded-full text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900 transition-all focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 data-[state=open]:outline-none data-[state=open]:ring-0 relative z-10"
                      aria-label="Account menu"
                    >
                      {/* Only show avatar if viewing from a child account */}
                      {isConnectedAccount && (
                        <Avatar className="h-7 w-7">
                          <AvatarImage
                            src={profile?.avatar_url ?? undefined}
                            alt={profile?.name ?? "User"}
                          />
                          <AvatarFallback>
                            <User className="h-3.5 w-3.5" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Image src="/images/bitcoin-logo.png" alt="Bitcoin" width={14} height={14} />
                        <span className="text-sm font-medium">
                          {profile ? formatSatsValue(profile.balance) : formatSatsValue(0)}
                        </span>
                      </div>
                    </Button>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 p-2">
                  {/* Current Balance Header */}
                  <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-700 mb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Current Balance</p>
                        <p className="text-lg font-semibold">
                          {profile ? formatSatsValue(profile.balance) : formatSatsValue(0)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSatsClick}
                        className="text-xs"
                      >
                        View Wallet
                      </Button>
                    </div>
                  </div>

                  {/* Account Switcher Section */}
                  {connectedAccounts.length > 0 && (
                    <>
                      <div className="px-3 py-1 mb-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Switch Account
                        </p>
                      </div>

                      {/* Main Account */}
                      <DropdownMenuItem
                        onClick={resetToMainAccount}
                        className={`flex items-center gap-3 py-3 px-3 text-base ${!isConnectedAccount ? "bg-blue-50 dark:bg-blue-950" : ""}`}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage 
                            src={!isConnectedAccount ? profile?.avatar_url : user?.user_metadata?.avatar_url ?? undefined} 
                            alt={user?.user_metadata?.full_name ?? "User"} 
                          />
                          <AvatarFallback>
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex-1 font-medium">{user?.user_metadata?.full_name || "Main Account"}</span>
                        {!isConnectedAccount && <span className="text-blue-600">✓</span>}
                      </DropdownMenuItem>

                      {/* Connected Accounts */}
                      {connectedAccounts.map((account: any) => (
                        <DropdownMenuItem
                          key={account.id}
                          onClick={() => switchToAccount(account.id)}
                          className={`flex items-center gap-3 py-3 px-3 text-base ${activeUserId === account.id ? "bg-blue-50 dark:bg-blue-950" : ""}`}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={account.avatar_url ?? undefined} alt={account.name ?? undefined} />
                            <AvatarFallback>
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <span className="flex-1 font-medium">{account.name}</span>
                          {activeUserId === account.id && <span className="text-blue-600">✓</span>}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}

                  {/* If no connected accounts, still show main account info */}
                  {connectedAccounts.length === 0 && (
                    <>
                      <div className="px-3 py-1 mb-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Account
                        </p>
                      </div>
                      <DropdownMenuItem className="flex items-center gap-3 py-3 px-3 text-base bg-blue-50 dark:bg-blue-950">
                        <Avatar className="h-8 w-8">
                          <AvatarImage 
                            src={profile?.avatar_url ?? undefined} 
                            alt={user?.user_metadata?.full_name ?? "User"} 
                          />
                          <AvatarFallback>
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex-1 font-medium">{user?.user_metadata?.full_name || "Account"}</span>
                        <span className="text-blue-600">✓</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
            </div>
          </div>
          {/* End Mobile Header */}
          
          {/* Desktop top padding */}
          <div className="hidden lg:block pt-4"></div>

          <div className="w-full flex justify-center lg:block">
            <div className="relative w-full max-w-md lg:max-w-none pb-20 lg:pb-8 px-4">
              {/* Feed content */}
          {posts.length === 0 && isLoading ? (
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg dark:border-gray-800 overflow-hidden relative">
                  {/* Image skeleton */}
                  <div className="w-full h-48 bg-gray-200 dark:bg-gray-800 animate-pulse"></div>
                  {/* Details skeleton - matches CardFooter */}
                  <div className="p-4 pt-4 h-[104px] flex items-start justify-between w-full relative">
                    {/* Left side: Description, Location, Travel Times, Poster info */}
                    <div className="flex flex-col space-y-2 flex-1">
                      {/* Title skeleton */}
                      <div className="h-5 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-2 animate-pulse"></div>
                      {/* Location and Travel Times row skeleton */}
                      <div className="flex items-center space-x-2">
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-20 animate-pulse"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-16 animate-pulse"></div>
                      </div>
                      {/* Poster info and timestamp row skeleton */}
                      <div className="flex items-center space-x-2">
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-24 animate-pulse"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-12 animate-pulse"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-16 animate-pulse"></div>
                      </div>
                    </div>
                    {/* Bitcoin icon and badge placeholder */}
                    <div style={{ position: "relative", width: "48px", height: "48px" }}>
                      {/* Bitcoin icon blob skeleton */}
                      <div className="bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" style={{ width: 43, height: 43, position: 'absolute', top: 0, left: 2 }}></div>
                      {/* Badge placeholder */}
                      <div className="bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" style={{
                        position: "absolute",
                        bottom: "-16px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "40px",
                        height: "24px",
                        zIndex: 3,
                      }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {posts.length > 0 ? (
                <>
                  {posts.map((post: any) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                  {/* Infinite scroll sentinel */}
                  {hasMore && (
                    <div ref={sentinelRef} className="flex justify-center mt-6" style={{ minHeight: 40 }}>
                      {isLoading ? (
                        <div className="space-y-6 w-full">
                          <div className="border rounded-lg dark:border-gray-800 overflow-hidden">
                            <div className="w-full h-48 bg-gray-200 dark:bg-gray-800 animate-pulse"></div>
                            <div className="p-4">
                              <div className="h-5 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-2 animate-pulse"></div>
                              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full mb-1 animate-pulse"></div>
                              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-2/3 animate-pulse"></div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              ) : (
                <div className="p-8 text-center border rounded-lg dark:border-gray-800 bg-white/90 dark:bg-background/90">
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
        </div>
        {/* End Left Panel */}

        {/* Right Panel - Map (Desktop only) */}
        {/* Uses the same MapView component as mobile for consistency */}
        <div className="hidden lg:block flex-1 relative">
          <MapView 
            posts={[]}  // Let MapView fetch its own posts (dashboard posts are paginated for feed)
            isModal={true}  // Prevents bottom nav spacing since we're in a side panel
            onNewIssue={() => router.push("/post/new")}
            showPreviewCard={true}  // Show post preview card when marker is clicked
            hideSearchOverlay={true}  // Hide search/donate overlay (already in dashboard header)
          />
        </div>
      </div>
      
      {/* Donation Modal */}
      <DonationModal
        open={showDonationModal}
        onOpenChange={(open) => {
          if (!open) closeDonationModal()
        }}
      />
    </>
  )
}
