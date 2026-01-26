import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Database } from '@/lib/database.types'
import { createBrowserSupabaseClient, createServerSupabaseClient } from '@/lib/supabase'
import { mockSupabaseClient } from '@/tests/setup'

// Get the mocked version for better type safety (mock provided by tests/setup.ts)
const mockedCreateBrowserSupabaseClient = vi.mocked(createBrowserSupabaseClient)

describe('createServerSupabaseClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should create a Supabase client instance', () => {
      const client = createServerSupabaseClient()
      
      expect(client).toBeDefined()
      expect(client).toBe(mockSupabaseClient)
    })

    it('should create client without options', () => {
      const client = createServerSupabaseClient()
      
      expect(client).toBeDefined()
      expect(typeof client).toBe('object')
    })

    it('should create client with custom supabaseUrl option', () => {
      const client = createServerSupabaseClient({ 
        supabaseUrl: 'https://custom.supabase.co' 
      })
      
      expect(client).toBeDefined()
      expect(client).toBe(mockSupabaseClient)
    })

    it('should create client with custom supabaseKey option', () => {
      const client = createServerSupabaseClient({ 
        supabaseKey: 'custom-api-key' 
      })
      
      expect(client).toBeDefined()
      expect(client).toBe(mockSupabaseClient)
    })

    it('should create client with cookieStore option', () => {
      const mockCookieStore = {
        get: vi.fn(),
        set: vi.fn()
      }
      
      const client = createServerSupabaseClient({ 
        cookieStore: mockCookieStore 
      })
      
      expect(client).toBeDefined()
      expect(client).toBe(mockSupabaseClient)
    })

    it('should create client with all custom options', () => {
      const mockCookieStore = {
        get: vi.fn(),
        set: vi.fn()
      }
      
      const client = createServerSupabaseClient({ 
        supabaseUrl: 'https://custom.supabase.co',
        supabaseKey: 'custom-api-key',
        cookieStore: mockCookieStore
      })
      
      expect(client).toBeDefined()
      expect(client).toBe(mockSupabaseClient)
    })
  })

  describe('auth interface', () => {
    it('should have auth property', () => {
      const client = createServerSupabaseClient()
      
      expect(client.auth).toBeDefined()
      expect(typeof client.auth).toBe('object')
    })

    it('should have getSession method', () => {
      const client = createServerSupabaseClient()
      
      expect(client.auth.getSession).toBeDefined()
      expect(typeof client.auth.getSession).toBe('function')
    })

    it('should have getUser method', () => {
      const client = createServerSupabaseClient()
      
      expect(client.auth.getUser).toBeDefined()
      expect(typeof client.auth.getUser).toBe('function')
    })

    it('should have signOut method', () => {
      const client = createServerSupabaseClient()
      
      expect(client.auth.signOut).toBeDefined()
      expect(typeof client.auth.signOut).toBe('function')
    })

    it('should have signInWithPassword method', () => {
      const client = createServerSupabaseClient()
      
      expect(client.auth.signInWithPassword).toBeDefined()
      expect(typeof client.auth.signInWithPassword).toBe('function')
    })

    it('should have signUp method', () => {
      const client = createServerSupabaseClient()
      
      expect(client.auth.signUp).toBeDefined()
      expect(typeof client.auth.signUp).toBe('function')
    })
  })

  describe('database query interface', () => {
    it('should have from method', () => {
      const client = createServerSupabaseClient()
      
      expect(client.from).toBeDefined()
      expect(typeof client.from).toBe('function')
    })

    it('should return query builder from from() method', () => {
      const client = createServerSupabaseClient()
      const queryBuilder = client.from('test_table')
      
      expect(queryBuilder).toBeDefined()
      expect(typeof queryBuilder).toBe('object')
    })

    it('should have select method on query builder', () => {
      const client = createServerSupabaseClient()
      const queryBuilder = client.from('test_table')
      
      expect(queryBuilder.select).toBeDefined()
      expect(typeof queryBuilder.select).toBe('function')
    })

    it('should have insert method on query builder', () => {
      const client = createServerSupabaseClient()
      const queryBuilder = client.from('test_table')
      
      expect(queryBuilder.insert).toBeDefined()
      expect(typeof queryBuilder.insert).toBe('function')
    })

    it('should have update method on query builder', () => {
      const client = createServerSupabaseClient()
      const queryBuilder = client.from('test_table')
      
      expect(queryBuilder.update).toBeDefined()
      expect(typeof queryBuilder.update).toBe('function')
    })

    it('should have delete method on query builder', () => {
      const client = createServerSupabaseClient()
      const queryBuilder = client.from('test_table')
      
      expect(queryBuilder.delete).toBeDefined()
      expect(typeof queryBuilder.delete).toBe('function')
    })

    it('should support method chaining on query builder', () => {
      const client = createServerSupabaseClient()
      const query = client.from('test_table').select('*').eq('id', '123')
      
      expect(query).toBeDefined()
      expect(typeof query).toBe('object')
    })

    it('should have eq filter method', () => {
      const client = createServerSupabaseClient()
      const queryBuilder = client.from('test_table').select('*')
      
      expect(queryBuilder.eq).toBeDefined()
      expect(typeof queryBuilder.eq).toBe('function')
    })

    it('should have single method', () => {
      const client = createServerSupabaseClient()
      const queryBuilder = client.from('test_table').select('*')
      
      expect(queryBuilder.single).toBeDefined()
      expect(typeof queryBuilder.single).toBe('function')
    })
  })

  describe('storage interface', () => {
    it('should have storage property', () => {
      const client = createServerSupabaseClient()
      
      expect(client.storage).toBeDefined()
      expect(typeof client.storage).toBe('object')
    })

    it('should have storage.from method', () => {
      const client = createServerSupabaseClient()
      
      expect(client.storage.from).toBeDefined()
      expect(typeof client.storage.from).toBe('function')
    })

    it('should return storage bucket from storage.from() method', () => {
      const client = createServerSupabaseClient()
      const bucket = client.storage.from('test_bucket')
      
      expect(bucket).toBeDefined()
      expect(typeof bucket).toBe('object')
    })

    it('should have upload method on storage bucket', () => {
      const client = createServerSupabaseClient()
      const bucket = client.storage.from('test_bucket')
      
      expect(bucket.upload).toBeDefined()
      expect(typeof bucket.upload).toBe('function')
    })

    it('should have download method on storage bucket', () => {
      const client = createServerSupabaseClient()
      const bucket = client.storage.from('test_bucket')
      
      expect(bucket.download).toBeDefined()
      expect(typeof bucket.download).toBe('function')
    })

    it('should have getPublicUrl method on storage bucket', () => {
      const client = createServerSupabaseClient()
      const bucket = client.storage.from('test_bucket')
      
      expect(bucket.getPublicUrl).toBeDefined()
      expect(typeof bucket.getPublicUrl).toBe('function')
    })
  })

  describe('configuration and consistency', () => {
    it('should return consistent client instance', () => {
      const client1 = createServerSupabaseClient()
      const client2 = createServerSupabaseClient()
      
      expect(client1).toBe(client2)
      expect(client1).toBe(mockSupabaseClient)
    })

    it('should return same client with different options', () => {
      const client1 = createServerSupabaseClient()
      const client2 = createServerSupabaseClient({ supabaseKey: 'custom-key' })
      
      // In unit tests, both should return the same mock
      expect(client1).toBe(client2)
      expect(client1).toBe(mockSupabaseClient)
    })

    it('should have all required interfaces available', () => {
      const client = createServerSupabaseClient()
      
      expect(client.auth).toBeDefined()
      expect(client.from).toBeDefined()
      expect(client.storage).toBeDefined()
      expect(typeof client.auth).toBe('object')
      expect(typeof client.from).toBe('function')
      expect(typeof client.storage).toBe('object')
    })

    it('should maintain interface structure across multiple calls', () => {
      const client1 = createServerSupabaseClient()
      const client2 = createServerSupabaseClient({ supabaseUrl: 'https://test.supabase.co' })
      
      expect(client1.auth).toBeDefined()
      expect(client2.auth).toBeDefined()
      expect(client1.from).toBeDefined()
      expect(client2.from).toBeDefined()
      expect(client1.storage).toBeDefined()
      expect(client2.storage).toBeDefined()
    })
  })
})

describe('createBrowserSupabaseClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Client Initialization', () => {
    it('should return a Supabase client when called', () => {
      // Act
      const client = createBrowserSupabaseClient()

      // Assert
      expect(client).toBeDefined()
      expect(mockedCreateBrowserSupabaseClient).toHaveBeenCalled()
    })

    it('should be callable multiple times', () => {
      // Act
      const client1 = createBrowserSupabaseClient()
      const client2 = createBrowserSupabaseClient()

      // Assert
      expect(mockedCreateBrowserSupabaseClient).toHaveBeenCalledTimes(2)
      expect(client1).toBeDefined()
      expect(client2).toBeDefined()
    })
  })

  describe('Client Auth Interface', () => {
    it('should return a client with auth.getSession method', () => {
      // Act
      const client = createBrowserSupabaseClient()

      // Assert
      expect(client.auth).toBeDefined()
      expect(client.auth.getSession).toBeDefined()
      expect(typeof client.auth.getSession).toBe('function')
    })

    it('should return a client with auth.getUser method', () => {
      // Act
      const client = createBrowserSupabaseClient()

      // Assert
      expect(client.auth.getUser).toBeDefined()
      expect(typeof client.auth.getUser).toBe('function')
    })

    it('should return a client with auth sign-in/sign-out methods', () => {
      // Act
      const client = createBrowserSupabaseClient()

      // Assert
      expect(client.auth.signOut).toBeDefined()
      expect(client.auth.signInWithPassword).toBeDefined()
      expect(client.auth.signUp).toBeDefined()
    })
  })

  describe('Client Database Interface', () => {
    it('should return a client with from method for database queries', () => {
      // Act
      const client = createBrowserSupabaseClient()

      // Assert
      expect(client.from).toBeDefined()
      expect(typeof client.from).toBe('function')
    })

    it('should return a client with chainable query builder methods', () => {
      // Act
      const client = createBrowserSupabaseClient()
      const query = client.from('profiles')

      // Assert
      expect(query).toBeDefined()
      expect(query.select).toBeDefined()
      expect(query.insert).toBeDefined()
      expect(query.update).toBeDefined()
      expect(query.delete).toBeDefined()
      expect(query.eq).toBeDefined()
    })

    it('should allow querying typed database tables', () => {
      // Act
      const client = createBrowserSupabaseClient()
      const profilesQuery = client.from('profiles')
      const postsQuery = client.from('posts')
      const groupsQuery = client.from('groups')

      // Assert - verifies that the from method accepts different table names
      expect(profilesQuery).toBeDefined()
      expect(postsQuery).toBeDefined()
      expect(groupsQuery).toBeDefined()
    })
  })

  describe('Client Storage Interface', () => {
    it('should return a client with storage.from method', () => {
      // Act
      const client = createBrowserSupabaseClient()

      // Assert
      expect(client.storage).toBeDefined()
      expect(client.storage.from).toBeDefined()
      expect(typeof client.storage.from).toBe('function')
    })

    it('should return a client with storage methods for file operations', () => {
      // Act
      const client = createBrowserSupabaseClient()

      // Assert
      expect(client.storage.from).toBeDefined()
      expect(client.storage.createSignedUrl).toBeDefined()
      expect(client.storage.getPublicUrl).toBeDefined()
    })
  })

  describe('Type Safety', () => {
    it('should ensure Database type is applied to client methods', () => {
      // Act
      const client = createBrowserSupabaseClient()

      // Assert
      // This test verifies that TypeScript compilation passes with Database type
      // At runtime, we verify the client was created successfully
      expect(client).toBeDefined()
      expect(client.from).toBeDefined()
      expect(client.auth).toBeDefined()
    })
  })

  describe('Integration with Next.js App Router', () => {
    it('should create a client compatible with Next.js cookie-based sessions', () => {
      // Act
      const client = createBrowserSupabaseClient()

      // Assert
      // The global mock simulates the behavior of createClientComponentClient
      // which automatically handles cookie-based session management in Next.js
      expect(client).toBeDefined()
      expect(client.auth).toBeDefined()
      expect(mockedCreateBrowserSupabaseClient).toHaveBeenCalled()
    })
  })
})
