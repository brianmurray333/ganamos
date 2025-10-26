import { vi } from 'vitest'
import type { TestParentAccount, TestChildAccount, ExtendedProfile } from './child-account-fixtures'
import type { Database } from '@/lib/database.types'

type ConnectedAccount = Database['public']['Tables']['connected_accounts']['Row']

/**
 * Mock database state for integration tests
 */
export class MockDatabaseState {
  profiles: Map<string, ExtendedProfile>
  connectedAccounts: Map<string, ConnectedAccount>
  authUsers: Set<string>
  
  constructor() {
    this.profiles = new Map()
    this.connectedAccounts = new Map()
    this.authUsers = new Set()
  }
  
  addProfile(profile: TestParentAccount | TestChildAccount) {
    this.profiles.set(profile.id, profile as ExtendedProfile)
    this.authUsers.add(profile.id)
  }
  
  addConnection(connection: ConnectedAccount) {
    this.connectedAccounts.set(connection.id, connection)
  }
  
  getProfile(id: string): ExtendedProfile | undefined {
    return this.profiles.get(id)
  }
  
  getConnectionByUsers(primaryUserId: string, connectedUserId: string): ConnectedAccount | undefined {
    return Array.from(this.connectedAccounts.values()).find(
      conn => conn.primary_user_id === primaryUserId && conn.connected_user_id === connectedUserId
    )
  }
  
  updateProfile(id: string, updates: Partial<ExtendedProfile>) {
    const profile = this.profiles.get(id)
    if (profile) {
      this.profiles.set(id, { ...profile, ...updates })
    }
  }
  
  deleteConnection(id: string) {
    this.connectedAccounts.delete(id)
  }
  
  deleteConnectionByUsers(primaryUserId: string, connectedUserId: string) {
    const connection = this.getConnectionByUsers(primaryUserId, connectedUserId)
    if (connection) {
      this.connectedAccounts.delete(connection.id)
    }
  }
  
  reset() {
    this.profiles.clear()
    this.connectedAccounts.clear()
    this.authUsers.clear()
  }
}

/**
 * Create mock session for authenticated requests
 */
export function mockAuthenticatedSession(userId: string) {
  return {
    user: {
      id: userId,
      email: `user-${userId}@test.com`,
      aud: 'authenticated',
      role: 'authenticated',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
  }
}

/**
 * Mock Supabase client for integration tests with state tracking
 */
export function createMockSupabaseClient(dbState: MockDatabaseState, currentUserId?: string) {
  const mockClient = {
    auth: {
      getSession: vi.fn(async () => {
        if (!currentUserId) {
          return { data: { session: null }, error: null }
        }
        return {
          data: { session: mockAuthenticatedSession(currentUserId) },
          error: null,
        }
      }),
      getUser: vi.fn(async () => {
        if (!currentUserId) {
          return { data: { user: null }, error: { message: 'Not authenticated' } }
        }
        return {
          data: {
            user: {
              id: currentUserId,
              email: `user-${currentUserId}@test.com`,
            },
          },
          error: null,
        }
      }),
    },
    from: vi.fn((table: string) => {
      return {
        select: vi.fn((columns?: string) => {
          const queryBuilder = {
            conditions: {} as Record<string, any>,
            eq: function(column: string, value: any) {
              this.conditions[column] = value
              return this
            },
            single: vi.fn(async function() {
              if (table === 'profiles') {
                const profile = dbState.getProfile(this.conditions['id'])
                if (!profile) {
                  return { data: null, error: { message: 'Profile not found', code: 'PGRST116' } }
                }
                return { data: profile, error: null }
              }
              
              if (table === 'connected_accounts') {
                // Handle query by primary_user_id AND connected_user_id
                const connection = Array.from(dbState.connectedAccounts.values()).find(
                  conn => {
                    return Object.entries(this.conditions).every(([key, val]) => 
                      conn[key as keyof ConnectedAccount] === val
                    )
                  }
                )
                if (!connection) {
                  return { data: null, error: { message: 'Connection not found', code: 'PGRST116' } }
                }
                return { data: connection, error: null }
              }
              
              return { data: null, error: null }
            })
          }
          return queryBuilder
        }),
        update: vi.fn((updates: any) => {
          return {
            eq: vi.fn((column: string, value: any) => {
              if (table === 'profiles') {
                dbState.updateProfile(value, updates)
                return { data: null, error: null }
              }
              return { data: null, error: null }
            }),
          }
        }),
        delete: vi.fn(() => {
          return {
            eq: vi.fn((column: string, value: any) => {
              if (table === 'connected_accounts') {
                const connection = Array.from(dbState.connectedAccounts.values()).find(
                  conn => conn[column as keyof ConnectedAccount] === value
                )
                if (connection) {
                  dbState.deleteConnection(connection.id)
                }
              }
              return { data: null, error: null }
            }),
          }
        }),
      }
    }),
  }
  
  return mockClient
}

/**
 * Mock API request for testing endpoints
 */
export function createMockRequest(body: any) {
  return {
    json: vi.fn(async () => body),
  } as unknown as Request
}

/**
 * Mock Next.js cookies for route handlers
 */
export function createMockCookies() {
  return {
    get: vi.fn((name: string) => ({ value: 'mock-cookie-value' })),
    set: vi.fn(),
    delete: vi.fn(),
  }
}