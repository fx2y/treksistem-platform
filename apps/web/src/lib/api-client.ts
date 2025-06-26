import { CSRFTokenManager, NetworkSecurity } from '@/utils/security'

// API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

// Custom error classes
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: any
  ) {
    super(message)
    this.name = 'APIError'
  }
}

export class AuthenticationError extends APIError {
  constructor(message: string, details?: any) {
    super(message, 401, 'authentication_error', details)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends APIError {
  constructor(message: string, details?: any) {
    super(message, 403, 'authorization_error', details)
    this.name = 'AuthorizationError'
  }
}

export class RateLimitError extends APIError {
  constructor(message: string, retryAfter?: number) {
    super(message, 429, 'rate_limit_error', { retryAfter })
    this.name = 'RateLimitError'
  }
}

// API client class
export class APIClient {
  private baseURL: string
  private defaultHeaders: Record<string, string>

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    }
  }

  /**
   * Get authentication headers
   */
  private getAuthHeaders(): Record<string, string> {
    const token = this.getStoredToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  /**
   * Get stored authentication token
   */
  private getStoredToken(): string | null {
    if (typeof window === 'undefined') return null
    
    try {
      // Get token from cookie (set by AuthContext)
      const cookies = document.cookie.split(';')
      const tokenCookie = cookies.find(cookie => 
        cookie.trim().startsWith('auth_token=')
      )
      
      if (tokenCookie) {
        return tokenCookie.split('=')[1]
      }
      
      return null
    } catch (error) {
      console.warn('Failed to get stored token:', error)
      return null
    }
  }

  /**
   * Make authenticated request
   */
  private async request<T>(
    endpoint: string, 
    options: RequestInit = {},
    requireAuth: boolean = false
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`

    // Validate URL for security
    if (!NetworkSecurity.isSecureURL(url)) {
      throw new APIError('Invalid or insecure URL', 400, 'invalid_url')
    }

    // Prepare headers
    const headers = {
      ...this.defaultHeaders,
      ...CSRFTokenManager.getHeaders(),
      ...(requireAuth ? this.getAuthHeaders() : {}),
      ...options.headers
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include', // Include cookies for authentication
      })

      // Handle response
      if (!response.ok) {
        await this.handleErrorResponse(response)
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('application/json')) {
        return null as T
      }

      return await response.json()
    } catch (error) {
      if (error instanceof APIError) {
        throw error
      }
      
      // Network or parsing error
      throw new APIError(
        'Network request failed',
        0,
        'network_error',
        { originalError: error.message }
      )
    }
  }

  /**
   * Handle error responses
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: any = {}
    
    try {
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        errorData = await response.json()
      }
    } catch {
      // Ignore JSON parsing errors
    }

    const message = errorData.details || errorData.message || 'Request failed'
    const code = errorData.error || 'unknown_error'

    switch (response.status) {
      case 401:
        throw new AuthenticationError(message, errorData)
      case 403:
        throw new AuthorizationError(message, errorData)
      case 429:
        throw new RateLimitError(message, errorData.retryAfter)
      default:
        throw new APIError(message, response.status, code, errorData)
    }
  }

  // Public API methods

  /**
   * GET request
   */
  async get<T>(endpoint: string, requireAuth: boolean = false): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' }, requireAuth)
  }

  /**
   * POST request
   */
  async post<T>(
    endpoint: string, 
    data?: any, 
    requireAuth: boolean = false
  ): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: 'POST',
        body: data ? JSON.stringify(data) : undefined
      },
      requireAuth
    )
  }

  /**
   * PUT request
   */
  async put<T>(
    endpoint: string, 
    data?: any, 
    requireAuth: boolean = true
  ): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: 'PUT',
        body: data ? JSON.stringify(data) : undefined
      },
      requireAuth
    )
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, requireAuth: boolean = true): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' }, requireAuth)
  }

  /**
   * PATCH request
   */
  async patch<T>(
    endpoint: string, 
    data?: any, 
    requireAuth: boolean = true
  ): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: 'PATCH',
        body: data ? JSON.stringify(data) : undefined
      },
      requireAuth
    )
  }
}

// Create default API client instance
export const apiClient = new APIClient()

// Convenience methods for common endpoints
export const api = {
  // Public endpoints
  health: () => apiClient.get('/api/v1/ping'),
  dbHealth: () => apiClient.get('/api/v1/db-health'),
  
  // Authentication endpoints
  auth: {
    googleCallback: (token: string, fingerprint?: string) =>
      apiClient.post('/api/v1/auth/google/callback', { 
        token, 
        fingerprint,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }),
    refresh: (token: string) =>
      apiClient.post('/api/v1/auth/refresh', { token }),
    revoke: (token: string, reason?: string) =>
      apiClient.post('/api/v1/auth/revoke', { token, reason }),
    health: () => apiClient.get('/api/v1/auth/health')
  },

  // Protected endpoints
  protected: {
    profile: () => apiClient.get('/api/v1/protected/profile', true),
    logout: () => apiClient.post('/api/v1/protected/auth/logout', undefined, true),
    
    // System endpoints
    system: {
      health: () => apiClient.get('/api/v1/protected/system/health', true),
      metrics: () => apiClient.get('/api/v1/protected/system/metrics', true),
      cleanup: () => apiClient.post('/api/v1/protected/system/cleanup', undefined, true)
    },

    // Admin endpoints
    admin: {
      users: () => apiClient.get('/api/v1/protected/admin/users', true)
    }
  }
}

// Response types for type safety
export interface HealthResponse {
  pong: boolean
  timestamp: number
  version: string
}

export interface AuthResponse {
  jwt: string
  user: {
    id: string
    email: string
    name: string
    picture: string
    roles: Array<{
      role: string
      contextId: string | null
      grantedAt: number
      grantedBy: string
    }>
  }
  session: {
    expiresAt: number
    refreshable: boolean
  }
}

export interface ProfileResponse {
  profile: {
    id: string
    email: string
    name: string
    picture: string
    roles: Array<{
      role: string
      contextId: string | null
      grantedAt: number
      grantedBy: string
    }>
    emailVerified: boolean
    lastActivity: number
  }
}

export interface SystemHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: number
  checks: {
    database: { status: 'ok' | 'error'; responseTime?: number; error?: string }
    jwt: { status: 'ok' | 'error'; error?: string }
    memory: { status: 'ok' | 'warning' | 'error'; usage?: number }
  }
}

export default apiClient