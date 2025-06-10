"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { PostCard } from "@/components/post-card"
import { useAuth } from "@/components/auth-provider"
import { useNotifications } from "@/components/notifications-provider"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { formatSatsValue, formatTimeAgo } from "@/lib/utils"
import { mockPosts } from "@/lib/mock-data"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"
import { AvatarSelector } from "@/components/avatar-selector"
import { GroupsList } from "@/components/groups-list"
import type { Post } from "@/lib/types"
import { AddConnectedAccountDialog } from "@/components/add-connected-account-dialog"
import { AccountSwitcherDropdown } from "@/components/account-switcher-dropdown"

type ActivityItem = {
  id: string
  type: "post" | "fix" | "reward" | "fix_submitted" | "fix_review_needed" | "donation"
  postId?: string
  postTitle?: string
  timestamp: Date
  amount?: number
  submitterName?: string
  submitterAvatar?: string
  // Donation specific fields
  donationId?: string
  locationName?: string
  donorName?: string
  message?: string
}

export default function ProfilePage() {
  const {
    user,
    profile,
    loading,
    session,
    sessionLoaded,
    signOut,
    isConnectedAccount,
    switchToAccount,
    resetToMainAccount,
    connectedAccounts,
    fetchConnectedAccounts,
    activeUserId,
  } = useAuth()
  const { hasPendingRequests } = useNotifications()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("activity")
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [showQrDialog, setShowQrDialog] = useState(false)
  const [showAvatarSelector, setShowAvatarSelector] = useState(false)
  const [postedIssues, setPostedIssues] = useState<Post[]>([])
  const [fixedIssues, setFixedIssues] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isActivityLoading, setIsActivityLoading] = useState(false)
  const [bitcoinPrice, setBitcoinPrice] = useState(64000)
  const [isPriceLoading, setIsPriceLoading] = useState(true)
  const supabase = createBrowserSupabaseClient()
  const { toast } = useToast()
  const [activitiesPage, setActivitiesPage] = useState(1)
  const [hasMoreActivities, setHasMoreActivities] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [postsPage, setPostsPage] = useState(1)
  const [hasMorePosts, setHasMorePosts] = useState(false)
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState(false)
  const ACTIVITIES_PER_PAGE = 10
  const [showAddAccountDialog, setShowAddAccountDialog] = useState(false)

  // Cache for posts data to avoid redundant processing
  const postsCache = useRef<Post[]>([])
  // Track if initial data has been loaded
  const initialDataLoaded = useRef(false)
  // Track if Bitcoin price has been fetched
  const bitcoinPriceFetched = useRef(false)
  // Track the current active user to detect changes
  const currentActiveUser = useRef<string | null>(null)

  // Add session guard with useEffect
  useEffect(() => {
    if (sessionLoaded && !session) {
      console.log("Profile - No session after loading, redirecting to login")
      router.push("/auth/login")
    }
  }, [session, sessionLoaded, router])

  // Detect when active user changes and reset data
  useEffect(() => {
    const newActiveUser = activeUserId || user?.id || null

    if (currentActiveUser.current !== newActiveUser && newActiveUser) {
      console.log("Active user changed, resetting data:", currentActiveUser.current, "->", newActiveUser)

      // Reset all data
      setActivities([])
      setPostedIssues([])
      setFixedIssues([])
      setActivitiesPage(1)
      setPostsPage(1)
      setHasMoreActivities(false)
      setHasMorePosts(false)
      postsCache.current = []
      initialDataLoaded.current = false

      // Update the tracked user
      currentActiveUser.current = newActiveUser
    }
  }, [activeUserId, user?.id])

  // Fetch the current Bitcoin price - memoized to prevent unnecessary re-creation
  const fetchBitcoinPrice = useCallback(async () => {
    if (bitcoinPriceFetched.current) return

    try {
      setIsPriceLoading(true)
      console.log("🔍 Fetching Bitcoin price from CoinMarketCap")

      const response = await fetch("/api/bitcoin-price")
      const data = await response.json()

      if (data.price) {
        console.log(`🔍 Current Bitcoin price: $${data.price}`)
        setBitcoinPrice(data.price)
        bitcoinPriceFetched.current = true
      } else {
        console.warn("No price data returned, using fallback price")
      }
    } catch (error) {
      console.error("Error fetching Bitcoin price:", error)
    } finally {
      setIsPriceLoading(false)
    }
  }, [])

  // Calculate USD value from satoshis
  const calculateUsdValue = (sats: number) => {
    const btcAmount = sats / 100000000
    const usdValue = btcAmount * bitcoinPrice
    return usdValue.toFixed(2)
  }

  // Fetch all posts related to the user in a single query
  const fetchUserPosts = useCallback(
    async (page = 1) => {
      if (!user || !supabase) return { posts: [], hasMore: false }

      try {
        console.log("🔍 Fetching user-related posts")
        console.log("Session before fetchUserPosts:", !!session)
        if (session) {
          console.log("Session expiry:", new Date(session.expires_at! * 1000).toISOString())
        }

        // Use the active user ID (connected account or main account)
        const currentUserId = activeUserId || user.id
        console.log("Fetching posts for user:", currentUserId)

        const limit = 5
        const offset = (page - 1) * limit

        const { data, error } = await supabase
          .from("posts")
          .select("*")
          .or(`user_id.eq.${currentUserId},fixed_by.eq.${currentUserId}`)
          .order("created_at", { ascending: false })
          .limit(limit)
          .range(offset, offset + limit - 1)

        if (error) {
          console.error("Error fetching user posts:", error)
          return { posts: [], hasMore: false }
        }

        // Deduplicate posts by id in case a user both created and fixed the same post
        const uniquePosts = data
          ? data.filter((post, index, self) => index === self.findIndex((p) => p.id === post.id))
          : []

        // Check if there are more posts
        const { count } = await supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .or(`user_id.eq.${currentUserId},fixed_by.eq.${currentUserId}`)

        console.log(`🔍 Found ${uniquePosts.length} unique user-related posts`)
        return {
          posts: uniquePosts,
          hasMore: (count || 0) > page * limit,
        }
      } catch (error) {
        console.error("Error in fetchUserPosts:", error)
        return { posts: [], hasMore: false }
      }
    },
    [user, supabase, session, activeUserId],
  )

  // Fetch recent donations
  const fetchDonations = useCallback(async () => {
    if (!supabase) return { donations: [] }

    try {
      console.log("🔍 Fetching recent donations")

      const { data, error } = await supabase
        .from("donations")
        .select("*, donation_pools(location_name)")
        .in("status", ["pending", "completed"])
        .order("created_at", { ascending: false })
        .limit(20)

      if (error) {
        console.error("Error fetching donations:", error)
        return { donations: [] }
      }

      console.log(`🔍 Found ${data.length} donations`)
      return { donations: data }
    } catch (error) {
      console.error("Error in fetchDonations:", error)
      return { donations: [] }
    }
  }, [supabase])

  // Process posts into different categories (posted, fixed, activities)
  const processPosts = useCallback(
    (posts: Post[], append = false) => {
      if (!user || !posts) return

      console.log("🔍 Processing posts into categories")

      // Use the active user ID (connected account or main account)
      const currentUserId = activeUserId || user.id

      // Filter posted issues
      const posted = posts.filter((post) => post.user_id === currentUserId || post.userId === currentUserId)
      // Filter fixed issues
      const fixed = posts.filter((post) => post.fixed_by === currentUserId)

      // Update state based on append flag
      if (append) {
        setPostedIssues((prev) => [...prev, ...posted])
        setFixedIssues((prev) => [...prev, ...fixed])
      } else {
        setPostedIssues(posted)
        setFixedIssues(fixed)
      }

      // Store in cache for later use
      if (!append) {
        postsCache.current = posts
      } else {
        postsCache.current = [...postsCache.current, ...posts]
      }

      return { posted, fixed }
    },
    [user, activeUserId],
  )

  // Generate activities from posts with pagination
  const generateActivities = useCallback(
    (posts: Post[], page: number, donations: any[] = []) => {
      if (!user) return

      setIsActivityLoading(true)
      console.log("🔍 Generating activities from posts and donations")

      // Use the active user ID (connected account or main account)
      const currentUserId = activeUserId || user.id

      const userActivities: ActivityItem[] = []

      // Posts created by the user
      posts
        .filter((post) => post.userId === currentUserId || post.user_id === currentUserId)
        .forEach((post) => {
          userActivities.push({
            id: `post-${post.id}`,
            type: "post",
            postId: post.id,
            postTitle: post.title,
            timestamp: new Date(post.createdAt || post.created_at),
          })
        })

      // Posts fixed by the user
      posts
        .filter((post) => post.fixed_by === currentUserId && post.fixed === true)
        .forEach((post) => {
          if (post.fixed_at || post.fixedAt) {
            userActivities.push({
              id: `fix-${post.id}`,
              type: "fix",
              postId: post.id,
              postTitle: post.title,
              timestamp: new Date(post.fixed_at || post.fixedAt),
            })

            userActivities.push({
              id: `reward-${post.id}`,
              type: "reward",
              postId: post.id,
              postTitle: post.title,
              timestamp: new Date(post.fixed_at || post.fixedAt),
              amount: post.reward,
            })
          }
        })

      // Posts submitted for review by the user
      posts
        .filter((post) => post.fixed_by === currentUserId && post.under_review === true)
        .forEach((post) => {
          if (post.submitted_at) {
            userActivities.push({
              id: `fix_submitted-${post.id}`,
              type: "fix_submitted",
              postId: post.id,
              postTitle: post.title,
              timestamp: new Date(post.submitted_at),
            })
          }
        })

      // Posts that need review by the original poster
      posts
        .filter(
          (post) =>
            (post.userId === currentUserId || post.user_id === currentUserId) &&
            post.under_review === true &&
            post.submitted_fix_by_id &&
            post.submitted_fix_at,
        )
        .forEach((post) => {
          userActivities.push({
            id: `fix_review_needed-${post.id}`,
            type: "fix_review_needed",
            postId: post.id,
            postTitle: post.title,
            timestamp: new Date(post.submitted_fix_at),
            submitterName: post.submitted_fix_by_name || "Someone",
            submitterAvatar: post.submitted_fix_by_avatar,
          })
        })

      // Add donation activities
      donations.forEach((donation) => {
        const locationName = donation.donation_pools?.location_name || "a location"
        userActivities.push({
          id: `donation-${donation.id}`,
          type: "donation",
          donationId: donation.id,
          locationName: locationName,
          donorName: donation.donor_name || "Someone",
          message: donation.message,
          amount: donation.amount,
          timestamp: new Date(donation.created_at || donation.completed_at),
        })
      })

      // Sort by timestamp (newest first)
      userActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      const totalActivities = userActivities.length
      console.log(`🔍 Generated ${totalActivities} total activity items`)

      // Calculate pagination
      const itemsPerPage = ACTIVITIES_PER_PAGE
      const start = (page - 1) * itemsPerPage
      const end = start + itemsPerPage
      const pageActivities = userActivities.slice(start, end)

      // Check if there are more activities to load
      setHasMoreActivities(end < totalActivities)

      // Update the activities state based on the page
      if (page === 1) {
        setActivities(pageActivities)
      } else {
        setActivities((prev) => [...prev, ...pageActivities])
      }

      setActivitiesPage(page)
      setIsActivityLoading(false)
    },
    [user, activeUserId],
  )

  // Load more activities
  const handleLoadMore = useCallback(() => {
    if (isLoadingMore) return

    setIsLoadingMore(true)
    const nextPage = activitiesPage + 1

    // Fetch donations to include in the next page
    fetchDonations().then(({ donations }) => {
      // Use cached posts to generate more activities
      if (postsCache.current.length > 0) {
        generateActivities(postsCache.current, nextPage, donations)
        setIsLoadingMore(false)
      } else {
        // Fallback to fetching if cache is empty
        fetchUserPosts().then(({ posts }) => {
          if (posts) {
            generateActivities(posts, nextPage, donations)
          }
          setIsLoadingMore(false)
        })
      }
    })
  }, [activitiesPage, fetchUserPosts, generateActivities, isLoadingMore, fetchDonations])

  // Add Load More Posts Function
  const handleLoadMorePosts = useCallback(async () => {
    if (isLoadingMorePosts) return

    setIsLoadingMorePosts(true)
    const nextPage = postsPage + 1

    try {
      const { posts, hasMore } = await fetchUserPosts(nextPage)

      if (posts.length > 0) {
        processPosts(posts, true) // true = append mode
        setHasMorePosts(hasMore)
        setPostsPage(nextPage)
      }
    } catch (error) {
      console.error("Error loading more posts:", error)
    } finally {
      setIsLoadingMorePosts(false)
    }
  }, [fetchUserPosts, postsPage, isLoadingMorePosts, processPosts])

  // Initial data loading
  useEffect(() => {
    if (loading || !user || initialDataLoaded.current) return

    const loadInitialData = async () => {
      setIsLoading(true)

      // Fetch Bitcoin price (only once)
      fetchBitcoinPrice()

      // Fetch user posts immediately regardless of active tab
      const { posts, hasMore } = await fetchUserPosts(1)

      // Fetch recent donations
      const { donations } = await fetchDonations()

      if (posts.length > 0) {
        // Process posts into different categories
        processPosts(posts)
        setHasMorePosts(hasMore)

        // Generate initial activities if on activity tab
        if (activeTab === "activity") {
          generateActivities(posts, 1, donations)
        }
      } else {
        // Fallback to mock data
        console.log("🔍 Using mock data")
        const currentUserId = activeUserId || user.id
        const mockUserPosts = mockPosts.filter(
          (post) => post.userId === currentUserId || post.user_id === currentUserId,
        )
        processPosts(mockUserPosts)

        if (activeTab === "activity") {
          generateActivities(mockUserPosts, 1, donations)
        }
      }

      initialDataLoaded.current = true
      setIsLoading(false)
    }

    loadInitialData()
  }, [
    user,
    loading,
    activeTab,
    fetchBitcoinPrice,
    fetchUserPosts,
    processPosts,
    generateActivities,
    activeUserId,
    fetchDonations,
  ])

  useEffect(() => {
    fetchConnectedAccounts()
  }, [user?.id])

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && activities.length === 0 && !isLoading && user && initialDataLoaded.current) {
        // Tab became visible and we have no activities, reload them
        console.log("🔍 Tab became visible, reloading activities")
        const loadData = async () => {
          const { posts } = await fetchUserPosts(1)
          if (posts.length > 0) {
            processPosts(posts)
            if (activeTab === "activity") {
              generateActivities(posts, 1)
            }
          }
        }
        loadData()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [activities.length, isLoading, user, activeTab, fetchUserPosts, processPosts, generateActivities])

  // Handle tab changes
  const handleTabChange = useCallback(
    (value: string) => {
      setActiveTab(value)

      // If we're switching to activity tab and don't have activities yet
      if (value === "activity" && activities.length === 0 && postsCache.current.length > 0) {
        // Fetch donations when switching to activity tab
        fetchDonations().then(({ donations }) => {
          generateActivities(postsCache.current, 1, donations)
        })
      }
    },
    [activities.length, generateActivities, fetchDonations],
  )

  // Check if current profile is a child account
  const isChildAccount = profile?.email?.endsWith("@ganamos.app") || false

  // Session guard with early return
  if (sessionLoaded && !session) {
    return null // Will redirect in useEffect
  }

  if (loading || !user || !profile) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  return (
    <div className="container px-4 py-6 mx-auto max-w-md">
      <div className="mb-6"></div>

      <Card className="mb-6 border dark:border-gray-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div
                className="relative w-16 h-16 mr-4 overflow-hidden rounded-full cursor-pointer"
                onClick={() => setShowAvatarSelector(true)}
              >
                <Image
                  src={profile.avatar_url || "/placeholder.svg?height=64&width=64"}
                  alt={profile.name || "User"}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 transition-opacity hover:bg-opacity-30">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-0 transition-opacity hover:opacity-100"
                  >
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold">
                  {profile.name
                    ? profile.name
                        .split(" ")
                        .map((part, index, array) =>
                          index === array.length - 1 && array.length > 1 ? part.charAt(0) + "." : part,
                        )
                        .join(" ")
                    : profile.name}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle className="h-11 w-11" />
              <AccountSwitcherDropdown>
                <Button variant="outline" size="default" className="h-11 w-11 rounded-md">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                  <span className="sr-only">Open menu</span>
                </Button>
              </AccountSwitcherDropdown>
            </div>
          </div>

          <Separator className="my-4 dark:bg-gray-800" />

          <div className="grid grid-cols-2 gap-4">
            <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="p-3 text-center border rounded-lg w-full h-auto dark:border-gray-800"
                  onClick={() => router.push("/wallet")}
                >
                  <div className="flex flex-col items-center">
                    <div className="flex items-center mb-1">
                      <div className="w-4 h-4 mr-1.5 relative">
                        <Image
                          src="/images/bitcoin-logo.png"
                          alt="Bitcoin"
                          width={16}
                          height={16}
                          className="object-contain"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">Balance</p>
                    </div>
                    <p className="text-xl font-bold">{formatSatsValue(profile.balance)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isPriceLoading ? "Loading..." : `$${calculateUsdValue(profile.balance)} USD`}
                    </p>
                  </div>
                </Button>
              </DialogTrigger>
            </Dialog>
            <div className="p-3 text-center border rounded-lg dark:border-gray-800">
              <p className="text-sm text-muted-foreground">Issues Fixed</p>
              <p className="text-xl font-bold">{profile.fixed_issues_count || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="activity" className="w-full" onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-3 mb-4 dark:bg-gray-800/50">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="groups" className="relative">
            Groups
            {hasPendingRequests && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-pulse flex flex-col space-y-4">
                <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
              </div>
            </div>
          ) : [...postedIssues, ...fixedIssues].length > 0 ? (
            <>
              <div className="space-y-4">
                {[...postedIssues, ...fixedIssues]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
              </div>

              {hasMorePosts && (
                <div className="mt-6 text-center">
                  <Button
                    variant="outline"
                    onClick={handleLoadMorePosts}
                    disabled={isLoadingMorePosts}
                    className="w-full"
                  >
                    {isLoadingMorePosts ? (
                      <div className="flex items-center justify-center">
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
            <div className="p-8 text-center">
              <p className="text-muted-foreground">No posts yet</p>
              <Button className="mt-4" onClick={() => router.push("/dashboard")}>
                Start exploring issues
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          {isLoading || isActivityLoading ? (
            <div className="p-8 text-center">
              <div className="animate-pulse flex flex-col space-y-4">
                <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
                <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
              </div>
            </div>
          ) : activities.length > 0 ? (
            <>
              <div className="space-y-4">
                {activities.map((activity) => (
                  <ActivityCard key={activity.id} activity={activity} />
                ))}
              </div>

              {hasMoreActivities && (
                <div className="mt-6 text-center">
                  <Button variant="outline" onClick={handleLoadMore} disabled={isLoadingMore} className="w-full">
                    {isLoadingMore ? (
                      <div className="flex items-center justify-center">
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
            <div className="p-8 text-center">
              <p className="text-muted-foreground">No activity yet</p>
              <Button className="mt-4" onClick={() => router.push("/dashboard")}>
                Start exploring issues
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="groups" className="space-y-4">
          <div className="flex justify-between items-center">
            <Button size="sm" variant="outline" onClick={() => router.push("/groups/search")}>
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
                className="mr-1"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              Find Group
            </Button>
            <Button size="sm" variant="outline">
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
                className="mr-1"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              New Group
            </Button>
          </div>
          <GroupsList userId={activeUserId || user.id} />
        </TabsContent>
      </Tabs>

      <AvatarSelector isOpen={showAvatarSelector} onOpenChange={setShowAvatarSelector} />
      <AddConnectedAccountDialog
        open={showAddAccountDialog}
        onOpenChange={setShowAddAccountDialog}
        onAccountAdded={fetchConnectedAccounts}
      />
    </div>
  )
}

function ActivityCard({ activity }: { activity: ActivityItem }) {
  const router = useRouter()

  const handleClick = () => {
    if (activity.type === "donation") {
      // Donations don't have a detail page to navigate to
      return
    }
    router.push(`/post/${activity.postId}`)
  }

  // Format the date safely
  const formatDate = () => {
    try {
      if (!activity.timestamp) return "Recently"

      // Check if the date is valid
      if (isNaN(activity.timestamp.getTime())) return "Recently"

      return formatTimeAgo(activity.timestamp)
    } catch (error) {
      console.error("Error formatting date:", error)
      return "Recently"
    }
  }

  return (
    <Card
      className={`hover:bg-muted/50 border dark:border-gray-800 ${activity.type !== "donation" ? "cursor-pointer" : ""}`}
      onClick={handleClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start">
          <ActivityIcon type={activity.type} />
          <div className="ml-3 flex-1">
            <div className="flex items-start justify-between">
              <div>
                <ActivityTitle activity={activity} />
                {activity.type !== "donation" ? (
                  <p className="text-sm text-muted-foreground">{activity.postTitle}</p>
                ) : activity.message ? (
                  <p className="text-sm text-muted-foreground">"{activity.message}"</p>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">{formatDate()}</div>
            </div>

            {(activity.type === "reward" || activity.type === "donation") && activity.amount && (
              <Badge
                variant="outline"
                className="mt-2 flex items-center gap-1 bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800/30"
              >
                <div className="w-3 h-3 relative">
                  <Image
                    src="/images/bitcoin-logo.png"
                    alt="Bitcoin"
                    width={12}
                    height={12}
                    className="object-contain"
                  />
                </div>
                {activity.type === "reward" ? "+" : ""}
                {formatSatsValue(activity.amount)}
              </Badge>
            )}
            {activity.type === "fix_review_needed" && (
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100 dark:bg-orange-950/30 dark:text-orange-200 dark:border-orange-800/30 dark:hover:bg-orange-950/50"
                >
                  Review needed
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ActivityTitle({ activity }: { activity: ActivityItem }) {
  switch (activity.type) {
    case "post":
      return <p className="font-medium">You posted a new issue</p>
    case "fix":
      return <p className="font-medium">You fixed an issue</p>
    case "reward":
      return <p className="font-medium">You received a reward</p>
    case "fix_submitted":
      return <p className="font-medium">You submitted a fix for review</p>
    case "fix_review_needed":
      return <p className="font-medium">{activity.submitterName || "Someone"} submitted a fix</p>
    case "donation":
      return (
        <p className="font-medium">
          {activity.donorName} donated to {activity.locationName}
        </p>
      )
    default:
      return <p className="font-medium">Activity</p>
  }
}

function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case "post":
      return (
        <div className="p-2 bg-blue-100 rounded-full dark:bg-blue-950/50">
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
            className="text-blue-600 dark:text-blue-400"
          >
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
        </div>
      )
    case "fix":
      return (
        <div className="p-2 bg-emerald-100 rounded-full dark:bg-emerald-950/50">
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
            className="text-emerald-600 dark:text-emerald-400"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
      )
    case "reward":
      return (
        <div className="p-2 bg-amber-100 rounded-full dark:bg-amber-950/50">
          <div className="w-4 h-4 relative">
            <Image src="/images/bitcoin-logo.png" alt="Bitcoin" width={16} height={16} className="object-contain" />
          </div>
        </div>
      )
    case "fix_submitted":
      return (
        <div className="p-2 bg-purple-100 rounded-full dark:bg-purple-950/50">
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
            className="text-purple-600 dark:text-purple-400"
          >
            <polyline points="12 2 12 6 15 4" />
            <polyline points="12 22 12 18 9 20" />
            <line x1="12" y1="6" x2="12" y2="18" />
          </svg>
        </div>
      )
    case "fix_review_needed":
      return (
        <div className="p-2 bg-orange-100 rounded-full dark:bg-orange-950/50">
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
            className="text-orange-600 dark:text-orange-400"
          >
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
        </div>
      )
    case "donation":
      return (
        <div className="p-2 bg-green-100 rounded-full dark:bg-green-950/50">
          <div className="w-4 h-4 relative">
            <Image src="/images/bitcoin-logo.png" alt="Bitcoin" width={16} height={16} className="object-contain" />
          </div>
        </div>
      )
    default:
      return (
        <div className="p-2 bg-gray-100 rounded-full dark:bg-gray-800/50">
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
            className="text-gray-600 dark:text-gray-400"
          >
            <circle cx="12" cy="12" r="10" />
          </svg>
        </div>
      )
  }
}
