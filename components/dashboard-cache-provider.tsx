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
}

interface DashboardCacheContextType {
  cache: DashboardCache
  setCachedPosts: (posts: Post[], page: number, hasMore: boolean, filters: ActiveFilters | null) => void
  clearCache: () => void
  isCacheFresh: () => boolean
}

const DashboardCacheContext = createContext<DashboardCacheContextType | undefined>(undefined)

const CACHE_KEY = "dashboard_cache"
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

const defaultCache: DashboardCache = {
  posts: [],
  currentPage: 1,
  hasMore: true,
  activeFilters: null,
  lastFetched: null,
}

export function DashboardCacheProvider({ children }: { children: React.ReactNode }) {
  const [cache, setCache] = useState<DashboardCache>(defaultCache)

  // Load from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(CACHE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setCache(parsed)
      }
    } catch (error) {
      console.error("Error loading dashboard cache:", error)
    }
  }, [])

  // Save to sessionStorage whenever cache changes
  useEffect(() => {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache))
    } catch (error) {
      console.error("Error saving dashboard cache:", error)
    }
  }, [cache])

  const setCachedPosts = (posts: Post[], page: number, hasMore: boolean, filters: ActiveFilters | null) => {
    setCache({
      posts,
      currentPage: page,
      hasMore,
      activeFilters: filters,
      lastFetched: Date.now(),
    })
  }

  const clearCache = () => {
    setCache(defaultCache)
    try {
      sessionStorage.removeItem(CACHE_KEY)
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

