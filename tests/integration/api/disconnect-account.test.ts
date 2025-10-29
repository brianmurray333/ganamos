/**
 * Integration tests for POST /api/disconnect-account endpoint
 * 
 * Tests verify:
 * - Correct disconnection logic (soft unlinking)
 * - Permission enforcement (ownership validation)
 * - Downstream effects on account access
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/disconnect-account/route'
import {
  mockUsers,
  mockConnections,
  mockSessions,
  createMockRequestBody,
  createSuccessResponse,
  createErrorResponse,
} from '@/tests/fixtures/connected-accounts'

// Mock the Supabase client factory
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(),
}))

// Mock Next.js cookies - return a function that returns an empty cookies store
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(() => []),
  })),
}))

// Import the mocked function for assertions
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

// Helper to create mock Supabase client
function createMockSupabaseClient() {
  const mockClient: any = {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(() => mockClient),
    select: vi.fn(() => mockClient),
    delete: vi.fn(() => mockClient),
    eq: vi.fn(() => mockClient),
    single: vi.fn(),
  }
  return mockClient
}

describe('POST /api/disconnect-account', () => {
  let mockSupabaseClient: any

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()

    // Create a fresh mock Supabase client for each test
    mockSupabaseClient = createMockSupabaseClient()

    // Mock createRouteHandlerClient to return our mock client
    vi.mocked(createRouteHandlerClient).mockReturnValue(mockSupabaseClient)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Successful Disconnection', () => {
    it('should successfully disconnect an owned account and return 200', async () => {
      // Arrange: Set up valid session and connection
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: mockSessions.validSession },
        error: null,
      })

      // Mock the SELECT query - .single() returns the connection
      mockSupabaseClient.single.mockResolvedValue({
        data: mockConnections.validConnection,
        error: null,
      })

      // Mock the DELETE query - need to override .eq() for the final call
      // Create a mock delete chain that returns success on final .eq()
      const deleteChain = {
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockSupabaseClient.delete.mockReturnValue(deleteChain)

      const requestBody = createMockRequestBody({
        connectedAccountId: mockUsers.connectedUser.id,
      })

      const request = new NextRequest('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: requestBody,
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // Act: Call the endpoint
      const response = await POST(request)
      const data = await response.json()

      // Assert: Verify success response
      expect(response.status).toBe(200)
      expect(data).toEqual(createSuccessResponse())

      // Verify Supabase calls were made correctly
      expect(mockSupabaseClient.auth.getSession).toHaveBeenCalledTimes(1)
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('connected_accounts')
    })

    it('should preserve both user accounts (soft unlinking)', async () => {
      // Arrange: Set up valid session and connection
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: mockSessions.validSession },
        error: null,
      })

      mockSupabaseClient.single.mockResolvedValue({
        data: mockConnections.validConnection,
        error: null,
      })

      // Mock successful delete
      const deleteChain = {
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockSupabaseClient.delete.mockReturnValue(deleteChain)

      const requestBody = createMockRequestBody({
        connectedAccountId: mockUsers.connectedUser.id,
      })

      const request = new NextRequest('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: requestBody,
      })

      // Act
      const response = await POST(request)

      // Assert: Only the connection should be deleted, not the user accounts
      expect(response.status).toBe(200)
      
      // Verify only connected_accounts table was accessed
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('connected_accounts')
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('profiles')
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('users')
    })
  })

  describe('Permission Enforcement', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Arrange: Mock no session
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })

      const requestBody = createMockRequestBody({
        connectedAccountId: mockUsers.connectedUser.id,
      })

      const request = new NextRequest('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: requestBody,
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(401)
      expect(data).toEqual(createErrorResponse('Unauthorized'))

      // Verify session check was called but no further queries
      expect(mockSupabaseClient.auth.getSession).toHaveBeenCalledTimes(1)
      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
    })

    it('should return 403 when user does not own the connection', async () => {
      // Arrange: User tries to disconnect another user's connection
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: mockSessions.unauthorizedSession },
        error: null,
      })

      // Mock query returns no connection (ownership check fails)
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'No rows found' },
      })

      const requestBody = createMockRequestBody({
        connectedAccountId: mockUsers.connectedUser.id,
      })

      const request = new NextRequest('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: requestBody,
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(403)
      expect(data).toEqual(
        createErrorResponse("You don't have permission to disconnect this account")
      )

      // Verify ownership check was attempted
      expect(mockSupabaseClient.auth.getSession).toHaveBeenCalledTimes(1)
      expect(mockSupabaseClient.select).toHaveBeenCalledTimes(1)
      expect(mockSupabaseClient.single).toHaveBeenCalledTimes(1)
      // Delete should not be called when ownership check fails
      expect(mockSupabaseClient.delete).not.toHaveBeenCalled()
    })

    it('should return 403 when connection does not exist', async () => {
      // Arrange: Valid session but non-existent connection
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: mockSessions.validSession },
        error: null,
      })

      // Mock query returns no connection
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'No rows found' },
      })

      const requestBody = createMockRequestBody({
        connectedAccountId: 'non-existent-user-999',
      })

      const request = new NextRequest('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: requestBody,
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(403)
      expect(data).toEqual(
        createErrorResponse("You don't have permission to disconnect this account")
      )

      // Verify no deletion was attempted
      expect(mockSupabaseClient.delete).not.toHaveBeenCalled()
    })
  })

  describe('Input Validation', () => {
    it('should return 400 when connectedAccountId is missing', async () => {
      // Arrange: Request body without required field
      const requestBody = createMockRequestBody({})

      const request = new NextRequest('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: requestBody,
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data).toEqual(
        createErrorResponse('Connected account ID is required')
      )

      // Verify no Supabase calls were made
      expect(mockSupabaseClient.auth.getSession).not.toHaveBeenCalled()
      expect(mockSupabaseClient.from).not.toHaveBeenCalled()
    })

    it('should return 400 when connectedAccountId is null', async () => {
      // Arrange
      const requestBody = createMockRequestBody({
        connectedAccountId: null as any,
      })

      const request = new NextRequest('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: requestBody,
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data).toEqual(
        createErrorResponse('Connected account ID is required')
      )
    })

    it('should return 400 when connectedAccountId is empty string', async () => {
      // Arrange
      const requestBody = createMockRequestBody({
        connectedAccountId: '',
      })

      const request = new NextRequest('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: requestBody,
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data).toEqual(
        createErrorResponse('Connected account ID is required')
      )
    })
  })

  describe('Error Handling', () => {
    it('should return 500 when database deletion fails', async () => {
      // Arrange: Valid session and connection but deletion fails
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: mockSessions.validSession },
        error: null,
      })

      mockSupabaseClient.single.mockResolvedValue({
        data: mockConnections.validConnection,
        error: null,
      })

      // Mock delete to fail
      const deleteChain = {
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database connection error' } }),
      }
      mockSupabaseClient.delete.mockReturnValue(deleteChain)

      const requestBody = createMockRequestBody({
        connectedAccountId: mockUsers.connectedUser.id,
      })

      const request = new NextRequest('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: requestBody,
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data).toEqual(
        createErrorResponse('Failed to disconnect account')
      )
    })

    it('should return 500 when unexpected error occurs', async () => {
      // Arrange: Session check throws unexpected error
      mockSupabaseClient.auth.getSession.mockRejectedValue(
        new Error('Unexpected server error')
      )

      const requestBody = createMockRequestBody({
        connectedAccountId: mockUsers.connectedUser.id,
      })

      const request = new NextRequest('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: requestBody,
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(500)
      expect(data).toEqual(
        createErrorResponse('An unexpected error occurred')
      )
    })

    it('should handle malformed JSON request body', async () => {
      // Arrange: Invalid JSON
      const request = new NextRequest('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: 'invalid-json{',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert: Should return 500 for unexpected errors
      expect(response.status).toBe(500)
      expect(data).toEqual(
        createErrorResponse('An unexpected error occurred')
      )
    })
  })

  describe('Query Logic Verification', () => {
    it('should use .single() to enforce exactly one connection match', async () => {
      // Arrange
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: mockSessions.validSession },
        error: null,
      })

      mockSupabaseClient.single.mockResolvedValue({
        data: mockConnections.validConnection,
        error: null,
      })

      // Mock successful delete
      const deleteChain = {
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockSupabaseClient.delete.mockReturnValue(deleteChain)

      const requestBody = createMockRequestBody({
        connectedAccountId: mockUsers.connectedUser.id,
      })

      const request = new NextRequest('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: requestBody,
      })

      // Act
      await POST(request)

      // Assert: Verify .single() was called to ensure unique match
      expect(mockSupabaseClient.single).toHaveBeenCalledTimes(1)
    })

    it('should return success message for UI to display', async () => {
      // Arrange
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: mockSessions.validSession },
        error: null,
      })

      mockSupabaseClient.single.mockResolvedValue({
        data: mockConnections.validConnection,
        error: null,
      })

      // Mock successful delete
      const deleteChain = {
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockSupabaseClient.delete.mockReturnValue(deleteChain)

      const requestBody = createMockRequestBody({
        connectedAccountId: mockUsers.connectedUser.id,
      })

      const request = new NextRequest('http://localhost:3000/api/disconnect-account', {
        method: 'POST',
        body: requestBody,
      })

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert: Success response includes message for UI
      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('message')
      expect(data.message).toBe('Account disconnected successfully')
    })
  })
})
