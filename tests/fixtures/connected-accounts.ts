/**
 * Test fixtures for connected accounts feature
 * Provides reusable test data for integration tests
 */

import { ConnectedAccount } from '@/lib/database.types'

/**
 * Mock user data for testing
 */
export const mockUsers = {
  primaryUser: {
    id: 'primary-user-123',
    email: 'primary@example.com',
    name: 'Primary User',
    username: 'primaryuser',
    avatar_url: '/avatars/primary.png',
    balance: 10000,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    fixed_issues_count: 5,
  },
  connectedUser: {
    id: 'connected-user-456',
    email: 'connected@example.com',
    name: 'Connected User',
    username: 'connecteduser',
    avatar_url: '/avatars/connected.png',
    balance: 5000,
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    fixed_issues_count: 2,
  },
  unauthorizedUser: {
    id: 'unauthorized-user-789',
    email: 'unauthorized@example.com',
    name: 'Unauthorized User',
    username: 'unauthorizeduser',
    avatar_url: '/avatars/unauthorized.png',
    balance: 3000,
    created_at: '2024-01-03T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
    fixed_issues_count: 1,
  },
}

/**
 * Mock connection data for testing
 */
export const mockConnections = {
  validConnection: {
    id: 'connection-abc-123',
    primary_user_id: mockUsers.primaryUser.id,
    connected_user_id: mockUsers.connectedUser.id,
    created_at: '2024-01-10T00:00:00Z',
    updated_at: '2024-01-10T00:00:00Z',
  } as ConnectedAccount,
  anotherConnection: {
    id: 'connection-def-456',
    primary_user_id: mockUsers.unauthorizedUser.id,
    connected_user_id: mockUsers.primaryUser.id,
    created_at: '2024-01-11T00:00:00Z',
    updated_at: '2024-01-11T00:00:00Z',
  } as ConnectedAccount,
}

/**
 * Mock session data for authentication testing
 */
export const mockSessions = {
  validSession: {
    user: {
      id: mockUsers.primaryUser.id,
      email: mockUsers.primaryUser.email,
      aud: 'authenticated',
      role: 'authenticated',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    access_token: 'mock-access-token-123',
    refresh_token: 'mock-refresh-token-123',
    expires_in: 3600,
    expires_at: Date.now() + 3600000,
    token_type: 'bearer',
  },
  noSession: null,
  unauthorizedSession: {
    user: {
      id: mockUsers.unauthorizedUser.id,
      email: mockUsers.unauthorizedUser.email,
      aud: 'authenticated',
      role: 'authenticated',
      created_at: '2024-01-03T00:00:00Z',
      updated_at: '2024-01-03T00:00:00Z',
    },
    access_token: 'mock-access-token-789',
    refresh_token: 'mock-refresh-token-789',
    expires_in: 3600,
    expires_at: Date.now() + 3600000,
    token_type: 'bearer',
  },
}

/**
 * Helper function to create mock request body
 */
export function createMockRequestBody(data: {
  connectedAccountId?: string
}): string {
  return JSON.stringify(data)
}

/**
 * Helper function to create expected success response
 */
export function createSuccessResponse() {
  return {
    success: true,
    message: 'Account disconnected successfully',
  }
}

/**
 * Helper function to create expected error response
 */
export function createErrorResponse(error: string) {
  return {
    error,
  }
}