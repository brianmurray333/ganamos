import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getLocationRecommendations } from '@/app/actions/location-actions'
import type { UserLocationData } from '@/types/location'

// @/lib/supabase mock provided by tests/setup.ts
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * SCHEMA MISMATCH WARNING:
 * 
 * The countIssuesByLocation function queries columns that DO NOT exist in the actual posts table:
 * - Queries: 'country', 'admin_area_1', 'locality'
 * - Actual posts table has: 'location', 'city', 'latitude', 'longitude', 'fixed'
 * 
 * These tests validate the INTENDED logic of the function. However, the function will fail
 * in production until one of the following is done:
 * 1. Migrate the database schema to add the missing location columns
 * 2. Refactor the function to use existing 'location' and 'city' columns
 * 
 * See: lib/database.types.ts for actual schema definition
 */

describe('countIssuesByLocation (Location Issue Aggregation)', () => {
  let mockSupabaseClient: any
  let mockFrom: any
  let mockSelect: any
  let mockEq: any
  let responseQueue: any[]
  let allEqCalls: any[] // Track all .eq() calls from both first and chained calls

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup response queue for sequential queries
    responseQueue = []
    allEqCalls = []

    // Create the eq function that will be used in both the initial and chained calls
    const createEqFunction = (queryBuilder: any) => {
      return vi.fn().mockImplementation((field: string, value: any) => {
        allEqCalls.push([field, value])
        // Return the same query builder to allow chaining
        return queryBuilder
      })
    }

    // Create a fresh query builder for each .from() call
    const createQueryBuilder = () => {
      const queryBuilder: any = {}
      queryBuilder.eq = createEqFunction(queryBuilder)
      
      // Make the query builder thenable so it can be awaited
      queryBuilder.then = (resolve: any, reject: any) => {
        const response = responseQueue.shift() || { count: 0, error: null }
        return Promise.resolve(response).then(resolve, reject)
      }
      
      return queryBuilder
    }

    mockSelect = vi.fn().mockImplementation(() => {
      return createQueryBuilder()
    })

    mockFrom = vi.fn().mockReturnValue({
      select: mockSelect,
    })

    mockSupabaseClient = {
      from: mockFrom,
    }

    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabaseClient)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Location Hierarchy Counting', () => {
    it('should count issues at all four hierarchy levels (global, country, state, city)', async () => {
      // Setup response queue: global, country, state, city
      responseQueue = [
        { count: 1000, error: null }, // Global count
        { count: 500, error: null },  // Country count
        { count: 250, error: null },  // State/admin_area_1 count
        { count: 100, error: null },  // City/locality count
      ]

      const userLocation: UserLocationData = {
        latitude: 37.7749,
        longitude: -122.4194,
        locality: 'San Francisco',
        admin_area_1: 'California',
        country: 'United States',
        country_code: 'US',
      }

      const result = await getLocationRecommendations(userLocation)

      // Verify we got all 4 hierarchy levels
      expect(result).toHaveLength(4)
      expect(result[0]).toMatchObject({ type: 'global', openIssues: 1000 })
      expect(result[1]).toMatchObject({ type: 'country', openIssues: 500 })
      expect(result[2]).toMatchObject({ type: 'admin_1', openIssues: 250 })
      expect(result[3]).toMatchObject({ type: 'locality', openIssues: 100 })

      // Verify query chain called 4 times (once per level)
      expect(mockFrom).toHaveBeenCalledTimes(4)
      expect(mockSelect).toHaveBeenCalledTimes(4)
      expect(allEqCalls).toHaveLength(7) // 4 for fixed=false, 3 for location filters (country, state, city; global has no additional filter)
    })

    it('should validate hierarchy invariant (city <= state <= country <= global)', async () => {
      responseQueue = [
        { count: 1000, error: null },
        { count: 800, error: null },
        { count: 500, error: null },
        { count: 200, error: null },
      ]

      const userLocation: UserLocationData = {
        latitude: 40.7128,
        longitude: -74.0060,
        locality: 'New York',
        admin_area_1: 'New York',
        country: 'United States',
        country_code: 'US',
      }

      const result = await getLocationRecommendations(userLocation)

      const globalCount = result[0].openIssues
      const countryCount = result[1].openIssues
      const stateCount = result[2].openIssues
      const cityCount = result[3].openIssues

      // Verify hierarchy invariant
      expect(cityCount).toBeLessThanOrEqual(stateCount)
      expect(stateCount).toBeLessThanOrEqual(countryCount)
      expect(countryCount).toBeLessThanOrEqual(globalCount)
    })

    it('should handle global-only request when no user location provided', async () => {
      responseQueue = [
        { count: 5000, error: null }, // Global count only
      ]

      const result = await getLocationRecommendations()

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: 'global',
        name: 'Global',
        emoji: '🌎',
        openIssues: 5000,
        locationType: 'global',
        locationName: 'Global',
      })

      // Only one query for global
      expect(mockFrom).toHaveBeenCalledTimes(1)
      expect(mockFrom).toHaveBeenCalledWith('posts')
    })

    it('should handle partial location data (country only)', async () => {
      responseQueue = [
        { count: 2000, error: null }, // Global
        { count: 800, error: null },  // Country
      ]

      const userLocation: UserLocationData = {
        latitude: 51.5074,
        longitude: -0.1278,
        country: 'United Kingdom',
        country_code: 'GB',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('global')
      expect(result[1].type).toBe('country')

      // Only 2 queries (no state or city)
      expect(mockFrom).toHaveBeenCalledTimes(2)
    })

    it('should handle partial location data (country and state, no city)', async () => {
      responseQueue = [
        { count: 3000, error: null }, // Global
        { count: 1200, error: null }, // Country
        { count: 600, error: null },  // State
      ]

      const userLocation: UserLocationData = {
        latitude: 34.0522,
        longitude: -118.2437,
        admin_area_1: 'California',
        country: 'United States',
        country_code: 'US',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(3)
      expect(result[0].type).toBe('global')
      expect(result[1].type).toBe('country')
      expect(result[2].type).toBe('admin_1')

      // 3 queries (no city)
      expect(mockFrom).toHaveBeenCalledTimes(3)
    })
  })

  describe('Query Parameter Validation', () => {
    it('should query posts table with correct parameters', async () => {
      responseQueue = [
        { count: 100, error: null },
      ]

      await getLocationRecommendations()

      expect(mockFrom).toHaveBeenCalledWith('posts')
      expect(mockSelect).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    })

    it('should filter by fixed=false for all queries', async () => {
      responseQueue = [
        { count: 500, error: null },
        { count: 200, error: null },
        { count: 100, error: null },
        { count: 50, error: null },
      ]

      const userLocation: UserLocationData = {
        latitude: 37.7749,
        longitude: -122.4194,
        locality: 'San Francisco',
        admin_area_1: 'California',
        country: 'United States',
        country_code: 'US',
      }

      await getLocationRecommendations(userLocation)

      // Verify fixed=false called 4 times (once per query)
      const fixedFalseCalls = allEqCalls.filter(
        (call) => call[0] === 'fixed' && call[1] === false
      )
      expect(fixedFalseCalls).toHaveLength(4)
    })

    it('should apply correct location filter for country level', async () => {
      responseQueue = [
        { count: 1000, error: null }, // Global
        { count: 400, error: null },  // Country
      ]

      const userLocation: UserLocationData = {
        latitude: 48.8566,
        longitude: 2.3522,
        country: 'France',
        country_code: 'FR',
      }

      await getLocationRecommendations(userLocation)

      // Check that country filter was applied
      const countryFilterCalls = allEqCalls.filter(
        (call) => call[0] === 'country' && call[1] === 'France'
      )
      expect(countryFilterCalls).toHaveLength(1)
    })

    it('should apply correct location filter for admin_area_1 level', async () => {
      responseQueue = [
        { count: 1000, error: null }, // Global
        { count: 500, error: null },  // Country
        { count: 200, error: null },  // State
      ]

      const userLocation: UserLocationData = {
        latitude: 41.8781,
        longitude: -87.6298,
        admin_area_1: 'Illinois',
        country: 'United States',
        country_code: 'US',
      }

      await getLocationRecommendations(userLocation)

      // Check that admin_area_1 filter was applied
      const stateFilterCalls = allEqCalls.filter(
        (call) => call[0] === 'admin_area_1' && call[1] === 'Illinois'
      )
      expect(stateFilterCalls).toHaveLength(1)
    })

    it('should apply correct location filter for locality level', async () => {
      responseQueue = [
        { count: 1000, error: null }, // Global
        { count: 500, error: null },  // Country
        { count: 300, error: null },  // State
        { count: 150, error: null },  // City
      ]

      const userLocation: UserLocationData = {
        latitude: 42.3601,
        longitude: -71.0589,
        locality: 'Boston',
        admin_area_1: 'Massachusetts',
        country: 'United States',
        country_code: 'US',
      }

      await getLocationRecommendations(userLocation)

      // Check that locality filter was applied
      const cityFilterCalls = allEqCalls.filter(
        (call) => call[0] === 'locality' && call[1] === 'Boston'
      )
      expect(cityFilterCalls).toHaveLength(1)
    })

    it('should not apply location filter for global query', async () => {
      responseQueue = [
        { count: 5000, error: null },
      ]

      await getLocationRecommendations()

      // Global query should only have fixed=false filter
      expect(allEqCalls).toHaveLength(1)
      expect(allEqCalls.some((call) => call[0] === 'fixed' && call[1] === false)).toBe(true)
    })
  })

  describe('Issue Type Filtering (fixed=false)', () => {
    it('should only count open issues (fixed=false), not resolved ones', async () => {
      responseQueue = [
        { count: 250, error: null },
      ]

      await getLocationRecommendations()

      // Verify fixed=false is used to filter out resolved issues
      expect(allEqCalls.some((call) => call[0] === 'fixed' && call[1] === false)).toBe(true)
    })

    it('should return correct count when all issues are open', async () => {
      responseQueue = [
        { count: 1000, error: null },
        { count: 1000, error: null },
        { count: 1000, error: null },
        { count: 1000, error: null },
      ]

      const userLocation: UserLocationData = {
        latitude: 37.7749,
        longitude: -122.4194,
        locality: 'San Francisco',
        admin_area_1: 'California',
        country: 'United States',
        country_code: 'US',
      }

      const result = await getLocationRecommendations(userLocation)

      // All levels should show same count if no fixed issues
      expect(result[0].openIssues).toBe(1000)
      expect(result[1].openIssues).toBe(1000)
      expect(result[2].openIssues).toBe(1000)
      expect(result[3].openIssues).toBe(1000)
    })
  })

  describe('Error Handling', () => {
    it('should return 0 count when database query fails', async () => {
      responseQueue = [
        { count: null, error: { message: 'Database connection failed' } },
      ]

      const result = await getLocationRecommendations()

      expect(result).toHaveLength(1)
      expect(result[0].openIssues).toBe(0) // Should gracefully fallback to 0
    })

    it('should handle null count response gracefully', async () => {
      responseQueue = [
        { count: null, error: null },
      ]

      const result = await getLocationRecommendations()

      expect(result[0].openIssues).toBe(0)
    })

    it('should continue processing other levels if one level fails', async () => {
      responseQueue = [
        { count: 1000, error: null }, // Global succeeds
        { count: null, error: { message: 'Query timeout' } }, // Country fails
        { count: 300, error: null },  // State succeeds
        { count: 100, error: null },  // City succeeds
      ]

      const userLocation: UserLocationData = {
        latitude: 37.7749,
        longitude: -122.4194,
        locality: 'San Francisco',
        admin_area_1: 'California',
        country: 'United States',
        country_code: 'US',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(4)
      expect(result[0].openIssues).toBe(1000) // Global succeeded
      expect(result[1].openIssues).toBe(0)    // Country failed → 0
      expect(result[2].openIssues).toBe(300)  // State succeeded
      expect(result[3].openIssues).toBe(100)  // City succeeded
    })

    it('should return global fallback on complete failure', async () => {
      // Simulate Supabase client creation failure
      vi.mocked(createServerSupabaseClient).mockImplementation(() => {
        throw new Error('Failed to create Supabase client')
      })

      const result = await getLocationRecommendations()

      // Should return safe fallback
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        name: 'Global',
        type: 'global',
        openIssues: 0,
        locationType: 'global',
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero issues at all levels', async () => {
      responseQueue = [
        { count: 0, error: null },
        { count: 0, error: null },
        { count: 0, error: null },
        { count: 0, error: null },
      ]

      const userLocation: UserLocationData = {
        latitude: 37.7749,
        longitude: -122.4194,
        locality: 'San Francisco',
        admin_area_1: 'California',
        country: 'United States',
        country_code: 'US',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result.every((level) => level.openIssues === 0)).toBe(true)
    })

    it('should handle location with special characters', async () => {
      responseQueue = [
        { count: 100, error: null },
        { count: 50, error: null },
        { count: 25, error: null },
        { count: 10, error: null },
      ]

      const userLocation: UserLocationData = {
        latitude: 48.8566,
        longitude: 2.3522,
        locality: "L'Haÿ-les-Roses",
        admin_area_1: 'Île-de-France',
        country: 'France',
        country_code: 'FR',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(4)
      // Verify special characters are passed correctly to query
      expect(allEqCalls.some((call) => call[0] === 'locality' && call[1] === "L'Haÿ-les-Roses")).toBe(true)
      expect(allEqCalls.some((call) => call[0] === 'admin_area_1' && call[1] === 'Île-de-France')).toBe(true)
    })

    it('should handle empty string location values', async () => {
      responseQueue = [
        { count: 100, error: null }, // Global
        { count: 0, error: null },   // Country (empty string)
      ]

      const userLocation: UserLocationData = {
        latitude: 0,
        longitude: 0,
        country: '',
        country_code: '',
      }

      const result = await getLocationRecommendations(userLocation)

      // Should still create hierarchy level even with empty string
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle very long location names', async () => {
      const longLocationName = 'A'.repeat(500)

      responseQueue = [
        { count: 100, error: null },
        { count: 50, error: null },
      ]

      const userLocation: UserLocationData = {
        latitude: 0,
        longitude: 0,
        country: longLocationName,
        country_code: 'XX',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(2)
      expect(allEqCalls.some((call) => call[0] === 'country' && call[1] === longLocationName)).toBe(true)
    })

    it('should handle undefined vs null location fields', async () => {
      responseQueue = [
        { count: 200, error: null }, // Global only
      ]

      const userLocation: UserLocationData = {
        latitude: 37.7749,
        longitude: -122.4194,
        country: undefined as any,
        country_code: undefined as any,
      }

      const result = await getLocationRecommendations(userLocation)

      // Should only return global when location fields are undefined
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('global')
    })
  })

  describe('Aggregation Accuracy', () => {
    it('should return exact counts from database query', async () => {
      const expectedCounts = [12345, 6789, 3456, 1234]
      responseQueue = expectedCounts.map((count) => ({ count, error: null }))

      const userLocation: UserLocationData = {
        latitude: 37.7749,
        longitude: -122.4194,
        locality: 'San Francisco',
        admin_area_1: 'California',
        country: 'United States',
        country_code: 'US',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result[0].openIssues).toBe(12345)
      expect(result[1].openIssues).toBe(6789)
      expect(result[2].openIssues).toBe(3456)
      expect(result[3].openIssues).toBe(1234)
    })

    it('should not modify or round count values', async () => {
      responseQueue = [
        { count: 999999, error: null },
      ]

      const result = await getLocationRecommendations()

      expect(result[0].openIssues).toBe(999999)
      expect(typeof result[0].openIssues).toBe('number')
    })
  })

  describe('Response Format Validation', () => {
    it('should return LocationHierarchy array with correct structure', async () => {
      responseQueue = [
        { count: 500, error: null },
        { count: 200, error: null },
      ]

      const userLocation: UserLocationData = {
        latitude: 37.7749,
        longitude: -122.4194,
        country: 'United States',
        country_code: 'US',
      }

      const result = await getLocationRecommendations(userLocation)

      // Verify structure of each hierarchy level
      result.forEach((level) => {
        expect(level).toHaveProperty('name')
        expect(level).toHaveProperty('type')
        expect(level).toHaveProperty('emoji')
        expect(level).toHaveProperty('openIssues')
        expect(level).toHaveProperty('locationType')
        expect(level).toHaveProperty('locationName')

        expect(typeof level.name).toBe('string')
        expect(typeof level.type).toBe('string')
        expect(typeof level.emoji).toBe('string')
        expect(typeof level.openIssues).toBe('number')
        expect(typeof level.locationType).toBe('string')
        expect(typeof level.locationName).toBe('string')
      })
    })

    it('should include appropriate emoji for each location type', async () => {
      responseQueue = [
        { count: 1000, error: null },
        { count: 500, error: null },
        { count: 250, error: null },
        { count: 100, error: null },
      ]

      const userLocation: UserLocationData = {
        latitude: 37.7749,
        longitude: -122.4194,
        locality: 'San Francisco',
        admin_area_1: 'California',
        country: 'United States',
        country_code: 'US',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result[0].emoji).toBe('🌎') // Global
      expect(result[3].emoji).toBe('🏙️') // City
      // Country and admin emojis are dynamic based on country_code
    })

    it('should populate locationName field correctly', async () => {
      responseQueue = [
        { count: 1000, error: null },
        { count: 500, error: null },
        { count: 250, error: null },
        { count: 100, error: null },
      ]

      const userLocation: UserLocationData = {
        latitude: 37.7749,
        longitude: -122.4194,
        locality: 'San Francisco',
        admin_area_1: 'California',
        country: 'United States',
        country_code: 'US',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result[0].locationName).toBe('Global')
      expect(result[1].locationName).toBe('United States')
      expect(result[2].locationName).toContain('California')
      expect(result[3].locationName).toContain('San Francisco')
    })
  })

  describe('Service Role Key Usage', () => {
    it('should use service role key for database queries', async () => {
      responseQueue = [
        { count: 100, error: null },
      ]

      await getLocationRecommendations()

      expect(createServerSupabaseClient).toHaveBeenCalledWith({
        supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
      })
    })
  })
})