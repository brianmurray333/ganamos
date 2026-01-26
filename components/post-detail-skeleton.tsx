import { Skeleton } from "@/components/ui/skeleton"

export default function PostDetailSkeleton() {
  return (
    <div className="container px-4 pt-4 pb-20 mx-auto max-w-md">
      {/* Image skeleton with close button overlay */}
      <div className="relative w-full h-64 mb-4 overflow-hidden rounded-lg">
        <div className="w-full h-full animate-pulse rounded-md bg-muted" />
        <button className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white border-0 p-2 rounded-full">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          <span className="sr-only">Close</span>
        </button>
      </div>
      {/* Title skeleton */}
      <div className="h-7 w-2/3 animate-pulse rounded bg-muted mb-2" />
      {/* Location, time, and reward row skeleton */}
      <div className="flex items-center mb-2" style={{ minHeight: 48 }}>
        {/* Location icon */}
        <div className="h-4 w-4 animate-pulse rounded-full bg-muted mr-2" />
        {/* Location text */}
        <div className="h-4 w-24 animate-pulse rounded bg-muted mr-3" />
        {/* Time icon */}
        <div className="h-4 w-4 animate-pulse rounded-full bg-muted mr-2" />
        {/* Time text */}
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        {/* Spacer */}
        <div className="flex-1" />
        {/* Reward icon and badge (right-aligned) */}
        <div style={{ position: "relative", width: 48, height: 48, display: 'flex', alignItems: 'center' }}>
          <div className="bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" style={{ width: 43, height: 43, position: 'absolute', top: 0, left: 2 }}></div>
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
      {/* Creator info skeleton */}
      <div className="h-4 w-32 animate-pulse rounded bg-muted mb-4" />
      {/* Submit Fix button skeleton */}
      <div className="h-12 w-full animate-pulse rounded bg-muted mb-6" />
    </div>
  )
} 