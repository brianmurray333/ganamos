/**
 * Shared test utilities
 *
 * This module re-exports all shared test utilities for easy importing.
 * Import from '@/tests/mocks' or '../../mocks' in test files.
 *
 * Usage:
 *   import { createMockSupabaseClient, TEST_USER_IDS, mockAuthenticatedSession } from '../../mocks'
 */

// Supabase mock utilities
export {
  createMockSupabaseClient,
  createMockQueryBuilder,
  resetMockSupabaseClient,
  createSuccessResponse,
  createErrorResponse,
  createNotFoundResponse,
} from './supabase-mock'

// Test data and factories
export {
  // Constants
  VALID_PET_TYPES,
  TEST_USER_IDS,
  TEST_PROFILES,
  TEST_DEVICES,
  TEST_TRANSACTIONS,
  TEST_CONNECTED_ACCOUNTS,
  // Types
  type PetType,
  // Factories
  createMockProfile,
  createMockDevice,
  createMockTransaction,
  createMockUser,
  createMockSession,
  createMockRequestBody,
  createMockPriceData,
  createTestPostData,
  createVerifyFixRequest,
  createAIResponse,
  createMalformedAIResponse,
  createAIResponseMissingReasoning,
  // Utilities
  createTimestampMinutesAgo,
  createBase64Image,
} from './test-data'

// Authentication helpers
export {
  mockAuthenticatedSession,
  mockUnauthenticatedSession,
  mockAuthError,
  mockAuthSuccessOnce,
  mockAuthFailureOnce,
  createAuthenticatedSessionResponse,
  createUnauthenticatedSessionResponse,
  createGetUserResponse,
  createUnauthenticatedUserResponse,
  // Cookie store mocks
  createMockCookieStore,
  resetMockCookieStore,
} from './auth-mocks'

// Response assertion helpers
export {
  expectSuccessResponse,
  expectErrorResponse,
  expectBadRequest,
  expectUnauthorized,
  expectForbidden,
  expectNotFound,
  expectServerError,
  expectStatus,
  expectAuthChecked,
  expectTableQueried,
} from './response-helpers'

// API/External service mocks
export {
  createMockGroqSDK,
  mockHighConfidenceResponse,
  mockLowConfidenceResponse,
  mockMediumConfidenceResponse,
  mockAIServiceFailure,
  mockMalformedResponse,
  mockResponseMissingReasoning,
  setupGroqMock,
  resetGroqMock,
} from './api-mocks'

// Device registration mocks
export {
  mockAuthSuccess,
  mockAuthFailure,
  mockDeviceFound,
  mockDeviceNotFound,
  mockDeviceInsertSuccess,
  mockDeviceUpdateSuccess,
  mockDatabaseError,
  mockConnectedAccountFound,
  mockConnectedAccountNotFound,
  expectDeviceAuthChecked,
  expectDeviceSuccessResponse,
  expectDeviceErrorResponse,
} from './device-mocks'
