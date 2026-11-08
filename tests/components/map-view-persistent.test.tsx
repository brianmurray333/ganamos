/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

/**
 * MapView on the full-screen /map page:
 * - while Google Maps / tiles load it shows a neutral canvas (no spinner, no
 *   "Loading" text) with the real chrome (search bar) already visible;
 * - the google.maps.Map instance is kept for the session, so switching back
 *   to the Map tab re-attaches it instead of constructing a new map, and it is
 *   visible on the first frame.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/components/auth-provider', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/components/donation-modal', () => ({ DonationModal: () => null }))
vi.mock('@/lib/geocoding', () => ({ getCurrentLocationWithName: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/lib/google-maps-loader', () => ({ loadGoogleMaps: vi.fn(() => Promise.resolve()) }))

import { createBrowserSupabaseClient } from '@/lib/supabase'
import { MapView, __resetPersistentMapForTests } from '@/components/map-view'

type Listener = { ev: string; fn: (...a: any[]) => void; once: boolean }

function installFakeGoogleMaps() {
  const created: any[] = []
  class FakeMap {
    listeners: Listener[] = []
    constructor(public div: HTMLElement, public opts: any) {
      created.push(this)
    }
    addListener(ev: string, fn: any) {
      const l = { ev, fn, once: false }
      this.listeners.push(l)
      return { remove: () => (this.listeners = this.listeners.filter((x) => x !== l)) }
    }
    fire(ev: string) {
      const ls = this.listeners.filter((l) => l.ev === ev)
      this.listeners = this.listeners.filter((l) => !(l.ev === ev && l.once))
      ls.forEach((l) => l.fn())
    }
    setCenter() {}
    setZoom() {}
    fitBounds() {}
    getBounds() {
      return null
    }
  }
  class OverlayView {
    setMap() {}
  }
  ;(window as any).google = {
    maps: {
      Map: FakeMap,
      LatLng: class {
        constructor(public a: number, public b: number) {}
      },
      LatLngBounds: class {},
      OverlayView,
      Marker: class {
        setMap() {}
      },
      ControlPosition: {},
      MapTypeId: { ROADMAP: 'roadmap' },
      SymbolPath: { CIRCLE: 0 },
      event: {
        addListenerOnce: (obj: FakeMap, ev: string, fn: any) => {
          const l = { ev, fn, once: true }
          obj.listeners.push(l)
          return { remove: () => (obj.listeners = obj.listeners.filter((x) => x !== l)) }
        },
      },
      places: {
        AutocompleteService: class {},
        PlacesService: class {},
        PlacesServiceStatus: { OK: 'OK' },
      },
    },
  }
  return created
}

// jsdom never loads images; MapView preloads the marker image before init.
class InstantImage {
  onload: null | (() => void) = null
  onerror: null | (() => void) = null
  set src(_v: string) {
    setTimeout(() => this.onload?.(), 0)
  }
}

describe('MapView (full-screen /map)', () => {
  let created: any[]
  const OriginalImage = global.Image

  beforeEach(() => {
    __resetPersistentMapForTests()
    created = installFakeGoogleMaps()
    ;(global as any).Image = InstantImage
    const result = Promise.resolve({ data: [], error: null })
    const chain: any = new Proxy(
      {},
      {
        get: (_t, prop) => (prop === 'then' ? result.then.bind(result) : () => chain),
      },
    )
    vi.mocked(createBrowserSupabaseClient).mockReturnValue({ from: () => chain } as any)
  })

  afterEach(() => {
    ;(global as any).Image = OriginalImage
    delete (window as any).google
  })

  it('shows a neutral canvas and the real chrome while loading - no spinner, no "Loading" text', async () => {
    const { container } = render(<MapView posts={[]} />)

    expect(screen.getByTestId('map-canvas-placeholder')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search location...')).toBeVisible()
    expect(container.querySelector('.animate-spin')).toBeNull()
    expect(container.textContent?.toLowerCase()).not.toContain('loading')
    expect(screen.getByTestId('map-canvas')).toHaveStyle({ opacity: '0' })

    await waitFor(() => expect(created).toHaveLength(1))
    // Placeholder colour and the Map's own background match, so tiles stream in seamlessly
    expect(created[0].opts.backgroundColor).toBe('#ece9e3')

    act(() => created[0].fire('tilesloaded'))
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toHaveStyle({ opacity: '1' }))
    expect(screen.queryByTestId('map-canvas-placeholder')).toBeNull()
    // First visit fades in (and respects reduced motion)
    expect(screen.getByTestId('map-canvas').className).toContain('motion-reduce:transition-none')
  })

  it('reuses the same google.maps.Map when the user comes back to the Map tab', async () => {
    const first = render(<MapView posts={[]} />)
    await waitFor(() => expect(created).toHaveLength(1))
    const map = created[0]
    act(() => map.fire('tilesloaded'))
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toHaveStyle({ opacity: '1' }))

    const mapNode = map.div as HTMLElement
    first.unmount()
    // Detached, not destroyed; this mount's listeners are gone
    expect(mapNode.isConnected).toBe(false)
    expect(map.listeners.filter((l: Listener) => l.ev === 'click')).toHaveLength(0)

    render(<MapView posts={[]} />)
    // Visible on the very first frame: no new Map, no placeholder, no fade
    expect(created).toHaveLength(1)
    const canvas = screen.getByTestId('map-canvas')
    expect(canvas).toHaveStyle({ opacity: '1' })
    expect(canvas.contains(mapNode)).toBe(true)
    expect(canvas.className).not.toContain('transition-opacity')
    expect(screen.queryByTestId('map-canvas-placeholder')).toBeNull()
    // Re-registered its own click listener on the shared map
    expect(map.listeners.filter((l: Listener) => l.ev === 'click')).toHaveLength(1)
    await act(async () => {}) // let the posts query settle
  })

  it('does not share the map with embedded (modal) maps', async () => {
    const page = render(<MapView posts={[]} />)
    await waitFor(() => expect(created).toHaveLength(1))
    page.unmount()

    render(<MapView posts={[]} isModal />)
    await waitFor(() => expect(created).toHaveLength(2))
  })
})
