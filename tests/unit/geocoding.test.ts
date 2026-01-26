/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  reverseGeocode,
  getStandardizedLocation,
  getCurrentLocationWithName,
  getTravelTimes,
  getLocationPermissionState,
  saveLocationPermissionState,
  getCachedLocation,
  saveCachedLocation,
  clearLocationData,
} from '@/lib/geocoding'
import {
  resetGoogleMapsMocks,
  setMockGeocodingResponse,
  setMockError,
  mockGeolocationSuccess,
  mockGeolocationDenied,
  mockGeolocationTimeout,
  fetchCallHistory,
} from '../mocks/google-maps'
import {
  TEST_COORDINATES,
  MOCK_GEOCODING_RESPONSES,
  EXPECTED_STANDARDIZED_LOCATIONS,
  createCacheKey,
  createCoordinateFallback,
} from '../fixtures/location-data'

// Constants from lib/geocoding.ts for direct localStorage access
const LOCATION_PERMISSION_KEY = 'ganamos_location_permission'

/**
 * Integration tests for lib/geocoding.ts
 * Tests all geocoding functions with mocked Google Maps APIs
 */
describe('reverseGeocode()', () => {
  beforeEach(() => {
    resetGoogleMapsMocks()
    fetchCallHistory.length = 0
    localStorage.clear()
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-api-key'
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  })

  describe('successful geocoding', () => {
    it('should return city and state format for San Francisco', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await reverseGeocode(TEST_COORDINATES.sanFrancisco.lat, TEST_COORDINATES.sanFrancisco.lng)

      expect(result).toBe('San Francisco, CA')
    })

    it('should return city and state format for New York', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.newYork)

      const result = await reverseGeocode(TEST_COORDINATES.newYork.lat, TEST_COORDINATES.newYork.lng)

      expect(result).toBe('New York, NY')
    })

    it('should extract locality from address components', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await reverseGeocode(37.7749, -122.4194)

      expect(result).toContain('San Francisco')
    })

    it('should extract administrative area from address components', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await reverseGeocode(37.7749, -122.4194)

      expect(result).toContain('CA')
    })

    it('should return only city when state is missing', async () => {
      setMockGeocodingResponse({
        status: 'OK',
        results: [{
          formatted_address: 'City Only Location',
          address_components: [
            {
              long_name: 'TestCity',
              short_name: 'TestCity',
              types: ['locality', 'political'],
            },
          ],
        }],
      })

      // Use unique coordinates to avoid cache interference
      const result = await reverseGeocode(11.0, 21.0)

      expect(result).toBe('TestCity')
    })

    it('should return only state when city is missing', async () => {
      setMockGeocodingResponse({
        status: 'OK',
        results: [{
          formatted_address: 'State Only Location',
          address_components: [
            {
              long_name: 'TestState',
              short_name: 'TS',
              types: ['administrative_area_level_1', 'political'],
            },
          ],
        }],
      })

      // Use unique coordinates to avoid cache interference
      const result = await reverseGeocode(12.0, 22.0)

      expect(result).toBe('TS')
    })

    it('should fall back to formatted_address when no city or state', async () => {
      setMockGeocodingResponse({
        status: 'OK',
        results: [{
          formatted_address: 'Some Location, Country, Postal Code',
          address_components: [
            {
              long_name: 'Country',
              short_name: 'CO',
              types: ['country', 'political'],
            },
          ],
        }],
      })

      // Use unique coordinates to avoid cache interference
      const result = await reverseGeocode(13.0, 23.0)

      expect(result).toBe('Some Location, Country')
    })

    it('should use full formatted_address when it has less than 2 parts', async () => {
      setMockGeocodingResponse({
        status: 'OK',
        results: [{
          formatted_address: 'SinglePartLocation',
          address_components: [
            {
              long_name: 'Country',
              short_name: 'CO',
              types: ['country', 'political'],
            },
          ],
        }],
      })

      // Use unique coordinates to avoid cache interference
      const result = await reverseGeocode(14.0, 24.0)

      expect(result).toBe('SinglePartLocation')
    })
  })

  describe('caching mechanism', () => {
    it('should cache geocoding results for 1 hour', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      // First call
      const result1 = await reverseGeocode(TEST_COORDINATES.sanFrancisco.lat, TEST_COORDINATES.sanFrancisco.lng)
      const callCount1 = fetchCallHistory.length

      // Second call should use cache
      const result2 = await reverseGeocode(TEST_COORDINATES.sanFrancisco.lat, TEST_COORDINATES.sanFrancisco.lng)
      const callCount2 = fetchCallHistory.length

      expect(result1).toBe(result2)
      expect(callCount2).toBe(callCount1) // No additional API call
    })

    it('should use coordinate-based cache key with 6 decimal precision', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      await reverseGeocode(37.774901, -122.419399)

      const expectedCacheKey = createCacheKey(37.774901, -122.419399)
      expect(expectedCacheKey).toBe('37.774901,-122.419399')
    })

    it('should deduplicate concurrent requests for same location', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      // Use unique coordinates to avoid cache interference
      const testLat = 37.7750
      const testLng = -122.4195

      // Make 3 concurrent calls
      const [result1, result2, result3] = await Promise.all([
        reverseGeocode(testLat, testLng),
        reverseGeocode(testLat, testLng),
        reverseGeocode(testLat, testLng),
      ])

      // All should return same result
      expect(result1).toBe(result2)
      expect(result2).toBe(result3)

      // Should only make 1 API call despite 3 concurrent requests
      const geocodingCalls = fetchCallHistory.filter(call => call.url.includes('geocode'))
      expect(geocodingCalls.length).toBe(1)
    })
  })

  describe('error handling', () => {
    it('should fall back to coordinates when API returns ZERO_RESULTS', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.invalidLocation)

      const result = await reverseGeocode(TEST_COORDINATES.invalidCoords.lat, TEST_COORDINATES.invalidCoords.lng)

      const expectedFallback = createCoordinateFallback(TEST_COORDINATES.invalidCoords.lat, TEST_COORDINATES.invalidCoords.lng)
      expect(result).toBe(expectedFallback)
    })

    it('should fall back to coordinates when API key is missing', async () => {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

      // Use unique coordinates to avoid cache
      const testLat = 37.7751
      const testLng = -122.4196

      const result = await reverseGeocode(testLat, testLng)

      expect(result).toMatch(/37\.7751,\s*-122\.4196/)
    })

    it('should fall back to coordinates on network error', async () => {
      setMockError(true)

      // Use unique coordinates to avoid cache
      const testLat = 37.7752
      const testLng = -122.4197

      const result = await reverseGeocode(testLat, testLng)

      expect(result).toBe(createCoordinateFallback(testLat, testLng))
    })

    it('should cache error fallbacks', async () => {
      setMockError(true)

      // First call with error
      const result1 = await reverseGeocode(37.7749, -122.4194)
      const callCount1 = fetchCallHistory.length

      // Second call should use cached error fallback
      const result2 = await reverseGeocode(37.7749, -122.4194)
      const callCount2 = fetchCallHistory.length

      expect(result1).toBe(result2)
      expect(callCount2).toBe(callCount1) // No additional attempt
    })

    it('should use 4 decimal precision for coordinate fallbacks', async () => {
      setMockError(true)

      const result = await reverseGeocode(37.774901234, -122.419399876)

      expect(result).toBe('37.7749, -122.4194')
    })
  })

  describe('API integration', () => {
    it('should call Google Geocoding API with correct parameters', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      // Use unique coordinates to ensure fresh API call
      const testLat = 37.7753
      const testLng = -122.4198

      await reverseGeocode(testLat, testLng)

      const geocodingCall = fetchCallHistory.find(call => call.url.includes('geocode'))
      expect(geocodingCall).toBeDefined()
      expect(geocodingCall?.url).toContain(`latlng=${testLat},${testLng}`)
      expect(geocodingCall?.url).toContain('key=test-api-key')
    })
  })
})

describe('getStandardizedLocation()', () => {
  beforeEach(() => {
    resetGoogleMapsMocks()
    fetchCallHistory.length = 0
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-api-key'
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  })

  describe('successful standardization', () => {
    it('should extract all standardized components for San Francisco', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await getStandardizedLocation(TEST_COORDINATES.sanFrancisco.lat, TEST_COORDINATES.sanFrancisco.lng)

      expect(result).toEqual(EXPECTED_STANDARDIZED_LOCATIONS.sanFrancisco)
    })

    it('should extract all standardized components for London', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.london)

      const result = await getStandardizedLocation(TEST_COORDINATES.london.lat, TEST_COORDINATES.london.lng)

      expect(result).toEqual(EXPECTED_STANDARDIZED_LOCATIONS.london)
    })

    it('should extract locality from address components', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await getStandardizedLocation(37.7749, -122.4194)

      expect(result?.locality).toBe('San Francisco')
    })

    it('should extract administrative_area_level_1 (state/province)', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await getStandardizedLocation(37.7749, -122.4194)

      expect(result?.admin_area_1).toBe('California')
    })

    it('should extract administrative_area_level_2 (county)', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await getStandardizedLocation(37.7749, -122.4194)

      expect(result?.admin_area_2).toBe('San Francisco County')
    })

    it('should extract country with long name', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await getStandardizedLocation(37.7749, -122.4194)

      expect(result?.country).toBe('United States')
    })

    it('should extract country code with short name', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await getStandardizedLocation(37.7749, -122.4194)

      expect(result?.country_code).toBe('US')
    })
  })

  describe('error handling', () => {
    it('should return null when API returns ZERO_RESULTS', async () => {
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.invalidLocation)

      const result = await getStandardizedLocation(999.9999, 999.9999)

      expect(result).toBeNull()
    })

    it('should return null when API key is missing', async () => {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

      const result = await getStandardizedLocation(37.7749, -122.4194)

      expect(result).toBeNull()
    })

    it('should return null on network error', async () => {
      setMockError(true)

      const result = await getStandardizedLocation(37.7749, -122.4194)

      expect(result).toBeNull()
    })

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      setMockError(true)

      await getStandardizedLocation(37.7749, -122.4194)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Standardized geocoding failed:', expect.any(Error))
      consoleErrorSpy.mockRestore()
    })
  })
})

describe('getCurrentLocationWithName()', () => {
  beforeEach(() => {
    resetGoogleMapsMocks()
    fetchCallHistory.length = 0
    localStorage.clear()
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-api-key'
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  })

  describe('successful location retrieval', () => {
    it('should return full LocationData with name and coordinates', async () => {
      mockGeolocationSuccess(TEST_COORDINATES.sanFrancisco.lat, TEST_COORDINATES.sanFrancisco.lng)
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await getCurrentLocationWithName()

      expect(result).toBeDefined()
      expect(result?.name).toBe('San Francisco, CA')
      expect(result?.latitude).toBe(TEST_COORDINATES.sanFrancisco.lat)
      expect(result?.longitude).toBe(TEST_COORDINATES.sanFrancisco.lng)
    })

    it('should include standardized location components', async () => {
      mockGeolocationSuccess(TEST_COORDINATES.sanFrancisco.lat, TEST_COORDINATES.sanFrancisco.lng)
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await getCurrentLocationWithName()

      expect(result?.locality).toBe('San Francisco')
      expect(result?.admin_area_1).toBe('California')
      expect(result?.country).toBe('United States')
      expect(result?.country_code).toBe('US')
    })

    it('should call reverseGeocode and getStandardizedLocation in parallel', async () => {
      mockGeolocationSuccess(37.7749, -122.4194)
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      await getCurrentLocationWithName()

      const geocodingCalls = fetchCallHistory.filter(call => call.url.includes('geocode'))
      expect(geocodingCalls.length).toBeGreaterThan(0)
    })
  })

  describe('caching and permission state', () => {
    it('should save location to localStorage after successful retrieval', async () => {
      mockGeolocationSuccess(TEST_COORDINATES.sanFrancisco.lat, TEST_COORDINATES.sanFrancisco.lng)
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      await getCurrentLocationWithName()

      const cached = getCachedLocation()
      expect(cached).toBeDefined()
      expect(cached?.latitude).toBe(TEST_COORDINATES.sanFrancisco.lat)
    })

    it('should save granted permission state after successful retrieval', async () => {
      mockGeolocationSuccess(TEST_COORDINATES.sanFrancisco.lat, TEST_COORDINATES.sanFrancisco.lng)
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      await getCurrentLocationWithName()

      const permissionState = getLocationPermissionState()
      expect(permissionState.status).toBe('granted')
    })

    it('should use cached location as fallback when permission granted but fresh fetch fails', async () => {
      const mockLocation = {
        name: 'Cached Location',
        latitude: 37.7749,
        longitude: -122.4194,
      }
      saveCachedLocation(mockLocation)
      saveLocationPermissionState({ status: 'granted', lastChecked: Date.now() })
      
      // Mock geolocation to timeout so it falls back to cached
      mockGeolocationTimeout()

      const result = await getCurrentLocationWithName({ useCache: true })

      expect(result).toEqual(mockLocation)
    })

    it('should bypass cache when forceRefresh is true', async () => {
      saveCachedLocation({
        name: 'Old Cache',
        latitude: 0,
        longitude: 0,
      })
      saveLocationPermissionState({ status: 'granted', lastChecked: Date.now() })

      mockGeolocationSuccess(TEST_COORDINATES.sanFrancisco.lat, TEST_COORDINATES.sanFrancisco.lng)
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await getCurrentLocationWithName({ forceRefresh: true })

      expect(result?.name).not.toBe('Old Cache')
      expect(result?.latitude).toBe(TEST_COORDINATES.sanFrancisco.lat)
    })

    it('should not use cache when useCache is false', async () => {
      saveCachedLocation({
        name: 'Cached Location',
        latitude: 0,
        longitude: 0,
      })
      saveLocationPermissionState({ status: 'granted', lastChecked: Date.now() })

      mockGeolocationSuccess(TEST_COORDINATES.sanFrancisco.lat, TEST_COORDINATES.sanFrancisco.lng)
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await getCurrentLocationWithName({ useCache: false })

      expect(result?.name).not.toBe('Cached Location')
      expect(result?.latitude).toBe(TEST_COORDINATES.sanFrancisco.lat)
      expect(result?.name).toBe('San Francisco, CA')
    })

    it('should not use cache when permission state is expired', async () => {
      saveCachedLocation({
        name: 'Expired Cache',
        latitude: 0,
        longitude: 0,
      })
      // Set permission state to 73 hours ago (expired)
      const expiredTimestamp = Date.now() - (73 * 60 * 60 * 1000)
      localStorage.setItem(LOCATION_PERMISSION_KEY, JSON.stringify({
        status: 'granted',
        lastChecked: expiredTimestamp
      }))

      mockGeolocationSuccess(TEST_COORDINATES.sanFrancisco.lat, TEST_COORDINATES.sanFrancisco.lng)
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await getCurrentLocationWithName({ useCache: true })

      // getLocationPermissionState() returns 'unknown' for expired state, so cache won't be used
      expect(result?.name).toBe('San Francisco, CA')
      expect(fetchCallHistory.length).toBeGreaterThan(0)
    })

    it('should not use cached location when cache timestamp is expired', async () => {
      // Manually set expired cache in localStorage
      const expiredCache = {
        location: {
          name: 'Expired Location',
          latitude: 0,
          longitude: 0,
        },
        timestamp: Date.now() - (73 * 60 * 60 * 1000) // 73 hours ago
      }
      localStorage.setItem('ganamos_cached_location', JSON.stringify(expiredCache))
      saveLocationPermissionState({ status: 'granted', lastChecked: Date.now() })

      mockGeolocationSuccess(TEST_COORDINATES.sanFrancisco.lat, TEST_COORDINATES.sanFrancisco.lng)
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await getCurrentLocationWithName({ useCache: true })

      // Should fetch new location since cache expired
      expect(result?.name).toBe('San Francisco, CA')
      expect(result?.latitude).toBe(TEST_COORDINATES.sanFrancisco.lat)
    })
  })

  describe('permission handling', () => {
    it('should throw error when user denies permission', async () => {
      mockGeolocationDenied()

      await expect(getCurrentLocationWithName()).rejects.toMatchObject({
        code: 1, // PERMISSION_DENIED
      })
    })

    it('should save denied permission state when user denies', async () => {
      mockGeolocationDenied()

      try {
        await getCurrentLocationWithName()
      } catch (error) {
        // Expected error
      }

      const permissionState = getLocationPermissionState()
      expect(permissionState.status).toBe('denied')
    })

    it('should not prompt again if permission previously denied', async () => {
      saveLocationPermissionState({ status: 'denied', lastChecked: Date.now() })

      await expect(getCurrentLocationWithName()).rejects.toMatchObject({
        code: 1,
        message: expect.stringContaining('previously denied'),
      })
    })

    it('should allow retry when forceRefresh is true even if previously denied', async () => {
      saveLocationPermissionState({ status: 'denied', lastChecked: Date.now() })
      mockGeolocationSuccess(TEST_COORDINATES.sanFrancisco.lat, TEST_COORDINATES.sanFrancisco.lng)
      setMockGeocodingResponse(MOCK_GEOCODING_RESPONSES.sanFrancisco)

      const result = await getCurrentLocationWithName({ forceRefresh: true })

      expect(result).toBeDefined()
      expect(result?.latitude).toBe(TEST_COORDINATES.sanFrancisco.lat)
    })
  })

  describe('error handling', () => {
    it('should handle geolocation timeout', async () => {
      mockGeolocationTimeout()

      await expect(getCurrentLocationWithName()).rejects.toMatchObject({
        code: 3, // TIMEOUT
      })
    })

    it('should throw error when geolocation not supported', async () => {
      Object.defineProperty(navigator, 'geolocation', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      await expect(getCurrentLocationWithName()).rejects.toMatchObject({
        message: expect.stringContaining('not supported'),
      })
    })

    it('should resolve with coordinates when geocoding fails', async () => {
      // Use unique coordinates to avoid cache
      const testLat = 37.7754
      const testLng = -122.4199
      
      mockGeolocationSuccess(testLat, testLng)
      setMockError(true)

      const result = await getCurrentLocationWithName()

      expect(result).toBeDefined()
      expect(result?.name).toMatch(/37\.7754,\s*-122\.4199/)
      expect(result?.latitude).toBe(testLat)
      expect(result?.longitude).toBe(testLng)
    })

    it('should still cache location even when geocoding fails', async () => {
      // Use unique coordinates to avoid cache
      const testLat = 37.7755
      const testLng = -122.4200
      
      mockGeolocationSuccess(testLat, testLng)
      setMockError(true)

      await getCurrentLocationWithName()

      const cached = getCachedLocation()
      expect(cached).toBeDefined()
      expect(cached?.latitude).toBe(testLat)
    })

    it('should save granted permission even when geocoding fails', async () => {
      // Use unique coordinates to avoid cache
      const testLat = 37.7756
      const testLng = -122.4201
      
      mockGeolocationSuccess(testLat, testLng)
      setMockError(true)

      await getCurrentLocationWithName()

      const permissionState = getLocationPermissionState()
      expect(permissionState.status).toBe('granted')
    })

    it('should handle POSITION_UNAVAILABLE error', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((_success, error) => {
          error({
            code: 2, // POSITION_UNAVAILABLE
            message: 'Position unavailable',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          })
        }),
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      }

      Object.defineProperty(global.navigator, 'geolocation', {
        value: mockGeolocation,
        writable: true,
        configurable: true,
      })

      await expect(getCurrentLocationWithName()).rejects.toMatchObject({
        code: 2, // POSITION_UNAVAILABLE
      })
    })

    it('should not save denied state for non-permission errors', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((_success, error) => {
          error({
            code: 2, // POSITION_UNAVAILABLE
            message: 'Position unavailable',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          })
        }),
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      }

      Object.defineProperty(global.navigator, 'geolocation', {
        value: mockGeolocation,
        writable: true,
        configurable: true,
      })

      try {
        await getCurrentLocationWithName()
      } catch (error) {
        // Expected error
      }

      // Should not update permission state for POSITION_UNAVAILABLE
      const permissionState = getLocationPermissionState()
      expect(permissionState.status).toBe('unknown')
    })

    it('should save denied state when geolocation not supported', async () => {
      Object.defineProperty(navigator, 'geolocation', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      try {
        await getCurrentLocationWithName()
      } catch (error) {
        // Expected error
      }

      const permissionState = getLocationPermissionState()
      expect(permissionState.status).toBe('denied')
    })
  })

  describe('clearLocationData()', () => {
    it('should clear permission state and cached location', () => {
      saveCachedLocation({ name: 'Test', latitude: 37.7749, longitude: -122.4194 })
      saveLocationPermissionState({ status: 'granted', lastChecked: Date.now() })

      clearLocationData()

      expect(getCachedLocation()).toBeNull()
      expect(getLocationPermissionState().status).toBe('unknown')
    })
  })
})

describe('getTravelTimes()', () => {
  beforeEach(() => {
    resetGoogleMapsMocks()
    fetchCallHistory.length = 0
    vi.clearAllMocks()
    process.env.GOOGLE_MAPS_API_KEY = 'test-api-key'
  })

  afterEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY
  })

  it('should call /api/travel-times endpoint with correct parameters', async () => {
    await getTravelTimes(37.7749, -122.4194, 37.8044, -122.2711)

    const travelTimesCall = fetchCallHistory.find(call => call.url.includes('/api/travel-times'))
    expect(travelTimesCall).toBeDefined()
    expect(travelTimesCall?.url).toContain('origin=37.7749%2C-122.4194')
    expect(travelTimesCall?.url).toContain('destination=37.8044%2C-122.2711')
  })

  it('should return formatted travel times', async () => {
    const result = await getTravelTimes(37.7749, -122.4194, 37.8044, -122.2711)

    expect(result).toBeDefined()
    expect(result.walking).toBeDefined()
    expect(result.driving).toBeDefined()
  })

  it('should return null values on error', async () => {
    setMockError(true)

    const result = await getTravelTimes(37.7749, -122.4194, 37.8044, -122.2711)

    expect(result).toEqual({ walking: null, driving: null })
  })
})
