/**
 * Test helpers for Nostr integration tests
 * Provides reusable utilities for creating requests and mock data
 */

import { expect } from 'vitest'

/**
 * Create a POST request for the Nostr publish-post API
 */
export function createNostrPublishRequest(body: Record<string, any>) {
  return new Request('http://localhost:3457/api/nostr/publish-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Create a POST request with a raw body (for testing malformed JSON)
 */
export function createNostrPublishRequestRaw(body: string) {
  return new Request('http://localhost:3457/api/nostr/publish-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

/**
 * Minimal valid request body for Nostr publish
 */
export const minimalValidNostrPost = {
  title: 'Test Issue',
  description: 'Test description',
  postId: 'test-post-id',
}

/**
 * Full request body with all optional fields for Nostr publish
 */
export const fullNostrPost = {
  title: 'Test Issue',
  description: 'Test description',
  location: 'Via Regina',
  city: 'Como',
  latitude: 45.8081,
  longitude: 9.0852,
  reward: 5000,
  postId: 'test-post-id',
  imageUrl: 'https://example.com/image.jpg',
}

/**
 * Default successful mock response for postToNostr
 */
export const mockSuccessfulNostrResponse = {
  success: true,
  eventId: 'mock-event-id',
  relaysPublished: 5,
  relaysFailed: 0,
}

/**
 * Create a mock failure response for postToNostr
 */
export function createMockFailureResponse(error: string) {
  return {
    success: false,
    error,
  }
}

/**
 * Create mock postToNostr parameters for lib/nostr tests
 */
export const createPostToNostrParams = (overrides?: Record<string, any>) => ({
  title: 'Test Issue',
  description: 'Test description',
  reward: 1000,
  postId: 'test-post-id',
  ...overrides,
})

/**
 * Create a POST request for the Nostr setup-profile API
 * (No body needed as profile data is hardcoded)
 */
export function createSetupProfileRequest() {
  return new Request('http://localhost:3457/api/nostr/setup-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Helper to call the publish-post endpoint and return parsed response
 * Reduces boilerplate: request -> response -> data
 */
export async function callPublishPostEndpoint(
  postHandler: (req: Request) => Promise<Response>,
  body: Record<string, any>
) {
  const request = createNostrPublishRequest(body)
  const response = await postHandler(request)
  const data = await response.json()
  return { response, data }
}

/**
 * Helper to call the setup-profile endpoint and return parsed response
 * Reduces boilerplate: request -> response -> data
 */
export async function callSetupProfileEndpoint(
  postHandler: (req: Request) => Promise<Response>
) {
  const request = createSetupProfileRequest()
  const response = await postHandler(request)
  const data = await response.json()
  return { response, data }
}

/**
 * Assert error response structure
 */
export function assertErrorResponse(data: any, expectedStatus?: number, expectedError?: string) {
  expect(data).toHaveProperty('success')
  expect(data).toHaveProperty('error')
  expect(data.success).toBe(false)
  expect(typeof data.error).toBe('string')
  if (expectedError) {
    expect(data.error).toContain(expectedError)
  }
}

/**
 * Assert success response structure for publish-post
 */
export function assertPublishSuccessResponse(data: any) {
  expect(data).toHaveProperty('success')
  expect(data).toHaveProperty('eventId')
  expect(data).toHaveProperty('relaysPublished')
  expect(data.success).toBe(true)
  expect(typeof data.eventId).toBe('string')
  expect(typeof data.relaysPublished).toBe('number')
}
