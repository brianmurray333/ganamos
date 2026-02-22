/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { PostCard, abbreviateLocation } from '@/components/post-card'
import type { Post } from '@/lib/types'

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

global.IntersectionObserver = IntersectionObserverMock as any

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => {
    return React.createElement('img', { src, alt, ...props })
  },
}))

// Mock geocoding functions
vi.mock('@/lib/geocoding', () => ({
  reverseGeocode: vi.fn(),
  getTravelTimes: vi.fn().mockResolvedValue({ walking: null, driving: null }),
  getCurrentLocationWithName: vi.fn().mockResolvedValue(null),
}))

const mockPost: Post = {
  id: 'test-post-1',
  title: 'Test Post',
  description: 'Test description',
  reward: 100,
  user_id: 'user-1',
  created_at: new Date().toISOString(),
  location: 'Austin, Texas',
  latitude: 30.2672,
  longitude: -97.7431,
  image_url: 'https://example.com/image.jpg',
  fixed: false,
  deleted_at: null,
  under_review: false,
}

describe('abbreviateLocation', () => {
  describe('full state name abbreviation', () => {
    it('should abbreviate full US state names to two-letter codes', () => {
      expect(abbreviateLocation('Austin, Texas')).toBe('Austin, TX')
      expect(abbreviateLocation('San Francisco, California')).toBe('San Francisco, CA')
      expect(abbreviateLocation('New York, New York')).toBe('NY, NY')
      expect(abbreviateLocation('Miami, Florida')).toBe('Miami, FL')
      expect(abbreviateLocation('Seattle, Washington')).toBe('Seattle, WA')
    })

    it('should abbreviate state names with multiple words', () => {
      expect(abbreviateLocation('Charlotte, North Carolina')).toBe('Charlotte, NC')
      expect(abbreviateLocation('Charleston, South Carolina')).toBe('Charleston, SC')
      expect(abbreviateLocation('Concord, New Hampshire')).toBe('Concord, NH')
      expect(abbreviateLocation('Trenton, New Jersey')).toBe('Trenton, NJ')
      expect(abbreviateLocation('Santa Fe, New Mexico')).toBe('Santa Fe, NM')
      expect(abbreviateLocation('Fargo, North Dakota')).toBe('Fargo, ND')
      expect(abbreviateLocation('Pierre, South Dakota')).toBe('Pierre, SD')
      expect(abbreviateLocation('Charleston, West Virginia')).toBe('Charleston, WV')
      expect(abbreviateLocation('Providence, Rhode Island')).toBe('Providence, RI')
    })

    it('should handle state-only input', () => {
      expect(abbreviateLocation('Texas')).toBe('TX')
      expect(abbreviateLocation('California')).toBe('CA')
      expect(abbreviateLocation('New York')).toBe('NY')
      expect(abbreviateLocation('Florida')).toBe('FL')
    })
  })

  describe('already abbreviated states', () => {
    it('should preserve already abbreviated state codes', () => {
      expect(abbreviateLocation('Austin, TX')).toBe('Austin, TX')
      expect(abbreviateLocation('San Francisco, CA')).toBe('San Francisco, CA')
      expect(abbreviateLocation('New York, NY')).toBe('NY, NY')
      expect(abbreviateLocation('Miami, FL')).toBe('Miami, FL')
    })

    it('should preserve abbreviation-only input', () => {
      expect(abbreviateLocation('TX')).toBe('TX')
      expect(abbreviateLocation('CA')).toBe('CA')
      expect(abbreviateLocation('NY')).toBe('NY')
    })
  })

  describe('multiple comma-separated parts', () => {
    it('should abbreviate states while preserving other location parts', () => {
      expect(abbreviateLocation('Austin, Texas, USA')).toBe('Austin, TX, USA')
      expect(abbreviateLocation('San Francisco, California, United States')).toBe('San Francisco, CA, United States')
      expect(abbreviateLocation('New York, New York, 10001')).toBe('NY, NY, 10001')
    })

    it('should handle multiple states in one string', () => {
      expect(abbreviateLocation('Texas, California')).toBe('TX, CA')
      expect(abbreviateLocation('New York, Florida, Texas')).toBe('NY, FL, TX')
    })

    it('should abbreviate only recognized state names in mixed input', () => {
      expect(abbreviateLocation('Downtown, Austin, Texas, Area')).toBe('Downtown, Austin, TX, Area')
      expect(abbreviateLocation('Bay Area, California, Region')).toBe('Bay Area, CA, Region')
    })
  })

  describe('non-state terms preservation', () => {
    it('should preserve city names that are not states', () => {
      expect(abbreviateLocation('San Francisco, Bay Area')).toBe('San Francisco, Bay Area')
      expect(abbreviateLocation('Austin, Downtown')).toBe('Austin, Downtown')
      expect(abbreviateLocation('Seattle, Capitol Hill')).toBe('Seattle, Capitol Hill')
    })

    it('should preserve country names', () => {
      expect(abbreviateLocation('London, England')).toBe('London, England')
      expect(abbreviateLocation('Paris, France')).toBe('Paris, France')
      expect(abbreviateLocation('Toronto, Canada')).toBe('Toronto, Canada')
    })

    it('should preserve arbitrary non-state text', () => {
      expect(abbreviateLocation('Custom Location')).toBe('Custom Location')
      expect(abbreviateLocation('123 Main Street')).toBe('123 Main Street')
      expect(abbreviateLocation('Building A, Floor 3')).toBe('Building A, Floor 3')
    })
  })

  describe('whitespace handling', () => {
    it('should trim whitespace around location parts', () => {
      expect(abbreviateLocation('Austin,  Texas')).toBe('Austin, TX')
      expect(abbreviateLocation('Austin ,Texas')).toBe('Austin, TX')
      expect(abbreviateLocation('Austin  ,  Texas  ')).toBe('Austin, TX')
      expect(abbreviateLocation('  San Francisco  ,  California  ')).toBe('San Francisco, CA')
    })

    it('should preserve internal whitespace in location parts', () => {
      expect(abbreviateLocation('New York, New York')).toBe('NY, NY')
      expect(abbreviateLocation('Salt Lake City, Utah')).toBe('Salt Lake City, UT')
      expect(abbreviateLocation('Palo Alto, California')).toBe('Palo Alto, CA')
    })

    it('should handle excessive whitespace', () => {
      expect(abbreviateLocation('Austin,     Texas')).toBe('Austin, TX')
      expect(abbreviateLocation('  Austin  ,    Texas   ')).toBe('Austin, TX')
    })
  })

  describe('case sensitivity', () => {
    it('should require exact case match for state abbreviation', () => {
      // Exact match should abbreviate
      expect(abbreviateLocation('Austin, Texas')).toBe('Austin, TX')
      
      // Different case should NOT abbreviate (preserves original)
      expect(abbreviateLocation('Austin, texas')).toBe('Austin, texas')
      expect(abbreviateLocation('Austin, TEXAS')).toBe('Austin, TEXAS')
      expect(abbreviateLocation('Austin, TeXaS')).toBe('Austin, TeXaS')
    })

    it('should handle case sensitivity for multi-word states', () => {
      expect(abbreviateLocation('Charlotte, North Carolina')).toBe('Charlotte, NC')
      expect(abbreviateLocation('Charlotte, north carolina')).toBe('Charlotte, north carolina')
      expect(abbreviateLocation('Charlotte, NORTH CAROLINA')).toBe('Charlotte, NORTH CAROLINA')
    })
  })

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(abbreviateLocation('')).toBe('')
    })

    it('should handle single comma with no content', () => {
      expect(abbreviateLocation(',')).toBe(', ')
      expect(abbreviateLocation(',,,')).toBe(', , , ')
    })

    it('should handle string with only whitespace', () => {
      expect(abbreviateLocation('   ')).toBe('')
      expect(abbreviateLocation('  ,  ')).toBe(', ')
    })

    it('should handle unrecognized state names', () => {
      expect(abbreviateLocation('Austin, FakeState')).toBe('Austin, FakeState')
      expect(abbreviateLocation('City, XYZ')).toBe('City, XYZ')
      expect(abbreviateLocation('Location, NotAState')).toBe('Location, NotAState')
    })

    it('should handle numeric input', () => {
      expect(abbreviateLocation('123, 456')).toBe('123, 456')
      expect(abbreviateLocation('Austin, 78701')).toBe('Austin, 78701')
    })

    it('should handle special characters', () => {
      expect(abbreviateLocation('Austin@Home, Texas')).toBe('Austin@Home, TX')
      expect(abbreviateLocation('San Francisco (Bay), California')).toBe('San Francisco (Bay), CA')
      expect(abbreviateLocation('Location-Name, Texas')).toBe('Location-Name, TX')
    })
  })

  describe('real-world usage patterns', () => {
    it('should handle typical PostCard location display formats', () => {
      // City, State format (most common)
      expect(abbreviateLocation('Austin, Texas')).toBe('Austin, TX')
      expect(abbreviateLocation('San Francisco, California')).toBe('San Francisco, CA')
      
      // State only
      expect(abbreviateLocation('Texas')).toBe('TX')
      
      // Already abbreviated
      expect(abbreviateLocation('Austin, TX')).toBe('Austin, TX')
    })

    it('should handle reverse geocoding results format', () => {
      // Format returned by reverseGeocode: "City, ST"  
      // Already abbreviated states should remain as-is
      expect(abbreviateLocation('San Francisco, CA')).toBe('San Francisco, CA')
      // Note: "New York" as a city name gets abbreviated because it matches the state name
      // This is a known limitation - the function abbreviates ALL state names regardless of position
      expect(abbreviateLocation('New York, NY')).toBe('NY, NY')
    })

    it('should handle coordinate fallback strings', () => {
      // Sometimes coordinates are stored as location strings
      expect(abbreviateLocation('37.7749, -122.4194')).toBe('37.7749, -122.4194')
      expect(abbreviateLocation('-33.8688, 151.2093')).toBe('-33.8688, 151.2093')
    })
  })

  describe('all 50 US states coverage', () => {
    it('should abbreviate all 50 US states correctly', () => {
      // Testing a comprehensive set to ensure mapping completeness
      const stateTests = [
        ['Alabama', 'AL'],
        ['Alaska', 'AK'],
        ['Arizona', 'AZ'],
        ['Arkansas', 'AR'],
        ['California', 'CA'],
        ['Colorado', 'CO'],
        ['Connecticut', 'CT'],
        ['Delaware', 'DE'],
        ['Florida', 'FL'],
        ['Georgia', 'GA'],
        ['Hawaii', 'HI'],
        ['Idaho', 'ID'],
        ['Illinois', 'IL'],
        ['Indiana', 'IN'],
        ['Iowa', 'IA'],
        ['Kansas', 'KS'],
        ['Kentucky', 'KY'],
        ['Louisiana', 'LA'],
        ['Maine', 'ME'],
        ['Maryland', 'MD'],
        ['Massachusetts', 'MA'],
        ['Michigan', 'MI'],
        ['Minnesota', 'MN'],
        ['Mississippi', 'MS'],
        ['Missouri', 'MO'],
        ['Montana', 'MT'],
        ['Nebraska', 'NE'],
        ['Nevada', 'NV'],
        ['New Hampshire', 'NH'],
        ['New Jersey', 'NJ'],
        ['New Mexico', 'NM'],
        ['New York', 'NY'],
        ['North Carolina', 'NC'],
        ['North Dakota', 'ND'],
        ['Ohio', 'OH'],
        ['Oklahoma', 'OK'],
        ['Oregon', 'OR'],
        ['Pennsylvania', 'PA'],
        ['Rhode Island', 'RI'],
        ['South Carolina', 'SC'],
        ['South Dakota', 'SD'],
        ['Tennessee', 'TN'],
        ['Texas', 'TX'],
        ['Utah', 'UT'],
        ['Vermont', 'VT'],
        ['Virginia', 'VA'],
        ['Washington', 'WA'],
        ['West Virginia', 'WV'],
        ['Wisconsin', 'WI'],
        ['Wyoming', 'WY'],
      ]

      stateTests.forEach(([fullName, abbreviation]) => {
        expect(abbreviateLocation(fullName)).toBe(abbreviation)
        expect(abbreviateLocation(`City, ${fullName}`)).toBe(`City, ${abbreviation}`)
      })
    })
  })

  describe('expiration display', () => {
    it('should render expiration time when expires_at is set to a future date', () => {
      const futureDate = new Date(Date.now() + 2 * 86400_000).toISOString() // 2 days from now
      const postWithExpiry: Post = {
        ...mockPost,
        expires_at: futureDate,
      }

      const { container } = render(<PostCard post={postWithExpiry} />)
      
      // Should show "expires 2d" or similar
      expect(container.textContent).toMatch(/expires \d+d/)
    })

    it('should render "expired" when expires_at is in the past', () => {
      const pastDate = new Date(Date.now() - 3600_000).toISOString() // 1 hour ago
      const postWithExpiry: Post = {
        ...mockPost,
        expires_at: pastDate,
      }

      const { container } = render(<PostCard post={postWithExpiry} />)
      
      expect(container.textContent).toContain('expired')
    })

    it('should render minutes when expiring within an hour', () => {
      const soonDate = new Date(Date.now() + 30 * 60_000).toISOString() // 30 minutes
      const postWithExpiry: Post = {
        ...mockPost,
        expires_at: soonDate,
      }

      const { container } = render(<PostCard post={postWithExpiry} />)
      
      expect(container.textContent).toMatch(/expires \d+m/)
    })

    it('should render hours when expiring within a day', () => {
      const hoursDate = new Date(Date.now() + 12 * 3600_000).toISOString() // 12 hours
      const postWithExpiry: Post = {
        ...mockPost,
        expires_at: hoursDate,
      }

      const { container } = render(<PostCard post={postWithExpiry} />)
      
      expect(container.textContent).toMatch(/expires \d+h/)
    })

    it('should render weeks when expiring beyond a week', () => {
      const weeksDate = new Date(Date.now() + 14 * 86400_000).toISOString() // 2 weeks
      const postWithExpiry: Post = {
        ...mockPost,
        expires_at: weeksDate,
      }

      const { container } = render(<PostCard post={postWithExpiry} />)
      
      expect(container.textContent).toMatch(/expires \d+w/)
    })

    it('should NOT render expiration when expires_at is null', () => {
      const postWithoutExpiry: Post = {
        ...mockPost,
        expires_at: null,
      }

      const { container } = render(<PostCard post={postWithoutExpiry} />)
      
      // Should not contain any expiration-related text
      expect(container.textContent).not.toMatch(/expires/)
      expect(container.textContent).not.toMatch(/expired/)
    })

    it('should NOT render expiration when expires_at is undefined', () => {
      const postWithoutExpiry: Post = {
        ...mockPost,
        // expires_at not set
      }

      const { container } = render(<PostCard post={postWithoutExpiry} />)
      
      expect(container.textContent).not.toMatch(/expires/)
      expect(container.textContent).not.toMatch(/expired/)
    })
  })
})
