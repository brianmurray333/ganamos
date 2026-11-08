/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/google-maps-loader', () => ({ loadGoogleMaps: vi.fn().mockResolvedValue(undefined) }))

const ORIGIN = { lat: 37.7596, lng: -122.4269 }

// ~ offset in degrees for a given number of meters north
const metersNorth = (m: number) => m / 111_320

function place(name: string, metersAway: number, types: string[] = ['park', 'point_of_interest']) {
  const lat = ORIGIN.lat + metersNorth(metersAway)
  return { name, types, geometry: { location: { lat: () => lat, lng: () => ORIGIN.lng } } }
}

function installPlaces(results: any[], status = 'OK') {
  const nearbySearch = vi.fn((_req: any, cb: any) => cb(results, status))
  ;(window as any).google = {
    maps: {
      places: {
        PlacesService: vi.fn(() => ({ nearbySearch })),
        PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
      },
    },
  }
  return nearbySearch
}

/** Geocoding API fake: city-level lookups vs street-level (result_type=...) lookups. */
function installGeocode({ street }: { street?: { number?: string; route: string } }) {
  global.fetch = vi.fn(async (url: any) => {
    const u = String(url)
    if (u.includes('result_type=')) {
      if (!street) return { ok: true, json: async () => ({ status: 'ZERO_RESULTS', results: [] }) } as any
      const comps = [
        ...(street.number ? [{ types: ['street_number'], short_name: street.number }] : []),
        { types: ['route'], short_name: street.route },
      ]
      return { ok: true, json: async () => ({ status: 'OK', results: [{ address_components: comps }] }) } as any
    }
    return {
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            address_components: [
              { types: ['locality'], long_name: 'San Francisco', short_name: 'SF' },
              { types: ['administrative_area_level_1'], long_name: 'California', short_name: 'CA' },
            ],
          },
        ],
      }),
    } as any
  }) as any
}

describe('getPlaceLabel', () => {
  beforeEach(() => {
    vi.resetModules() // fresh reverseGeocode cache per test
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key'
  })
  afterEach(() => {
    delete (window as any).google
  })

  it('uses the nearest named place, with the city for context', async () => {
    installPlaces([place('Mission Dolores Park', 40), place('Dolores Park Cafe', 15, ['cafe', 'establishment'])])
    installGeocode({ street: { number: '566', route: 'Dolores St' } })
    const { getPlaceLabel } = await import('@/lib/geocoding')
    expect(await getPlaceLabel(ORIGIN.lat, ORIGIN.lng)).toBe('Dolores Park Cafe, San Francisco, CA')
  })

  it('ignores area-type results (city, neighborhood) and places beyond the radius', async () => {
    installPlaces([
      place('San Francisco', 0, ['locality', 'political']),
      place('Mission District', 5, ['neighborhood', 'political']),
      place('Far Away Museum', 400, ['museum', 'point_of_interest']),
    ])
    installGeocode({ street: { number: '566', route: 'Dolores St' } })
    const { getPlaceLabel } = await import('@/lib/geocoding')
    expect(await getPlaceLabel(ORIGIN.lat, ORIGIN.lng)).toBe('566 Dolores St, San Francisco, CA')
  })

  it('falls back to the city label when there is no place or street', async () => {
    installPlaces([], 'ZERO_RESULTS')
    installGeocode({})
    const { getPlaceLabel } = await import('@/lib/geocoding')
    expect(await getPlaceLabel(ORIGIN.lat, ORIGIN.lng)).toBe('San Francisco, CA')
  })

  it('still works when Maps Places is unavailable', async () => {
    installGeocode({ street: { route: 'Valencia St' } })
    const { getPlaceLabel } = await import('@/lib/geocoding')
    expect(await getPlaceLabel(ORIGIN.lat, ORIGIN.lng)).toBe('Valencia St, San Francisco, CA')
  })
})
