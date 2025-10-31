import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatDistanceToNow } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSatsValue(sats: number): string {
  if (sats >= 1000000) {
    const millions = sats / 1000000
    return millions % 1 === 0 ? `${millions}M sats` : `${millions.toFixed(1)}M sats`
  } else if (sats >= 100000) {
    // For 100k and above, round down to nearest thousand (no decimal)
    const thousands = Math.floor(sats / 1000)
    return `${thousands}k sats`
  } else if (sats >= 1000) {
    const thousands = sats / 1000
    return thousands % 1 === 0 ? `${thousands}k sats` : `${thousands.toFixed(1)}k sats`
  } else {
    return `${sats} sats`
  }
}

export function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diffSeconds < 60) {
    return "1 min ago"
  }
  const formatted = formatDistanceToNow(date, { addSuffix: true })
  return formatted
    .replace(/about /g, "") // Remove "about"
    .replace(/ hours?/g, " hrs") // Replace "hour" or "hours" with "hrs"
    .replace(/ minutes?/g, " mins") // Replace "minute" or "minutes" with "mins"
}
