/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * BottomNav: tab responsiveness.
 * - Public tabs (/ and /map) are prefetched eagerly, even before the session
 *   is known; protected tabs (/wallet, /profile) only once a session exists
 *   (prefetching them earlier could cache a stale login redirect).
 * - The tapped tab is highlighted immediately (optimistic), not only after
 *   the destination route renders.
 */

const nav = vi.hoisted(() => ({ pathname: '/', prefetch: vi.fn(), push: vi.fn() }))
const auth = vi.hoisted(() => ({ value: { user: null as any, session: null as any, sessionLoaded: false, loading: false } }))
const maps = vi.hoisted(() => ({ loadGoogleMaps: vi.fn(() => Promise.resolve()) }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ prefetch: nav.prefetch, push: nav.push, replace: vi.fn() }),
}))

// Minimal stand-in for next/link: exposes the prefetch prop and stops jsdom navigation.
vi.mock('next/link', () => ({
  default: React.forwardRef(function MockLink({ href, prefetch, onClick, children, ...rest }: any, ref: any) {
    return (
      <a
        ref={ref}
        href={href}
        data-prefetch={prefetch === undefined ? 'auto' : String(prefetch)}
        onClick={(e) => {
          onClick?.(e)
          e.preventDefault()
        }}
        {...rest}
      >
        {children}
      </a>
    )
  }),
}))

vi.mock('@/components/auth-provider', () => ({ useAuth: () => auth.value }))
vi.mock('@/components/auth-prompt-modal', () => ({ AuthPromptModal: () => null }))
vi.mock('@/lib/google-maps-loader', () => ({ loadGoogleMaps: maps.loadGoogleMaps }))
vi.mock('@/components/camera-capture', () => ({}))
vi.mock('@/components/map-view', () => ({}))

import { BottomNav, isTabActive, PUBLIC_TAB_ROUTES } from '@/components/bottom-nav'

const signedIn = () => {
  auth.value = { user: { id: 'u1' }, session: { user: { id: 'u1' } }, sessionLoaded: true, loading: false }
}

describe('BottomNav', () => {
  beforeEach(() => {
    nav.pathname = '/'
    nav.prefetch.mockClear()
    nav.push.mockClear()
    maps.loadGoogleMaps.mockClear()
    auth.value = { user: null, session: null, sessionLoaded: false, loading: false }
  })

  describe('prefetching', () => {
    it('prefetches the public tab routes before the session is known', () => {
      render(<BottomNav />)
      for (const route of PUBLIC_TAB_ROUTES) {
        expect(nav.prefetch).toHaveBeenCalledWith(route)
      }
      expect(PUBLIC_TAB_ROUTES).toEqual(['/', '/map'])
      expect(nav.prefetch).not.toHaveBeenCalledWith('/wallet')
      expect(nav.prefetch).not.toHaveBeenCalledWith('/profile')
    })

    it('renders Home and Map as links that are not gated on auth', () => {
      render(<BottomNav />)
      const home = screen.getByTestId('nav-dashboard-link')
      const map = screen.getByTestId('nav-map-button')
      expect(home.tagName).toBe('A')
      expect(map.tagName).toBe('A')
      expect(map).toHaveAttribute('href', '/map')
      expect(home.getAttribute('data-prefetch')).not.toBe('false')
      expect(map.getAttribute('data-prefetch')).not.toBe('false')
    })

    it('keeps protected tabs unprefetched until the session is confirmed', () => {
      auth.value = { user: { id: 'u1' }, session: null, sessionLoaded: false, loading: true }
      const { rerender } = render(<BottomNav />)
      expect(screen.getByTestId('nav-wallet-link')).toHaveAttribute('data-prefetch', 'false')
      expect(screen.getByTestId('nav-profile-link')).toHaveAttribute('data-prefetch', 'false')

      signedIn()
      rerender(<BottomNav />)
      expect(screen.getByTestId('nav-wallet-link')).toHaveAttribute('data-prefetch', 'true')
      expect(screen.getByTestId('nav-profile-link')).toHaveAttribute('data-prefetch', 'true')
    })
  })

  describe('optimistic active state', () => {
    it('highlights the tapped tab immediately, before the route changes', () => {
      render(<BottomNav />)
      const home = screen.getByTestId('nav-dashboard-link')
      const map = screen.getByTestId('nav-map-button')
      expect(home).toHaveAttribute('aria-current', 'page')
      expect(map).not.toHaveAttribute('aria-current')

      fireEvent.click(map)

      // pathname is still "/" - the highlight moved anyway
      expect(map).toHaveAttribute('aria-current', 'page')
      expect(map.querySelector('svg')).toHaveClass('text-primary')
      expect(home).not.toHaveAttribute('aria-current')
      expect(home.querySelector('svg')).not.toHaveClass('text-primary')
    })

    it('settles on the real route once navigation completes', () => {
      const { rerender } = render(<BottomNav />)
      fireEvent.click(screen.getByTestId('nav-map-button'))
      nav.pathname = '/map'
      rerender(<BottomNav />)
      expect(screen.getByTestId('nav-map-button')).toHaveAttribute('aria-current', 'page')
      expect(screen.getByTestId('nav-dashboard-link')).not.toHaveAttribute('aria-current')

      // Navigating elsewhere by other means clears the optimistic state
      nav.pathname = '/'
      rerender(<BottomNav />)
      expect(screen.getByTestId('nav-dashboard-link')).toHaveAttribute('aria-current', 'page')
      expect(screen.getByTestId('nav-map-button')).not.toHaveAttribute('aria-current')
    })

    it('a second tap back to the current tab clears the pending highlight', () => {
      render(<BottomNav />)
      // Tap Map, then Home before the Map navigation commits (pathname still "/")
      fireEvent.click(screen.getByTestId('nav-map-button'))
      fireEvent.click(screen.getByTestId('nav-dashboard-link'))

      expect(screen.getByTestId('nav-dashboard-link')).toHaveAttribute('aria-current', 'page')
      expect(screen.getByTestId('nav-map-button')).not.toHaveAttribute('aria-current')
    })

    it('works for protected tabs too', () => {
      signedIn()
      nav.pathname = '/map'
      render(<BottomNav />)
      fireEvent.click(screen.getByTestId('nav-profile-link'))
      expect(screen.getByTestId('nav-profile-link')).toHaveAttribute('aria-current', 'page')
      expect(screen.getByTestId('nav-map-button')).not.toHaveAttribute('aria-current')
    })

    it('ignores modified clicks (open in new tab)', () => {
      render(<BottomNav />)
      fireEvent.click(screen.getByTestId('nav-map-button'), { metaKey: true })
      expect(screen.getByTestId('nav-map-button')).not.toHaveAttribute('aria-current')
      expect(screen.getByTestId('nav-dashboard-link')).toHaveAttribute('aria-current', 'page')
    })
  })

  // iOS: a tap during scroll momentum only stops the scroll (no click is
  // dispatched), so tabs navigate on the tap's touchend instead.
  describe('touch taps (work while the feed is still scrolling)', () => {
    const tapAt = (el: Element, from = { x: 20, y: 20 }, to = from) => {
      fireEvent.touchStart(el, { touches: [{ clientX: from.x, clientY: from.y }] })
      if (to !== from) fireEvent.touchMove(el, { touches: [{ clientX: to.x, clientY: to.y }] })
      return fireEvent.touchEnd(el, { changedTouches: [{ clientX: to.x, clientY: to.y }] })
    }

    it('navigates to the Map tab on a single tap, without waiting for a click', () => {
      render(<BottomNav />)
      const map = screen.getByTestId('nav-map-button')

      const notPrevented = tapAt(map)

      expect(nav.push).toHaveBeenCalledTimes(1)
      expect(nav.push).toHaveBeenCalledWith('/map')
      expect(map).toHaveAttribute('aria-current', 'page')
      // The follow-up click is suppressed, so the tab can't fire twice
      expect(notPrevented).toBe(false)
    })

    it('works for every tab and the new-post button', () => {
      signedIn()
      nav.pathname = '/map'
      render(<BottomNav />)
      tapAt(screen.getByTestId('nav-dashboard-link'))
      tapAt(screen.getByTestId('nav-wallet-link'))
      tapAt(screen.getByTestId('nav-profile-link'))
      tapAt(screen.getByTestId('nav-new-post-button'))
      expect(nav.push.mock.calls.map((c) => c[0])).toEqual(['/', '/wallet', '/profile', '/post/new'])
    })

    it('does not navigate when the finger moves (a scroll or swipe)', () => {
      render(<BottomNav />)
      const notPrevented = tapAt(screen.getByTestId('nav-map-button'), { x: 20, y: 40 }, { x: 20, y: 10 })
      expect(nav.push).not.toHaveBeenCalled()
      expect(notPrevented).toBe(true)
    })

    it('leaves a long press to the system', () => {
      vi.useFakeTimers()
      try {
        render(<BottomNav />)
        const map = screen.getByTestId('nav-map-button')
        fireEvent.touchStart(map, { touches: [{ clientX: 20, clientY: 20 }] })
        vi.advanceTimersByTime(800)
        fireEvent.touchEnd(map, { changedTouches: [{ clientX: 20, clientY: 20 }] })
        expect(nav.push).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('tapping the current tab does not navigate again', () => {
      render(<BottomNav />)
      tapAt(screen.getByTestId('nav-dashboard-link'))
      expect(nav.push).not.toHaveBeenCalled()
    })
  })

  it('starts loading Google Maps as soon as the Map tab is pressed', () => {
    render(<BottomNav />)
    fireEvent.pointerDown(screen.getByTestId('nav-map-button'))
    expect(maps.loadGoogleMaps).toHaveBeenCalledTimes(1)
  })

  it('gives every tab a 48px touch target and an accessible name', () => {
    signedIn()
    render(<BottomNav />)
    for (const id of ['nav-dashboard-link', 'nav-map-button', 'nav-wallet-link', 'nav-profile-link']) {
      const el = screen.getByTestId(id)
      expect(el).toHaveClass('w-12', 'h-12')
      expect(el).toHaveAccessibleName()
    }
  })
})

describe('isTabActive', () => {
  it('matches home only exactly', () => {
    expect(isTabActive('/', '/')).toBe(true)
    expect(isTabActive('/', '/map')).toBe(false)
  })

  it('matches a tab and its sub-routes, not look-alike prefixes', () => {
    expect(isTabActive('/wallet', '/wallet')).toBe(true)
    expect(isTabActive('/profile', '/profile/settings')).toBe(true)
    expect(isTabActive('/map', '/mapping')).toBe(false)
  })
})
