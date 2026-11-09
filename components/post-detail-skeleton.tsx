/**
 * Placeholder for the post detail page (mobile layout). Mirrors the real page
 * so nothing shifts when it loads: photo with share/close buttons, title,
 * status line with the reward coin on the right, the 160px map card, and the
 * primary action button.
 */
export default function PostDetailSkeleton() {
  const block = "animate-pulse bg-muted"
  return (
    <div className="container px-4 pt-4 pb-6 mx-auto max-w-md" aria-busy="true" aria-label="Loading post">
      {/* Photo (h-64) with share + close buttons */}
      <div className={`relative w-full h-64 mb-4 overflow-hidden rounded-lg ${block}`}>
        <div className="absolute top-2 right-2 flex gap-2">
          <div className="h-10 w-10 rounded-md bg-black/20" />
          <div className="h-10 w-10 rounded-md bg-black/20" />
        </div>
      </div>

      {/* Title + status line, reward coin on the right */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 pt-1">
          <div className={`h-6 w-3/4 rounded-md mb-3 ${block}`} />
          <div className={`h-4 w-56 max-w-full rounded-md ${block}`} />
        </div>
        <div className="relative h-12 w-12 flex-shrink-0">
          <div className={`h-12 w-12 rounded-full ${block}`} />
          <div className={`absolute -bottom-3 left-1/2 h-6 w-10 -translate-x-1/2 rounded-full ${block}`} />
        </div>
      </div>

      {/* Map card (StaticMapWidget, 160px) */}
      <div className={`w-full h-40 mb-4 rounded-lg ${block}`} />

      {/* Primary action */}
      <div className={`w-full h-12 mt-6 rounded-md ${block}`} />
    </div>
  )
}
