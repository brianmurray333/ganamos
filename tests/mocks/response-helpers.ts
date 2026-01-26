import { expect } from 'vitest'

/**
 * Response assertion helpers
 * Common patterns for verifying API responses in tests
 */

/**
 * Assert a successful JSON response
 * Returns the parsed response data for further assertions
 */
export async function expectSuccessResponse(
  response: Response,
  expectedFields?: Record<string, any>
): Promise<any> {
  expect(response.status).toBe(200)
  const data = await response.json()
  expect(data.success).toBe(true)

  if (expectedFields) {
    Object.entries(expectedFields).forEach(([key, value]) => {
      expect(data[key]).toEqual(value)
    })
  }

  return data
}

/**
 * Assert an error response with specific status code
 * Returns the parsed response data for further assertions
 */
export async function expectErrorResponse(
  response: Response,
  expectedStatus: number,
  expectedError?: string
): Promise<any> {
  expect(response.status).toBe(expectedStatus)
  const data = await response.json()
  expect(data.success).toBe(false)
  expect(data.error).toBeDefined()

  if (expectedError) {
    expect(data.error).toContain(expectedError)
  }

  return data
}

/**
 * Assert a 400 Bad Request response
 */
export async function expectBadRequest(response: Response, errorMessage?: string): Promise<any> {
  return expectErrorResponse(response, 400, errorMessage)
}

/**
 * Assert a 401 Unauthorized response
 */
export async function expectUnauthorized(response: Response, errorMessage?: string): Promise<any> {
  return expectErrorResponse(response, 401, errorMessage)
}

/**
 * Assert a 403 Forbidden response
 */
export async function expectForbidden(response: Response, errorMessage?: string): Promise<any> {
  return expectErrorResponse(response, 403, errorMessage)
}

/**
 * Assert a 404 Not Found response
 */
export async function expectNotFound(response: Response, errorMessage?: string): Promise<any> {
  return expectErrorResponse(response, 404, errorMessage)
}

/**
 * Assert a 500 Internal Server Error response
 */
export async function expectServerError(response: Response, errorMessage?: string): Promise<any> {
  return expectErrorResponse(response, 500, errorMessage)
}

/**
 * Assert response has specific status code (without parsing body)
 */
export function expectStatus(response: Response, expectedStatus: number) {
  expect(response.status).toBe(expectedStatus)
}

/**
 * Assert authentication was checked on mock client
 */
export function expectAuthChecked(mockSupabaseClient: any) {
  expect(mockSupabaseClient.auth.getSession).toHaveBeenCalled()
}

/**
 * Assert a database table was queried
 */
export function expectTableQueried(mockSupabaseClient: any, tableName: string) {
  expect(mockSupabaseClient.from).toHaveBeenCalledWith(tableName)
}
