import { vi } from 'vitest'

// Mock environment variables for testing
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-key-minimum-32-characters-long'
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id'
process.env.CSRF_SECRET = 'test-csrf-secret-key'

// Mock Cloudflare Workers environment
globalThis.MINIFLARE = true

// Global test utilities
globalThis.testUtils = {
  // Mock Google OAuth payload
  mockGooglePayload: {
    sub: 'mock_google_id_12345',
    email: 'new.user@test.com',
    email_verified: true,
    name: 'New Test User',
    picture: 'https://example.com/new_user_avatar.jpg',
    aud: 'test-google-client-id',
    iss: 'accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iat: Math.floor(Date.now() / 1000)
  },
  
  // Mock existing user payload
  mockExistingUserPayload: {
    sub: 'mock_google_id_67890',
    email: 'existing.user@test.com',
    email_verified: true,
    name: 'Existing Test User',
    picture: 'https://example.com/existing_user_avatar.jpg',
    aud: 'test-google-client-id',
    iss: 'accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000)
  }
}

// Mock console methods for cleaner test output
if (process.env.NODE_ENV === 'test') {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
}