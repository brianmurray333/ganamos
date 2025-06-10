"use client"

import { useEffect, useState } from "react"
import { getGlobalStatistics } from "@/app/actions/statistics-actions"

export function LandingHero() {
  const [stats, setStats] = useState({
    fixedIssuesCount: 0,
    totalSatsEarned: 0,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadStatistics() {
      try {
        setIsLoading(true)
        const statistics = await getGlobalStatistics()
        setStats(statistics)
      } catch (error) {
        console.error("Failed to load statistics:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadStatistics()
  }, [])

  // Format the numbers with commas
  const formatNumber = (num: number) => {
    return num.toLocaleString()
  }

  return (
    <div className="flex flex-col items-center text-center pt-16">
      <h1 className="app-title mb-4">Ganamos!</h1>
      <p className="mt-2 text-lg text-muted-foreground font-medium bg-white/50 dark:bg-gray-900/50 px-3 py-1 rounded-full flex items-center justify-center gap-1">
        Fix your community, <span className="mr-px">earn</span>
        <span className="flex items-center">
          <img
            src="/images/bitcoin-full-logo.png"
            alt="Bitcoin"
            className="h-4"
            style={{ marginTop: "1px", marginLeft: "-1px" }}
            onError={(e) => {
              console.error("Failed to load Bitcoin logo:", e)
              // Fallback to text
              e.currentTarget.outerHTML = '<span className="font-bold">BTC</span>'
            }}
          />
        </span>
      </p>

      <div className="grid grid-cols-2 gap-4 mt-12 w-full max-w-md px-4">
        <div className="flex flex-col items-center p-4 border rounded-lg bg-white/90 dark:bg-gray-900/90">
          <div className="p-3 mb-3 bg-emerald-100 rounded-full dark:bg-emerald-900/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-emerald-600 dark:text-emerald-400"
            >
              <path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9" />
              <path d="M17.64 15 22 10.64" />
              <path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" />
            </svg>
          </div>
          <h3 className="text-lg font-medium">
            {isLoading ? (
              <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            ) : (
              formatNumber(stats.fixedIssuesCount)
            )}
          </h3>
          <p className="mt-2 text-sm text-center text-muted-foreground">Issues Fixed</p>
        </div>

        <div className="flex flex-col items-center p-4 border rounded-lg bg-white/90 dark:bg-gray-900/90">
          <div className="p-3 mb-3 bg-amber-100 rounded-full dark:bg-amber-900/50">
            <div className="flex items-center justify-center">
              <img
                src="/images/bitcoin-logo.png"
                alt="Bitcoin"
                className="h-6 w-6"
                onError={(e) => {
                  console.error("Failed to load Bitcoin logo:", e)
                  e.currentTarget.outerHTML = '<span className="font-bold">₿</span>'
                }}
              />
            </div>
          </div>
          <h3 className="text-lg font-medium">
            {isLoading ? (
              <div className="h-7 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            ) : (
              formatNumber(stats.totalSatsEarned)
            )}
          </h3>
          <p className="mt-2 text-sm text-center text-muted-foreground">Sats Earned</p>
        </div>
      </div>
    </div>
  )
}
