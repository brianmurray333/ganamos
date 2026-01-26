/**
 * Simple in-memory rate limiter for device API endpoints
 * Tracks requests per deviceId to prevent abuse
 */

interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  maxRequests: number  // Max requests allowed
  windowMs: number     // Time window in milliseconds
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
  totalRequests: number
}

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier (e.g., deviceId)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const resetTime = now + config.windowMs

  let entry = rateLimitStore.get(identifier)

  // Create new entry if doesn't exist or window expired
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      resetTime,
    }
    rateLimitStore.set(identifier, entry)

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime,
      totalRequests: 1,
    }
  }

  // Increment counter
  entry.count++

  // Check if over limit
  if (entry.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      totalRequests: entry.count,
    }
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
    totalRequests: entry.count,
  }
}

/**
 * Preset rate limit configurations for different endpoint types
 */
export const RATE_LIMITS = {
  // Device config fetching - allow frequent polling (30s interval = 2/min normal)
  DEVICE_CONFIG: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 10 requests per minute
  },
  
  // Coin spending - stricter limit (feed/game actions)
  DEVICE_SPEND: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 20 requests per minute (generous for normal use)
  },
  
  // Economy sync - moderate limit
  DEVICE_SYNC: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 30 requests per minute
  },
  
  // Game scores - prevent spam submissions
  GAME_SCORE: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 10 games per minute max
  },
  
  // Wallet operations - strict limits for financial endpoints
  WALLET_WITHDRAW: {
    maxRequests: 3,
    windowMs: 60 * 1000, // 3 withdrawals per minute
  },
  WALLET_WITHDRAW_HOURLY: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 10 withdrawals per hour
  },
  WALLET_TRANSFER: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 10 transfers per minute
  },
  WALLET_TRANSFER_HOURLY: {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000, // 30 transfers per hour
  },
}
