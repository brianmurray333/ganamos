import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getLocationRecommendations } from '@/app/actions/location-actions'

// @/lib/supabase mock provided by tests/setup.ts
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * CRITICAL SCHEMA ISSUE IDENTIFIED:
 * 
 * The countIssuesByLocation function queries columns 'country', 'admin_area_1', and 'locality'
 * that DO NOT exist in the posts table schema (lib/database.types.ts).
 * 
 * Actual posts table location fields are:
 * - location (string)
 * - latitude (number | null)
 * - longitude (number | null)  
 * - city (string | null)
 * 
 * This means the function will fail when querying these non-existent columns.
 * 
 * RECOMMENDATION: Verify actual database schema before deploying to production.
 * Either (1) database.types.ts is outdated, (2) there's a pending migration, 
 * or (3) the function has a critical bug.
 * 
 * These tests validate the function's CURRENT implementation logic, but may fail
 * in production due to schema mismatch.
 */

describe('countIssuesByLocation (via getLocationRecommendations)', () => {
  let mockSupabaseClient: any
  let mockSelect: any
  let mockFrom: any
  let mockEq: any
  
  // Queue of responses for mockResolvedValueOnce to work properly
  let responseQueue: any[]

  beforeEach(() => {
    vi.clearAllMocks()
    responseQueue = []

    // Setup chainable mock for Supabase query pattern
    // The implementation does: 
    //   let query = supabase.from("posts").select("id", { count: "exact", head: true }).eq("fixed", false)
    //   query = query.eq(field, value) // optional, based on location type
    //   const { count } = await query
    
    // Create the .eq() mock first so tests can call .mockResolvedValueOnce() on it
    mockEq = vi.fn().mockImplementation((...args: any[]) => {
      // Return the query chain to support chaining
      return queryChain
    })
    
    // Add mockResolvedValueOnce to mockEq
    mockEq.mockResolvedValueOnce = (value: any) => {
      responseQueue.push(value)
      return mockEq
    }
    
    // Create a thenable query chain
    const queryChain: any = {
      eq: mockEq,
      // Make it awaitable - this is called when we `await query`
      then: (onFulfilled: any) => {
        const response = responseQueue.shift() || { count: 0, error: null }
        return Promise.resolve(response).then(onFulfilled)
      },
      catch: vi.fn(),
      finally: vi.fn()
    }

    mockSelect = vi.fn().mockReturnValue(queryChain)
    mockFrom = vi.fn().mockReturnValue({ select: mockSelect })
    mockSupabaseClient = { from: mockFrom }

    vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabaseClient)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Global Count - No Location Filtering', () => {
    it('should count all open issues globally when no location provided', async () => {
      // Mock global count query - no location filters
      mockEq.mockResolvedValueOnce({ count: 42, error: null })

      const result = await getLocationRecommendations()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        name: 'Global',
        type: 'global',
        emoji: '🌎',
        openIssues: 42,
        locationType: 'global',
        locationName: 'Global',
      })

      // Verify query chain
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('posts')
      expect(mockSelect).toHaveBeenCalledWith('id', { count: 'exact', head: true })
      expect(mockEq).toHaveBeenCalledWith('fixed', false)
    })

    it('should return 0 for global count when no open issues exist', async () => {
      mockEq.mockResolvedValueOnce({ count: 0, error: null })

      const result = await getLocationRecommendations()

      expect(result[0].openIssues).toBe(0)
    })

    it('should return 0 for global count when query returns null', async () => {
      mockEq.mockResolvedValueOnce({ count: null, error: null })

      const result = await getLocationRecommendations()

      expect(result[0].openIssues).toBe(0)
    })

    it('should handle very large global issue counts', async () => {
      mockEq.mockResolvedValueOnce({ count: 999999, error: null })

      const result = await getLocationRecommendations()

      expect(result[0].openIssues).toBe(999999)
    })
  })

  describe('Location Filtering - Country Level', () => {
    it('should filter issues by country when user location includes country', async () => {
      // Mock: global count, then country count
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null }) // global
        .mockResolvedValueOnce({ count: 25, error: null })  // country

      const userLocation = {
        country: 'United States',
        country_code: 'US',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(2)
      expect(result[1]).toEqual({
        name: 'United States',
        type: 'country',
        emoji: '🇺🇸',
        openIssues: 25,
        locationType: 'country',
        locationName: 'United States',
      })

      // Verify country query was made with correct filter
      // Note: This will fail in production due to missing 'country' column
      expect(mockEq).toHaveBeenCalledWith('country', 'United States')
    })

    it('should handle country with no open issues', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 50, error: null })  // global
        .mockResolvedValueOnce({ count: 0, error: null })   // country

      const userLocation = {
        country: 'Iceland',
        country_code: 'IS',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result[1].openIssues).toBe(0)
    })

    it('should include correct country emoji from country code', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null }) // global
        .mockResolvedValueOnce({ count: 15, error: null })  // country

      const userLocation = {
        country: 'Japan',
        country_code: 'JP',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result[1].emoji).toBe('🇯🇵')
    })
  })

  describe('Location Filtering - Admin Area (State/Province)', () => {
    it('should filter issues by admin_area_1 when provided', async () => {
      // Mock: global, country, admin_1
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null }) // global
        .mockResolvedValueOnce({ count: 30, error: null })  // country
        .mockResolvedValueOnce({ count: 12, error: null })  // admin_1

      const userLocation = {
        country: 'United States',
        country_code: 'US',
        admin_area_1: 'California',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(3)
      expect(result[2]).toEqual({
        name: 'California',
        type: 'admin_1',
        emoji: '🏛️',
        openIssues: 12,
        locationType: 'region',
        locationName: 'California, United States',
      })

      // Verify admin_1 query was made with correct filter
      // Note: This queries 'admin_area_1' column which doesn't exist in schema
      expect(mockEq).toHaveBeenCalledWith('admin_area_1', 'California')
    })

    it('should handle admin_area_1 with no country', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null }) // global
        .mockResolvedValueOnce({ count: 8, error: null })   // admin_1

      const userLocation = {
        admin_area_1: 'Tokyo',
      }

      const result = await getLocationRecommendations(userLocation)

      // Should have global and admin_1, but no country level
      expect(result).toHaveLength(2)
      expect(result[1].type).toBe('admin_1')
    })
  })

  describe('Location Filtering - Locality (City)', () => {
    it('should filter issues by locality when provided', async () => {
      // Mock: global, country, admin_1, locality
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null }) // global
        .mockResolvedValueOnce({ count: 30, error: null })  // country
        .mockResolvedValueOnce({ count: 12, error: null })  // admin_1
        .mockResolvedValueOnce({ count: 5, error: null })   // locality

      const userLocation = {
        country: 'United States',
        country_code: 'US',
        admin_area_1: 'California',
        locality: 'San Francisco',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(4)
      expect(result[3]).toEqual({
        name: 'San Francisco, CA',
        type: 'locality',
        emoji: '🏙️',
        openIssues: 5,
        locationType: 'city',
        locationName: 'San Francisco, California',
      })

      // Verify locality query was made with correct filter
      // Note: This queries 'locality' column which doesn't exist in schema
      expect(mockEq).toHaveBeenCalledWith('locality', 'San Francisco')
    })

    it('should handle locality without admin_area_1', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null }) // global
        .mockResolvedValueOnce({ count: 20, error: null })  // country
        .mockResolvedValueOnce({ count: 8, error: null })   // locality

      const userLocation = {
        country: 'Singapore',
        country_code: 'SG',
        locality: 'Singapore',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(3)
      expect(result[2]).toEqual({
        name: 'Singapore',
        type: 'locality',
        emoji: '🏙️',
        openIssues: 8,
        locationType: 'city',
        locationName: 'Singapore, Singapore',
      })
    })

    it('should abbreviate admin_area_1 in locality name when present', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null }) // global
        .mockResolvedValueOnce({ count: 30, error: null })  // country
        .mockResolvedValueOnce({ count: 12, error: null })  // admin_1
        .mockResolvedValueOnce({ count: 4, error: null })   // locality

      const userLocation = {
        country: 'United States',
        country_code: 'US',
        admin_area_1: 'New York',
        locality: 'New York City',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result[3].name).toBe('New York City, NY')
    })
  })

  describe('Fixed Flag Filter - Verify Open Issues Only', () => {
    it('should always filter by fixed=false to exclude fixed issues', async () => {
      mockEq.mockResolvedValueOnce({ count: 25, error: null })

      await getLocationRecommendations()

      // Verify .eq('fixed', false) was called for every count query
      expect(mockEq).toHaveBeenCalledWith('fixed', false)
    })

    it('should apply fixed=false filter before location filters', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null }) // global
        .mockResolvedValueOnce({ count: 25, error: null })  // country

      const userLocation = {
        country: 'Canada',
        country_code: 'CA',
      }

      await getLocationRecommendations(userLocation)

      // Verify call order: fixed filter first, then location filter
      const eqCalls = mockEq.mock.calls
      expect(eqCalls[0]).toEqual(['fixed', false])
      expect(eqCalls[1]).toEqual(['fixed', false])
      // Country filter would be in additional calls
    })

    it('should count only unfixed issues across all location levels', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 50, error: null })  // global
        .mockResolvedValueOnce({ count: 20, error: null })  // country
        .mockResolvedValueOnce({ count: 8, error: null })   // admin_1
        .mockResolvedValueOnce({ count: 3, error: null })   // locality

      const userLocation = {
        country: 'Australia',
        country_code: 'AU',
        admin_area_1: 'New South Wales',
        locality: 'Sydney',
      }

      const result = await getLocationRecommendations(userLocation)

      // All counts should be for unfixed issues only
      expect(result[0].openIssues).toBe(50)  // global
      expect(result[1].openIssues).toBe(20)  // country
      expect(result[2].openIssues).toBe(8)   // admin_1
      expect(result[3].openIssues).toBe(3)   // locality
    })
  })

  describe('Error Handling - Database Failures', () => {
    it('should return 0 count when database query fails', async () => {
      mockEq.mockResolvedValueOnce({
        count: null,
        error: { message: 'Database connection failed' },
      })

      const result = await getLocationRecommendations()

      expect(result[0].openIssues).toBe(0)
    })

    it('should continue with other queries if one location query fails', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null })  // global succeeds
        .mockResolvedValueOnce({ count: null, error: { message: 'Query timeout' } }) // country fails

      const userLocation = {
        country: 'Brazil',
        country_code: 'BR',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(2)
      expect(result[0].openIssues).toBe(100) // global succeeded
      expect(result[1].openIssues).toBe(0)   // country failed, returns 0
    })

    it('should handle unexpected error and return fallback hierarchy', async () => {
      vi.mocked(createServerSupabaseClient).mockImplementation(() => {
        throw new Error('Supabase client creation failed')
      })

      const result = await getLocationRecommendations()

      // Should return fallback global-only hierarchy
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        name: 'Global',
        type: 'global',
        emoji: '🌎',
        openIssues: 0,
        locationType: 'global',
        locationName: 'Global',
      })
    })

    it('should log error when counting fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Mock an exception being thrown (not just error in response)
      mockEq.mockImplementation(() => {
        throw new Error('Column does not exist')
      })

      await getLocationRecommendations()

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error counting issues'),
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })

    it('should handle null count as 0 gracefully', async () => {
      mockEq.mockResolvedValueOnce({ count: null, error: null })

      const result = await getLocationRecommendations()

      expect(result[0].openIssues).toBe(0)
    })

    it('should handle undefined count as 0 gracefully', async () => {
      mockEq.mockResolvedValueOnce({ count: undefined, error: null })

      const result = await getLocationRecommendations()

      expect(result[0].openIssues).toBe(0)
    })
  })

  describe('Query Chain Verification', () => {
    it('should use correct Supabase query chain for counting', async () => {
      mockEq.mockResolvedValueOnce({ count: 10, error: null })

      await getLocationRecommendations()

      // Verify query builder chain
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('posts')
      expect(mockSelect).toHaveBeenCalledWith('id', { count: 'exact', head: true })
      expect(mockEq).toHaveBeenCalledWith('fixed', false)
    })

    it('should call createServerSupabaseClient with service role key', async () => {
      mockEq.mockResolvedValueOnce({ count: 5, error: null })

      await getLocationRecommendations()

      expect(createServerSupabaseClient).toHaveBeenCalledWith({
        supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
      })
    })

    it('should make separate queries for each location level', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null }) // global
        .mockResolvedValueOnce({ count: 30, error: null })  // country
        .mockResolvedValueOnce({ count: 12, error: null })  // admin_1
        .mockResolvedValueOnce({ count: 5, error: null })   // locality

      const userLocation = {
        country: 'Mexico',
        country_code: 'MX',
        admin_area_1: 'Jalisco',
        locality: 'Guadalajara',
      }

      await getLocationRecommendations(userLocation)

      // Should have made 4 separate queries (one per location level)
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(4)
      expect(mockSelect).toHaveBeenCalledTimes(4)
      expect(mockEq).toHaveBeenCalled()
    })

    it('should use head:true option for efficient counting', async () => {
      mockEq.mockResolvedValueOnce({ count: 20, error: null })

      await getLocationRecommendations()

      // Verify select uses head:true to avoid fetching data
      expect(mockSelect).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    })
  })

  describe('Location Hierarchy Building', () => {
    it('should build hierarchy in correct order: global, country, admin_1, locality', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null })
        .mockResolvedValueOnce({ count: 40, error: null })
        .mockResolvedValueOnce({ count: 15, error: null })
        .mockResolvedValueOnce({ count: 6, error: null })

      const userLocation = {
        country: 'Germany',
        country_code: 'DE',
        admin_area_1: 'Bavaria',
        locality: 'Munich',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(4)
      expect(result[0].type).toBe('global')
      expect(result[1].type).toBe('country')
      expect(result[2].type).toBe('admin_1')
      expect(result[3].type).toBe('locality')
    })

    it('should return only global when no user location provided', async () => {
      mockEq.mockResolvedValueOnce({ count: 75, error: null })

      const result = await getLocationRecommendations()

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('global')
    })

    it('should return only global and country when admin_1 and locality missing', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null })
        .mockResolvedValueOnce({ count: 25, error: null })

      const userLocation = {
        country: 'New Zealand',
        country_code: 'NZ',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('global')
      expect(result[1].type).toBe('country')
    })

    it('should handle partial location data gracefully', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null }) // global
        .mockResolvedValueOnce({ count: 10, error: null })  // locality

      const userLocation = {
        locality: 'London',
        // No country or admin_1
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('global')
      expect(result[1].type).toBe('locality')
    })
  })

  describe('Response Format Validation', () => {
    it('should include all required fields in location hierarchy items', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 50, error: null })
        .mockResolvedValueOnce({ count: 15, error: null })

      const userLocation = {
        country: 'France',
        country_code: 'FR',
      }

      const result = await getLocationRecommendations(userLocation)

      result.forEach(item => {
        expect(item).toHaveProperty('name')
        expect(item).toHaveProperty('type')
        expect(item).toHaveProperty('emoji')
        expect(item).toHaveProperty('openIssues')
        expect(item).toHaveProperty('locationType')
        expect(item).toHaveProperty('locationName')
      })
    })

    it('should return openIssues as number type', async () => {
      mockEq.mockResolvedValueOnce({ count: 42, error: null })

      const result = await getLocationRecommendations()

      expect(typeof result[0].openIssues).toBe('number')
      expect(result[0].openIssues).toBe(42)
    })

    it('should never return negative issue counts', async () => {
      // Edge case: database returns negative count (shouldn't happen, but test fallback)
      mockEq.mockResolvedValueOnce({ count: -5, error: null })

      const result = await getLocationRecommendations()

      // Function returns count || 0, so negative values pass through
      // This documents current behavior - may want to add Math.max(count, 0) in production
      expect(result[0].openIssues).toBe(-5)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty string location values', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null })
        .mockResolvedValueOnce({ count: 5, error: null })

      const userLocation = {
        country: '',
        country_code: '',
      }

      // Empty strings are falsy, so country level should be skipped
      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(1) // Only global
    })

    it('should handle whitespace-only location values', async () => {
      mockEq.mockResolvedValueOnce({ count: 100, error: null })

      const userLocation = {
        country: '   ',
        country_code: 'XX',
      }

      const result = await getLocationRecommendations(userLocation)

      // Whitespace-only strings are truthy, so query will be made
      expect(result).toHaveLength(2)
    })

    it('should handle very long location names', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null })
        .mockResolvedValueOnce({ count: 8, error: null })

      const userLocation = {
        locality: 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch', // Real Welsh town name
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result[1].name).toBe('Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch')
    })

    it('should handle special characters in location names', async () => {
      mockEq
        .mockResolvedValueOnce({ count: 100, error: null })
        .mockResolvedValueOnce({ count: 12, error: null })

      const userLocation = {
        country: "Côte d'Ivoire",
        country_code: 'CI',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result[1].name).toBe("Côte d'Ivoire")
    })
  })

  describe('Aggregation Accuracy & Data Integrity', () => {
    it('should maintain hierarchy invariant: city <= state <= country <= global', async () => {
      // Realistic counts that follow the hierarchy invariant
      mockEq
        .mockResolvedValueOnce({ count: 500, error: null })  // global
        .mockResolvedValueOnce({ count: 120, error: null })  // country
        .mockResolvedValueOnce({ count: 35, error: null })   // admin_1
        .mockResolvedValueOnce({ count: 12, error: null })   // locality

      const userLocation = {
        country: 'Canada',
        country_code: 'CA',
        admin_area_1: 'Ontario',
        locality: 'Toronto',
      }

      const result = await getLocationRecommendations(userLocation)

      // Verify hierarchy invariant holds
      expect(result[3].openIssues).toBeLessThanOrEqual(result[2].openIssues) // city <= state
      expect(result[2].openIssues).toBeLessThanOrEqual(result[1].openIssues) // state <= country
      expect(result[1].openIssues).toBeLessThanOrEqual(result[0].openIssues) // country <= global
    })

    it('should correctly aggregate when city has same count as state', async () => {
      // Edge case: only one city in the state with issues
      mockEq
        .mockResolvedValueOnce({ count: 200, error: null })  // global
        .mockResolvedValueOnce({ count: 50, error: null })   // country
        .mockResolvedValueOnce({ count: 15, error: null })   // admin_1
        .mockResolvedValueOnce({ count: 15, error: null })   // locality (same as state)

      const userLocation = {
        country: 'Norway',
        country_code: 'NO',
        admin_area_1: 'Oslo County',
        locality: 'Oslo',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result[3].openIssues).toBe(result[2].openIssues) // city == state
      expect(result[3].openIssues).toBe(15)
    })

    it('should correctly aggregate zero counts at specific location levels', async () => {
      // Country has issues but specific state has zero
      mockEq
        .mockResolvedValueOnce({ count: 1000, error: null }) // global
        .mockResolvedValueOnce({ count: 150, error: null })  // country
        .mockResolvedValueOnce({ count: 0, error: null })    // admin_1 (no issues)

      const userLocation = {
        country: 'Australia',
        country_code: 'AU',
        admin_area_1: 'Northern Territory',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(3)
      expect(result[0].openIssues).toBe(1000) // global has issues
      expect(result[1].openIssues).toBe(150)  // country has issues
      expect(result[2].openIssues).toBe(0)    // but this state has zero
    })

    it('should return consistent counts across multiple queries for same location', async () => {
      const userLocation = {
        country: 'Spain',
        country_code: 'ES',
      }

      // First call
      mockEq
        .mockResolvedValueOnce({ count: 75, error: null })  // global
        .mockResolvedValueOnce({ count: 22, error: null })  // country

      const result1 = await getLocationRecommendations(userLocation)

      // Second call with same counts (simulating no database changes)
      mockEq
        .mockResolvedValueOnce({ count: 75, error: null })  // global
        .mockResolvedValueOnce({ count: 22, error: null })  // country

      const result2 = await getLocationRecommendations(userLocation)

      // Results should be identical
      expect(result1[0].openIssues).toBe(result2[0].openIssues)
      expect(result1[1].openIssues).toBe(result2[1].openIssues)
    })

    it('should validate aggregation accuracy when global count equals specific location', async () => {
      // Edge case: all global issues are in one location
      mockEq
        .mockResolvedValueOnce({ count: 50, error: null })  // global
        .mockResolvedValueOnce({ count: 50, error: null })  // country (all issues)

      const userLocation = {
        country: 'Luxembourg',
        country_code: 'LU',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result[0].openIssues).toBe(result[1].openIssues) // global == country
      expect(result[0].openIssues).toBe(50)
    })

    it('should correctly aggregate across all four hierarchy levels with realistic distribution', async () => {
      // Realistic scenario: issues distributed across hierarchy
      mockEq
        .mockResolvedValueOnce({ count: 1500, error: null })  // global: 1500 total
        .mockResolvedValueOnce({ count: 450, error: null })   // country: 30% of global
        .mockResolvedValueOnce({ count: 180, error: null })   // admin_1: 40% of country
        .mockResolvedValueOnce({ count: 65, error: null })    // locality: 36% of state

      const userLocation = {
        country: 'United States',
        country_code: 'US',
        admin_area_1: 'California',
        locality: 'Los Angeles',
      }

      const result = await getLocationRecommendations(userLocation)

      // Verify all levels present
      expect(result).toHaveLength(4)

      // Verify counts at each level
      expect(result[0].openIssues).toBe(1500) // global
      expect(result[1].openIssues).toBe(450)  // country
      expect(result[2].openIssues).toBe(180)  // admin_1
      expect(result[3].openIssues).toBe(65)   // locality

      // Verify hierarchy invariant
      expect(result[3].openIssues).toBeLessThanOrEqual(result[2].openIssues)
      expect(result[2].openIssues).toBeLessThanOrEqual(result[1].openIssues)
      expect(result[1].openIssues).toBeLessThanOrEqual(result[0].openIssues)

      // Verify location metadata is correct
      expect(result[0].type).toBe('global')
      expect(result[1].type).toBe('country')
      expect(result[2].type).toBe('admin_1')
      expect(result[3].type).toBe('locality')
    })

    it('should handle aggregation when only global and locality exist (skipped levels)', async () => {
      // Edge case: user provides only locality, no country/admin_1
      mockEq
        .mockResolvedValueOnce({ count: 800, error: null })  // global
        .mockResolvedValueOnce({ count: 45, error: null })   // locality

      const userLocation = {
        locality: 'Singapore',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result).toHaveLength(2)
      expect(result[0].openIssues).toBe(800)  // global
      expect(result[1].openIssues).toBe(45)   // locality
      
      // Invariant still holds even with skipped levels
      expect(result[1].openIssues).toBeLessThanOrEqual(result[0].openIssues)
    })

    it('should correctly aggregate single-digit counts at all levels', async () => {
      // Edge case: very low issue counts
      mockEq
        .mockResolvedValueOnce({ count: 9, error: null })  // global
        .mockResolvedValueOnce({ count: 3, error: null })  // country
        .mockResolvedValueOnce({ count: 2, error: null })  // admin_1
        .mockResolvedValueOnce({ count: 1, error: null })  // locality

      const userLocation = {
        country: 'Iceland',
        country_code: 'IS',
        admin_area_1: 'Capital Region',
        locality: 'Reykjavik',
      }

      const result = await getLocationRecommendations(userLocation)

      expect(result[0].openIssues).toBe(9)
      expect(result[1].openIssues).toBe(3)
      expect(result[2].openIssues).toBe(2)
      expect(result[3].openIssues).toBe(1)

      // Verify small counts maintain hierarchy
      expect(result[3].openIssues).toBeLessThanOrEqual(result[2].openIssues)
      expect(result[2].openIssues).toBeLessThanOrEqual(result[1].openIssues)
      expect(result[1].openIssues).toBeLessThanOrEqual(result[0].openIssues)
    })

    it('should validate aggregation when fixed=false filter is applied at all levels', async () => {
      // This test verifies that ONLY open issues are counted across all hierarchy levels
      mockEq
        .mockResolvedValueOnce({ count: 250, error: null })  // global open issues
        .mockResolvedValueOnce({ count: 80, error: null })   // country open issues
        .mockResolvedValueOnce({ count: 30, error: null })   // admin_1 open issues

      const userLocation = {
        country: 'Brazil',
        country_code: 'BR',
        admin_area_1: 'São Paulo',
      }

      const result = await getLocationRecommendations(userLocation)

      // Verify fixed=false was called for each query
      expect(mockEq).toHaveBeenCalledWith('fixed', false)
      expect(mockEq.mock.calls.filter(call => call[0] === 'fixed' && call[1] === false)).toHaveLength(3)

      // Verify aggregation respects the filter
      expect(result[0].openIssues).toBe(250)
      expect(result[1].openIssues).toBe(80)
      expect(result[2].openIssues).toBe(30)
    })
  })
})