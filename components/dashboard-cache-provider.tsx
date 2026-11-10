"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import type { Post } from "@/lib/types"

interface ActiveFilters {
  count: number
  dateFilter: string
  rewardRange: [number, number]
  location: string
  searchQuery: string
  sortBy?: 'proximity' | 'recency' | 'reward'
  timestamp?: string
}

interface DashboardCache {
  posts: Post[]
  currentPage: number
  hasMore: boolean
  activeFilters: ActiveFilters | null
  lastFetched: number | null
  /** Auth user the feed was fetched for (null = signed out). It can contain
   *  group-only or assigned posts, so it's shown only to that same user. */
  ownerId?: string | null
}

interface DashboardCacheContextType {
  cache: DashboardCache
  setCachedPosts: (posts: Post[], page: number, hasMore: boolean, filters: ActiveFilters | null, ownerId: string | null) => void
  clearCache: () => void
  isCacheFresh: () => boolean
}

const DashboardCacheContext = createContext<DashboardCacheContextType | undefined>(undefined)

// Kept in localStorage (not sessionStorage, which iOS clears when the PWA is
// closed) so a cold launch can show the last feed instantly while it refreshes.
// Cleared on sign-out.
export const DASHBOARD_CACHE_KEY = "dashboard_cache_v2"
const CACHE_KEY = DASHBOARD_CACHE_KEY
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes: younger than this, Home skips the refetch

const defaultCache: DashboardCache = {
  posts: [],
  currentPage: 1,
  hasMore: true,
  activeFilters: null,
  lastFetched: null,
}

export function DashboardCacheProvider({ children }: { children: React.ReactNode }) {
  const [cache, setCache] = useState<DashboardCache>(defaultCache)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      sessionStorage.removeItem("dashboard_cache") // old location
      const stored = localStorage.getItem(CACHE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setCache(parsed)
      }
    } catch (error) {
      console.error("Error loading dashboard cache:", error)
    }
  }, [])

  // Save to localStorage whenever cache changes (not the empty initial state,
  // which would wipe the stored feed before it's read)
  useEffect(() => {
    if (cache === defaultCache) return
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
    } catch (error) {
      console.error("Error saving dashboard cache:", error)
    }
  }, [cache])

  const setCachedPosts = (posts: Post[], page: number, hasMore: boolean, filters: ActiveFilters | null, ownerId: string | null) => {
    setCache({
      posts,
      currentPage: page,
      hasMore,
      activeFilters: filters,
      lastFetched: Date.now(),
      ownerId,
    })
  }

  const clearCache = () => {
    setCache(defaultCache)
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch (error) {
      console.error("Error clearing dashboard cache:", error)
    }
  }

  const isCacheFresh = () => {
    if (!cache.lastFetched) return false
    return Date.now() - cache.lastFetched < CACHE_DURATION
  }

  return (
    <DashboardCacheContext.Provider value={{ cache, setCachedPosts, clearCache, isCacheFresh }}>
      {children}
    </DashboardCacheContext.Provider>
  )
}

export function useDashboardCache() {
  const context = useContext(DashboardCacheContext)
  if (context === undefined) {
    throw new Error("useDashboardCache must be used within DashboardCacheProvider")
  }
  return context
}

