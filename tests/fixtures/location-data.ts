import { StandardizedLocation } from '@/lib/geocoding'

/**
 * Test fixtures and utilities for location-based tests
 */

/**
 * Test coordinate sets for common locations
 */
export const TEST_COORDINATES = {
  sanFrancisco: {
    lat: 37.7749,
    lng: -122.4194,
  },
  newYork: {
    lat: 40.7128,
    lng: -74.0060,
  },
  london: {
    lat: 51.5074,
    lng: -0.1278,
  },
  invalidCoords: {
    lat: 999.9999,
    lng: 999.9999,
  },
}

/**
 * Mock geocoding responses from Google Maps API
 */
export const MOCK_GEOCODING_RESPONSES = {
  sanFrancisco: {
    status: 'OK',
    results: [
      {
        formatted_address: 'San Francisco, CA, USA',
        address_components: [
          {
            long_name: 'San Francisco',
            short_name: 'SF',
            types: ['locality', 'political'],
          },
          {
            long_name: 'San Francisco County',
            short_name: 'San Francisco County',
            types: ['administrative_area_level_2', 'political'],
          },
          {
            long_name: 'California',
            short_name: 'CA',
            types: ['administrative_area_level_1', 'political'],
          },
          {
            long_name: 'United States',
            short_name: 'US',
            types: ['country', 'political'],
          },
        ],
      },
    ],
  },
  newYork: {
    status: 'OK',
    results: [
      {
        formatted_address: 'New York, NY, USA',
        address_components: [
          {
            long_name: 'New York',
            short_name: 'New York',
            types: ['locality', 'political'],
          },
          {
            long_name: 'New York County',
            short_name: 'New York County',
            types: ['administrative_area_level_2', 'political'],
          },
          {
            long_name: 'New York',
            short_name: 'NY',
            types: ['administrative_area_level_1', 'political'],
          },
          {
            long_name: 'United States',
            short_name: 'US',
            types: ['country', 'political'],
          },
        ],
      },
    ],
  },
  london: {
    status: 'OK',
    results: [
      {
        formatted_address: 'London, UK',
        address_components: [
          {
            long_name: 'London',
            short_name: 'London',
            types: ['locality', 'political'],
          },
          {
            long_name: 'Greater London',
            short_name: 'Greater London',
            types: ['administrative_area_level_2', 'political'],
          },
          {
            long_name: 'England',
            short_name: 'England',
            types: ['administrative_area_level_1', 'political'],
          },
          {
            long_name: 'United Kingdom',
            short_name: 'GB',
            types: ['country', 'political'],
          },
        ],
      },
    ],
  },
  invalidLocation: {
    status: 'ZERO_RESULTS',
    results: [],
  },
}

/**
 * Expected standardized location results for test assertions
 */
export const EXPECTED_STANDARDIZED_LOCATIONS: Record<string, StandardizedLocation> = {
  sanFrancisco: {
    locality: 'San Francisco',
    admin_area_1: 'California',
    admin_area_2: 'San Francisco County',
    country: 'United States',
    country_code: 'US',
  },
  london: {
    locality: 'London',
    admin_area_1: 'England',
    admin_area_2: 'Greater London',
    country: 'United Kingdom',
    country_code: 'GB',
  },
}

/**
 * Helper: Create cache key from coordinates (matches implementation)
 */
export function createCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`
}

/**
 * Helper: Create coordinate fallback string (matches implementation)
 */
export function createCoordinateFallback(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}
