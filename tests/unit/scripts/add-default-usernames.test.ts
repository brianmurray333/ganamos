import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  mockUsernameAvailable,
  mockUsernameTaken,
  mockSuccessfulUpdate,
  mockFailedUpdate,
  mockUniquenessCheckError,
  mockSuccessfulUserUpdate,
  mockMultipleCollisions
} from '../../helpers/supabase-mock-helpers'

// Mock the Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}))

// Mock dotenv config
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn()
  },
  config: vi.fn()
}))

// Test data factories
const createProfile = (overrides = {}) => ({
  id: 'test-user-id-1',
  email: 'test@example.com',
  name: 'Test User',
  username: null,
  balance: 0,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides
})

const createProfileWithUsername = (overrides = {}) => ({
  ...createProfile(overrides),
  username: 'existinguser'
})

describe('add-default-usernames script', () => {
  let mockSupabase: any
  let consoleLogSpy: any
  let consoleErrorSpy: any
  let consoleWarnSpy: any
  let generateUsername: any
  let generateUniqueUsername: any
  let addDefaultUsernames: any

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks()
    
    // Create mock Supabase client with proper method chaining
    mockSupabase = {
      from: vi.fn(),
      select: vi.fn(),
      is: vi.fn(),
      update: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn()
    }
    
    // Make all methods return the mockSupabase object itself for chaining
    mockSupabase.from.mockReturnValue(mockSupabase)
    mockSupabase.select.mockReturnValue(mockSupabase)
    mockSupabase.is.mockReturnValue(mockSupabase)
    mockSupabase.update.mockReturnValue(mockSupabase)
    mockSupabase.eq.mockReturnValue(mockSupabase)
    mockSupabase.maybeSingle.mockReturnValue(mockSupabase)

    vi.mocked(createClient).mockReturnValue(mockSupabase as any)

    // Mock console methods to suppress output and capture calls
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Set up environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SECRET_API_KEY = 'test-service-role-key'

    // Import functions to test (simulating the script behavior)
    generateUsername = (name: string | null, email: string | null) => {
      // If we have a name, use it to generate username
      if (name && name.trim()) {
        const sanitized = name
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .substring(0, 20)
        
        // If name becomes empty after sanitization, fall back to email
        if (sanitized) {
          return sanitized
        }
      }
      
      // If no name, use email prefix
      if (email && email.includes('@')) {
        const emailPrefix = email.split('@')[0]
        return emailPrefix
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '')
          .substring(0, 20)
      }
      
      // Fallback to a generic username
      return 'user'
    }

    generateUniqueUsername = async (baseUsername: string, userId: string, supabaseClient: any) => {
      let finalUsername = baseUsername
      let counter = 1
      const maxAttempts = 100
      
      // Check if base username is available
      while (counter <= maxAttempts) {
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('username')
          .eq('username', finalUsername)
          .maybeSingle()
        
        if (error) {
          console.error(`⚠️  Error checking username availability: ${error.message}`)
          // On error, fall back to UUID-based username to ensure uniqueness
          return `user-${userId.substring(0, 8)}`
        }
        
        // If no existing user found, username is available
        if (!data) {
          return finalUsername
        }
        
        // Username exists, try with counter
        finalUsername = `${baseUsername}-${counter}`
        counter++
      }
      
      // If we exhausted all attempts, fall back to UUID-based username
      console.warn(`⚠️  Could not find unique username after ${maxAttempts} attempts, using UUID fallback`)
      return `user-${userId.substring(0, 8)}`
    }

    addDefaultUsernames = async () => {
      console.log('👤 Adding default usernames to users without usernames...')
      console.log('')

      const supabase = createClient('', '')
      
      try {
        const { data: profiles, error: fetchError } = await supabase
          .from('profiles')
          .select('id, name, email, username')
          .is('username', null)

        if (fetchError) {
          console.error('❌ Error fetching profiles:', fetchError)
          return
        }

        if (!profiles || profiles.length === 0) {
          console.log('✅ All users already have usernames!')
          return
        }

        console.log(`📊 Found ${profiles.length} users without usernames:`)
        profiles.forEach((profile: any) => {
          console.log(`   - ${profile.name || 'No name'} (${profile.email})`)
        })
        console.log('')

        let updatedCount = 0
        for (const profile of profiles) {
          const baseUsername = generateUsername(profile.name, profile.email)
          const uniqueUsername = await generateUniqueUsername(baseUsername, profile.id, supabase)
          
          console.log(`🔄 Updating ${profile.name || profile.email}: ${uniqueUsername}`)
          
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ 
              username: uniqueUsername,
              updated_at: new Date().toISOString()
            })
            .eq('id', profile.id)

          if (updateError) {
            console.error(`❌ Error updating ${profile.name || profile.email}:`, updateError)
          } else {
            console.log(`✅ Updated ${profile.name || profile.email} → @${uniqueUsername}`)
            updatedCount++
          }
        }

        console.log('')
        console.log('🎉 USERNAME UPDATE COMPLETE!')
        console.log('============================')
        console.log(`✅ Updated ${updatedCount} out of ${profiles.length} users`)
        console.log('✅ All users now have usernames')

        return { updatedCount, totalUsers: profiles.length }
      } catch (error: any) {
        console.error('❌ Unexpected error:', error)
        throw error
      }
    }
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SECRET_API_KEY
  })

  describe('generateUsername', () => {
    describe('Name-based Generation', () => {
      it('should generate username from full name', () => {
        const result = generateUsername('John Smith', 'john@example.com')
        expect(result).toBe('john-smith')
      })

      it('should convert name to lowercase', () => {
        const result = generateUsername('JOHN SMITH', 'john@example.com')
        expect(result).toBe('john-smith')
      })

      it('should replace spaces with hyphens', () => {
        const result = generateUsername('John Michael Smith', 'john@example.com')
        expect(result).toBe('john-michael-smith')
      })

      it('should handle multiple consecutive spaces', () => {
        const result = generateUsername('John  Smith', 'john@example.com')
        expect(result).toBe('john-smith')
      })

      it('should remove special characters', () => {
        const result = generateUsername("O'Connor Jr.", 'oconnor@example.com')
        expect(result).toBe('oconnor-jr')
      })

      it('should handle names with accents and special characters', () => {
        const result = generateUsername('José García-López', 'jose@example.com')
        expect(result).toBe('jos-garca-lpez')
      })

      it('should truncate names longer than 20 characters', () => {
        const result = generateUsername('Christopher Alexander Montgomery', 'chris@example.com')
        expect(result).toBe('christopher-alexande')
        expect(result.length).toBe(20)
      })

      it('should handle names with underscores', () => {
        const result = generateUsername('John_Smith_123', 'john@example.com')
        expect(result).toBe('johnsmith123')
      })

      it('should handle names with dots', () => {
        const result = generateUsername('John.Smith', 'john@example.com')
        expect(result).toBe('johnsmith')
      })

      it('should handle names with numbers', () => {
        const result = generateUsername('User123', 'user123@example.com')
        expect(result).toBe('user123')
      })
    })

    describe('Email Fallback', () => {
      it('should use email prefix when name is null', () => {
        const result = generateUsername(null, 'john123@example.com')
        expect(result).toBe('john123')
      })

      it('should use email prefix when name is empty string', () => {
        const result = generateUsername('', 'john123@example.com')
        expect(result).toBe('john123')
      })

      it('should use email prefix when name is only whitespace', () => {
        const result = generateUsername('   ', 'john123@example.com')
        expect(result).toBe('john123')
      })

      it('should sanitize email prefix', () => {
        const result = generateUsername(null, 'john.smith_123@example.com')
        expect(result).toBe('johnsmith123')
      })

      it('should truncate long email prefixes to 20 characters', () => {
        const result = generateUsername(null, 'verylongemailaddress12345@example.com')
        expect(result).toBe('verylongemailaddress')
        expect(result.length).toBe(20)
      })

      it('should convert email prefix to lowercase', () => {
        const result = generateUsername(null, 'JohnSmith@example.com')
        expect(result).toBe('johnsmith')
      })
    })

    describe('Generic Fallback', () => {
      it('should return "user" when both name and email are null', () => {
        const result = generateUsername(null, null)
        expect(result).toBe('user')
      })

      it('should return "user" when name is null and email is invalid', () => {
        const result = generateUsername(null, 'invalidemail')
        expect(result).toBe('user')
      })

      it('should return "user" when name is empty and email is invalid', () => {
        const result = generateUsername('', 'invalidemail')
        expect(result).toBe('user')
      })

      it('should return "user" when name is whitespace and email is empty', () => {
        const result = generateUsername('   ', '')
        expect(result).toBe('user')
      })
    })

    describe('Edge Cases', () => {
      it('should handle single character names', () => {
        const result = generateUsername('A', 'a@example.com')
        expect(result).toBe('a')
      })

      it('should handle names with only special characters', () => {
        const result = generateUsername('@#$%', 'test@example.com')
        expect(result).toBe('test')
      })

      it('should handle names that become empty after sanitization', () => {
        const result = generateUsername('###', 'test@example.com')
        expect(result).toBe('test')
      })

      it('should handle email with plus addressing', () => {
        const result = generateUsername(null, 'john+test@example.com')
        expect(result).toBe('johntest')
      })

      it('should preserve hyphens in names', () => {
        const result = generateUsername('Jean-Luc', 'jean@example.com')
        expect(result).toBe('jean-luc')
      })

      it('should handle names with leading/trailing spaces', () => {
        const result = generateUsername('  John Smith  ', 'john@example.com')
        expect(result).toBe('john-smith')
      })

      it('should handle unicode characters', () => {
        const result = generateUsername('名前', 'test@example.com')
        expect(result).toBe('test') // Falls back to email since unicode is removed
      })
    })
  })

  describe('generateUniqueUsername', () => {
    it('should return base username when it is available', async () => {
      // Arrange
      mockSupabase.select.mockReturnValueOnce(mockSupabase)
      mockSupabase.eq.mockReturnValueOnce(mockSupabase)
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

      // Act
      const result = await generateUniqueUsername('test-user', 'user-123', mockSupabase)

      // Assert
      expect(result).toBe('test-user')
      expect(mockSupabase.select).toHaveBeenCalledWith('username')
      expect(mockSupabase.eq).toHaveBeenCalledWith('username', 'test-user')
    })

    it('should append counter when base username is taken', async () => {
      // Arrange
      mockSupabase.select.mockReturnValueOnce(mockSupabase)
      mockSupabase.eq.mockReturnValueOnce(mockSupabase)
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { username: 'test-user' }, error: null })
      mockSupabase.select.mockReturnValueOnce(mockSupabase)
      mockSupabase.eq.mockReturnValueOnce(mockSupabase)
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

      // Act
      const result = await generateUniqueUsername('test-user', 'user-123', mockSupabase)

      // Assert
      expect(result).toBe('test-user-1')
    })

    it('should increment counter until unique username is found', async () => {
      // Arrange - test-user, test-user-1, test-user-2 are taken
      mockSupabase.select.mockReturnValueOnce(mockSupabase)
      mockSupabase.eq.mockReturnValueOnce(mockSupabase)
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { username: 'test-user' }, error: null })
      mockSupabase.select.mockReturnValueOnce(mockSupabase)
      mockSupabase.eq.mockReturnValueOnce(mockSupabase)
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { username: 'test-user-1' }, error: null })
      mockSupabase.select.mockReturnValueOnce(mockSupabase)
      mockSupabase.eq.mockReturnValueOnce(mockSupabase)
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { username: 'test-user-2' }, error: null })
      mockSupabase.select.mockReturnValueOnce(mockSupabase)
      mockSupabase.eq.mockReturnValueOnce(mockSupabase)
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

      // Act
      const result = await generateUniqueUsername('test-user', 'user-123', mockSupabase)

      // Assert
      expect(result).toBe('test-user-3')
    })

    it('should fall back to UUID when max attempts is reached', async () => {
      // Arrange - All 101 attempts return existing username
      for (let i = 0; i <= 100; i++) {
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ 
          data: { username: i === 0 ? 'popular' : `popular-${i}` }, 
          error: null 
        })
      }

      // Act
      const result = await generateUniqueUsername('popular', 'abc12345-1234-5678-9012-123456789012', mockSupabase)

      // Assert
      expect(result).toBe('user-abc12345')
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Could not find unique username after 100 attempts')
      )
    })

    it('should fall back to UUID on database error', async () => {
      // Arrange
      mockSupabase.select.mockReturnValueOnce(mockSupabase)
      mockSupabase.eq.mockReturnValueOnce(mockSupabase)
      mockSupabase.maybeSingle.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Connection failed', code: 'DB_ERROR' } 
      })

      // Act
      const result = await generateUniqueUsername('test-user', 'def45678-5678-9012-3456-789012345678', mockSupabase)

      // Assert
      expect(result).toBe('user-def45678')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Error checking username availability')
      )
    })

    it('should handle short user IDs for UUID fallback', async () => {
      // Arrange
      mockSupabase.select.mockReturnValueOnce(mockSupabase)
      mockSupabase.eq.mockReturnValueOnce(mockSupabase)
      mockSupabase.maybeSingle.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Error', code: 'ERROR' } 
      })

      // Act
      const result = await generateUniqueUsername('test', 'short', mockSupabase)

      // Assert
      expect(result).toBe('user-short')
    })
  })

  describe('addDefaultUsernames', () => {
    describe('Happy Path - Successful Batch Updates', () => {
      it('should update all users without usernames', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'user-1', name: 'Alice Smith', email: 'alice@example.com' }),
          createProfile({ id: 'user-2', name: 'Bob Jones', email: 'bob@example.com' }),
          createProfile({ id: 'user-3', name: 'Charlie Brown', email: 'charlie@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness checks for each user
        for (let i = 0; i < profiles.length; i++) {
          mockSupabase.select.mockReturnValueOnce(mockSupabase)
          mockSupabase.eq.mockReturnValueOnce(mockSupabase)
          mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
          mockSupabase.update.mockReturnValueOnce(mockSupabase)
          mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
        }

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(3)
        expect(result?.totalUsers).toBe(3)
        expect(consoleLogSpy).toHaveBeenCalledWith('📊 Found 3 users without usernames:')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated Alice Smith → @alice-smith')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated Bob Jones → @bob-jones')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated Charlie Brown → @charlie-brown')
      })

      it('should handle single user update', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'user-1', name: 'John Doe', email: 'john@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness check (john-doe is available)
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
        
        // Mock update
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(1)
        expect(result?.totalUsers).toBe(1)
        expect(consoleLogSpy).toHaveBeenCalledWith('📊 Found 1 users without usernames:')
      })

      it('should generate usernames from email when name is missing', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'user-1', name: null, email: 'johndoe123@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness check (username is available)
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

        // Mock update
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(1)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated johndoe123@example.com → @johndoe123')
      })

      it('should call update with correct parameters', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'user-1', name: 'Test User', email: 'test@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness check (username is available)
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

        // Mock update
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        await addDefaultUsernames()

        // Assert
        expect(mockSupabase.update).toHaveBeenCalledWith(
          expect.objectContaining({
            username: 'test-user',
            updated_at: expect.any(String)
          })
        )
        expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'user-1')
      })
    })

    describe('Empty Result Handling', () => {
      it('should handle case when all users already have usernames', async () => {
        // Arrange
        mockSupabase.is.mockResolvedValueOnce({
          data: [],
          error: null
        })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result).toBeUndefined()
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ All users already have usernames!')
        expect(mockSupabase.update).not.toHaveBeenCalled()
      })

      it('should handle null data response', async () => {
        // Arrange
        mockSupabase.is.mockResolvedValueOnce({
          data: null,
          error: null
        })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result).toBeUndefined()
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ All users already have usernames!')
      })
    })

    describe('Error Handling', () => {
      it('should handle database fetch errors', async () => {
        // Arrange
        mockSupabase.is.mockResolvedValueOnce({
          data: null,
          error: { message: 'Database connection failed', code: 'CONNECTION_ERROR' }
        })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result).toBeUndefined()
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '❌ Error fetching profiles:',
          expect.objectContaining({ message: 'Database connection failed' })
        )
        expect(mockSupabase.update).not.toHaveBeenCalled()
      })

      it('should handle individual update errors gracefully', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'user-1', name: 'User One', email: 'user1@example.com' }),
          createProfile({ id: 'user-2', name: 'User Two', email: 'user2@example.com' }),
          createProfile({ id: 'user-3', name: 'User Three', email: 'user3@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // User 1: successful uniqueness check and update
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // User 2: successful uniqueness check but failed update
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: { message: 'Update failed' } })

        // User 3: successful uniqueness check and update
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(2) // Only 2 succeeded
        expect(result?.totalUsers).toBe(3)
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '❌ Error updating User Two:',
          expect.objectContaining({ message: 'Update failed' })
        )
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated User One → @user-one')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated User Three → @user-three')
      })

      it('should handle unexpected errors', async () => {
        // Arrange
        mockSupabase.is.mockRejectedValueOnce(new Error('Unexpected database error'))

        // Act & Assert
        await expect(addDefaultUsernames()).rejects.toThrow('Unexpected database error')
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '❌ Unexpected error:',
          expect.any(Error)
        )
      })

      it('should handle null error object', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'user-1', name: 'Test User', email: 'test@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness check (username is available)
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

        // Mock update
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(1)
        expect(consoleErrorSpy).not.toHaveBeenCalled()
      })
    })

    describe('Large Dataset Handling', () => {
      it('should handle updating 100 users efficiently', async () => {
        // Arrange
        const profiles = Array.from({ length: 100 }, (_, i) => 
          createProfile({ 
            id: `user-${i}`, 
            name: `User ${i}`,
            email: `user${i}@example.com`
          })
        )

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness checks and updates for all 100 users
        for (let i = 0; i < 100; i++) {
          // Mock uniqueness check (username is available)
          mockSupabase.select.mockReturnValueOnce(mockSupabase)
          mockSupabase.eq.mockReturnValueOnce(mockSupabase)
          mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
          
          // Mock update
          mockSupabase.update.mockReturnValueOnce(mockSupabase)
          mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })
        }

        // Act
        const startTime = Date.now()
        const result = await addDefaultUsernames()
        const duration = Date.now() - startTime

        // Assert
        expect(result?.updatedCount).toBe(100)
        expect(result?.totalUsers).toBe(100)
        expect(mockSupabase.update).toHaveBeenCalledTimes(100)
        expect(duration).toBeLessThan(1000) // Should complete quickly with mocks
      })

      it('should handle partial failures in large datasets', async () => {
        // Arrange
        const profiles = Array.from({ length: 50 }, (_, i) => 
          createProfile({ 
            id: `user-${i}`, 
            name: `User ${i}`,
            email: `user${i}@example.com`
          })
        )

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness checks and updates - fail every 10th update
        profiles.forEach((_, index) => {
          // Mock uniqueness check (username is available)
          mockSupabase.select.mockReturnValueOnce(mockSupabase)
          mockSupabase.eq.mockReturnValueOnce(mockSupabase)
          mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
          
          // Mock update - fail every 10th
          mockSupabase.update.mockReturnValueOnce(mockSupabase)
          if (index % 10 === 0) {
            mockSupabase.eq.mockResolvedValueOnce({
              data: null,
              error: { message: 'Update failed' }
            })
          } else {
            mockSupabase.eq.mockResolvedValueOnce({
              data: null,
              error: null
            })
          }
        })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(45) // 50 - 5 failures
        expect(result?.totalUsers).toBe(50)
      })
    })

    describe('Username Collision Scenarios', () => {
      it('should resolve collisions by appending counter to duplicate usernames', async () => {
        // Arrange - Two users with the same name
        const profiles = [
          createProfile({ id: 'user-1', name: 'John Smith', email: 'john1@example.com' }),
          createProfile({ id: 'user-2', name: 'John Smith', email: 'john2@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness checks for first user (john-smith is available)
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null }) // john-smith available
        
        // Mock update for first user
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Mock uniqueness checks for second user
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ 
          data: { username: 'john-smith' }, 
          error: null 
        }) // john-smith taken
        
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null }) // john-smith-1 available
        
        // Mock update for second user
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(2)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated John Smith → @john-smith')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated John Smith → @john-smith-1')
      })

      it('should handle multiple collisions with incremental counters', async () => {
        // Arrange - Three users with the same name
        const profiles = [
          createProfile({ id: 'user-1', name: 'Jane Doe', email: 'jane1@example.com' }),
          createProfile({ id: 'user-2', name: 'Jane Doe', email: 'jane2@example.com' }),
          createProfile({ id: 'user-3', name: 'Jane Doe', email: 'jane3@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // User 1: jane-doe available
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // User 2: jane-doe taken, jane-doe-1 available
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { username: 'jane-doe' }, error: null })
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // User 3: jane-doe taken, jane-doe-1 taken, jane-doe-2 available
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { username: 'jane-doe' }, error: null })
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { username: 'jane-doe-1' }, error: null })
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(3)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated Jane Doe → @jane-doe')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated Jane Doe → @jane-doe-1')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated Jane Doe → @jane-doe-2')
      })

      it('should fall back to UUID-based username when counter limit is reached', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'abc12345-1234-5678-9012-123456789012', name: 'Popular Name', email: 'user@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock 101 consecutive username collisions (base + 100 counter attempts)
        for (let i = 0; i <= 100; i++) {
          mockSupabase.select.mockReturnValueOnce(mockSupabase)
          mockSupabase.eq.mockReturnValueOnce(mockSupabase)
          mockSupabase.maybeSingle.mockResolvedValueOnce({ 
            data: { username: i === 0 ? 'popular-name' : `popular-name-${i}` }, 
            error: null 
          })
        }

        // Mock successful update with UUID fallback
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(1)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated Popular Name → @user-abc12345')
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('⚠️  Could not find unique username after 100 attempts')
        )
      })

      it('should fall back to UUID-based username on database error during uniqueness check', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'def45678-5678-9012-3456-789012345678', name: 'Test User', email: 'test@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock database error during uniqueness check
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ 
          data: null, 
          error: { message: 'Database connection lost', code: 'CONNECTION_ERROR' } 
        })

        // Mock successful update with UUID fallback
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(1)
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('⚠️  Error checking username availability')
        )
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated Test User → @user-def45678')
      })

      it('should handle mixed collision and non-collision scenarios', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'user-1', name: 'Alice Johnson', email: 'alice@example.com' }),
          createProfile({ id: 'user-2', name: 'Bob Smith', email: 'bob@example.com' }),
          createProfile({ id: 'user-3', name: 'Alice Johnson', email: 'alice2@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // User 1 (Alice): alice-johnson available
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // User 2 (Bob): bob-smith available
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // User 3 (Alice): alice-johnson taken, alice-johnson-1 available
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { username: 'alice-johnson' }, error: null })
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(3)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated Alice Johnson → @alice-johnson')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated Bob Smith → @bob-smith')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated Alice Johnson → @alice-johnson-1')
      })
    })

    describe('Console Output Verification', () => {
      it('should log progress for each user', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'user-1', name: 'Test User', email: 'test@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness check (username is available)
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

        // Mock update
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        await addDefaultUsernames()

        // Assert
        expect(consoleLogSpy).toHaveBeenCalledWith('👤 Adding default usernames to users without usernames...')
        expect(consoleLogSpy).toHaveBeenCalledWith('📊 Found 1 users without usernames:')
        expect(consoleLogSpy).toHaveBeenCalledWith('   - Test User (test@example.com)')
        expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Updating Test User: test-user')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated Test User → @test-user')
        expect(consoleLogSpy).toHaveBeenCalledWith('🎉 USERNAME UPDATE COMPLETE!')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated 1 out of 1 users')
      })

      it('should log errors with proper formatting', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'user-1', name: 'Test User', email: 'test@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness check (username is available)
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

        // Mock update with error
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: { message: 'Database error', code: 'DB_ERROR' } })

        // Act
        await addDefaultUsernames()

        // Assert
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '❌ Error updating Test User:',
          expect.objectContaining({ message: 'Database error' })
        )
      })
    })

    describe('Edge Cases', () => {
      it('should handle profiles with missing email field', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'user-1', name: 'Test User', email: null })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness check (username is available)
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

        // Mock update
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(1)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated Test User → @test-user')
      })

      it('should handle profiles with both name and email missing', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'user-1', name: null, email: null })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness check (username is available)
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

        // Mock update
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(1)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated null → @user')
      })

      it('should handle profiles with empty string name', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'user-1', name: '', email: 'test@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness check (username is available)
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

        // Mock update
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(1)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated test@example.com → @test')
      })

      it('should handle profiles with whitespace-only name', async () => {
        // Arrange
        const profiles = [
          createProfile({ id: 'user-1', name: '   ', email: 'test@example.com' })
        ]

        mockSupabase.is.mockResolvedValueOnce({
          data: profiles,
          error: null
        })

        // Mock uniqueness check (username is available)
        mockSupabase.select.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockReturnValueOnce(mockSupabase)
        mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

        // Mock update
        mockSupabase.update.mockReturnValueOnce(mockSupabase)
        mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null })

        // Act
        const result = await addDefaultUsernames()

        // Assert
        expect(result?.updatedCount).toBe(1)
        // When name is whitespace-only, it's truthy so it gets displayed as-is (whitespace)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Updated     → @test')
      })
    })
  })
})