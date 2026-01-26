/**
 * Helper functions for mocking Supabase client in unit tests
 */

/**
 * Mock a successful uniqueness check (username is available)
 */
export function mockUsernameAvailable(mockSupabase: any) {
  mockSupabase.select.mockReturnValueOnce(mockSupabase)
  mockSupabase.eq.mockReturnValueOnce(mockSupabase)
  mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
}

/**
 * Mock a uniqueness check showing username is taken
 */
export function mockUsernameTaken(mockSupabase: any, takenUsername: string) {
  mockSupabase.select.mockReturnValueOnce(mockSupabase)
  mockSupabase.eq.mockReturnValueOnce(mockSupabase)
  mockSupabase.maybeSingle.mockResolvedValueOnce({ 
    data: { username: takenUsername }, 
    error: null 
  })
}

/**
 * Mock a successful update operation
 */
export function mockSuccessfulUpdate(mockSupabase: any) {
  mockSupabase.update.mockReturnValueOnce(mockSupabase)
  mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
}

/**
 * Mock a failed update operation
 */
export function mockFailedUpdate(mockSupabase: any, errorMessage: string) {
  mockSupabase.update.mockReturnValueOnce(mockSupabase)
  mockSupabase.eq.mockResolvedValueOnce({ 
    data: null, 
    error: { message: errorMessage } 
  })
}

/**
 * Mock a database error during uniqueness check
 */
export function mockUniquenessCheckError(mockSupabase: any, errorMessage: string, errorCode: string = 'DB_ERROR') {
  mockSupabase.select.mockReturnValueOnce(mockSupabase)
  mockSupabase.eq.mockResolvedValueOnce({ 
    data: null, 
    error: { message: errorMessage, code: errorCode } 
  })
}

/**
 * Mock a complete successful user update flow (uniqueness check + update)
 */
export function mockSuccessfulUserUpdate(mockSupabase: any) {
  mockUsernameAvailable(mockSupabase)
  mockSuccessfulUpdate(mockSupabase)
}

/**
 * Mock multiple username collision attempts before finding an available one
 * @param mockSupabase - The mock Supabase client
 * @param baseUsername - The base username that's taken
 * @param collisionCount - Number of collisions before finding available username
 */
export function mockMultipleCollisions(mockSupabase: any, baseUsername: string, collisionCount: number) {
  // Mock base username as taken
  mockUsernameTaken(mockSupabase, baseUsername)
  
  // Mock counter-suffixed usernames as taken
  for (let i = 1; i < collisionCount; i++) {
    mockUsernameTaken(mockSupabase, `${baseUsername}-${i}`)
  }
  
  // Mock the finally available username
  mockUsernameAvailable(mockSupabase)
}
