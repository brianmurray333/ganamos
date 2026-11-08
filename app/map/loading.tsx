import { MapPageSkeleton } from "@/components/map-placeholder"

// Shown instantly on navigation to /map while the route loads: the map's own
// chrome over a neutral canvas (no spinner, no text), not a blank screen.
export default function Loading() {
  return <MapPageSkeleton />
}
