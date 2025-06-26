'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'
import Cookies from 'js-cookie'

// Types for authentication state
export interface User {
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
}

export interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
  
  // Authentication methods
  login: () => void
  logout: () => Promise<void>
  refreshToken: () => Promise<void>
  clearError: () => void
  
  // Security features
  getFingerprint: () => string
  isTokenExpiringSoon: () => boolean
}

// Authentication context
const AuthContext = createContext<AuthState | null>(null)

// Cookie configuration for secure token storage
const TOKEN_COOKIE_NAME = 'auth_token'
const TOKEN_EXPIRY_COOKIE_NAME = 'auth_token_expiry'
const COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  expires: 7 // 7 days
}

// API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

// Generate device fingerprint for security
function generateDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'server-side'
  
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx?.fillText('fingerprint', 10, 10)
  
  const fingerprint = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screen: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    canvas: canvas.toDataURL()
  }
  
  return btoa(JSON.stringify(fingerprint)).slice(0, 32)
}

// Secure token storage utilities
const TokenStorage = {
  set: (token: string, expiresAt: number) => {
    Cookies.set(TOKEN_COOKIE_NAME, token, COOKIE_OPTIONS)
    Cookies.set(TOKEN_EXPIRY_COOKIE_NAME, expiresAt.toString(), COOKIE_OPTIONS)
  },
  
  get: (): { token: string | null; expiresAt: number | null } => {
    const token = Cookies.get(TOKEN_COOKIE_NAME)
    const expiresAtStr = Cookies.get(TOKEN_EXPIRY_COOKIE_NAME)
    const expiresAt = expiresAtStr ? parseInt(expiresAtStr) : null
    
    return { token: token || null, expiresAt }
  },
  
  remove: () => {
    Cookies.remove(TOKEN_COOKIE_NAME)
    Cookies.remove(TOKEN_EXPIRY_COOKIE_NAME)
  },
  
  isExpired: (): boolean => {
    const { expiresAt } = TokenStorage.get()
    if (!expiresAt) return true
    
    // Consider token expired if it expires within 5 minutes
    return Date.now() >= (expiresAt * 1000) - (5 * 60 * 1000)
  },
  
  isExpiringSoon: (): boolean => {
    const { expiresAt } = TokenStorage.get()
    if (!expiresAt) return false
    
    // Consider token expiring soon if it expires within 30 minutes
    return Date.now() >= (expiresAt * 1000) - (30 * 60 * 1000)
  }
}

// API client with authentication
class AuthAPIClient {
  private baseURL: string
  
  constructor(baseURL: string) {
    this.baseURL = baseURL
  }
  
  private getHeaders(includeAuth = true): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    }
    
    if (includeAuth) {
      const { token } = TokenStorage.get()
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
    }
    
    return headers
  }
  
  async authenticate(googleToken: string): Promise<{
    jwt: string
    user: User
    session: { expiresAt: number }
  }> {
    const response = await fetch(`${this.baseURL}/api/v1/auth/google/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fingerprint': generateDeviceFingerprint()
      },
      body: JSON.stringify({
        token: googleToken,
        fingerprint: generateDeviceFingerprint(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.details || 'Authentication failed')
    }
    
    return response.json()
  }
  
  async refreshToken(): Promise<{
    jwt: string
    expiresAt: number
  }> {
    const { token } = TokenStorage.get()
    if (!token) {
      throw new Error('No token to refresh')
    }
    
    const response = await fetch(`${this.baseURL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: this.getHeaders(false),
      body: JSON.stringify({ token })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.details || 'Token refresh failed')
    }
    
    return response.json()
  }
  
  async logout(): Promise<void> {
    const response = await fetch(`${this.baseURL}/api/v1/protected/auth/logout`, {
      method: 'POST',
      headers: this.getHeaders()
    })
    
    if (!response.ok) {
      console.warn('Logout API call failed, but continuing with local logout')
    }
  }
  
  async getProfile(): Promise<{ profile: User }> {
    const response = await fetch(`${this.baseURL}/api/v1/protected/profile`, {
      headers: this.getHeaders()
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.details || 'Failed to fetch profile')
    }
    
    return response.json()
  }
}

// Authentication provider component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const apiClient = new AuthAPIClient(API_BASE_URL)
  
  // Initialize authentication state
  useEffect(() => {
    initializeAuth()
  }, [])
  
  // Set up token refresh interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (TokenStorage.isExpiringSoon() && user) {
        refreshToken()
      }
    }, 5 * 60 * 1000) // Check every 5 minutes
    
    return () => clearInterval(interval)
  }, [user])
  
  const initializeAuth = async () => {
    try {
      const { token } = TokenStorage.get()
      
      if (!token || TokenStorage.isExpired()) {
        setIsLoading(false)
        return
      }
      
      // Verify token by fetching user profile
      const { profile } = await apiClient.getProfile()
      setUser(profile)
      
    } catch (error) {
      console.error('Auth initialization failed:', error)
      TokenStorage.remove()
      setError('Session expired. Please log in again.')
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleGoogleSuccess = async (tokenResponse: any) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const authResult = await apiClient.authenticate(tokenResponse.access_token)
      
      // Store token securely
      TokenStorage.set(authResult.jwt, authResult.session.expiresAt)
      
      // Set user state
      setUser(authResult.user)
      
    } catch (error) {
      console.error('Authentication failed:', error)
      setError(error instanceof Error ? error.message : 'Authentication failed')
      TokenStorage.remove()
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleGoogleError = () => {
    setError('Google authentication was cancelled or failed')
    setIsLoading(false)
  }
  
  const googleLogin = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: handleGoogleError,
    scope: 'openid email profile'
  })
  
  const login = useCallback(() => {
    setError(null)
    setIsLoading(true)
    googleLogin()
  }, [googleLogin])
  
  const logout = useCallback(async () => {
    setIsLoading(true)
    
    try {
      // Call logout API to revoke token
      await apiClient.logout()
    } catch (error) {
      console.warn('Logout API call failed:', error)
    }
    
    // Clear local state regardless of API response
    TokenStorage.remove()
    setUser(null)
    setError(null)
    setIsLoading(false)
  }, [])
  
  const refreshToken = useCallback(async () => {
    try {
      const result = await apiClient.refreshToken()
      TokenStorage.set(result.jwt, result.expiresAt)
      
      // Refresh user profile to get latest data
      const { profile } = await apiClient.getProfile()
      setUser(profile)
      
    } catch (error) {
      console.error('Token refresh failed:', error)
      logout()
    }
  }, [logout])
  
  const clearError = useCallback(() => {
    setError(null)
  }, [])
  
  const getFingerprint = useCallback(() => {
    return generateDeviceFingerprint()
  }, [])
  
  const isTokenExpiringSoon = useCallback(() => {
    return TokenStorage.isExpiringSoon()
  }, [])
  
  const authState: AuthState = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    logout,
    refreshToken,
    clearError,
    getFingerprint,
    isTokenExpiringSoon
  }
  
  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  )
}

// Authentication wrapper with Google OAuth provider
export function AuthWrapper({ 
  children,
  googleClientId 
}: { 
  children: React.ReactNode
  googleClientId: string
}) {
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </GoogleOAuthProvider>
  )
}

// Hook to use authentication context
export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  
  return context
}

// Higher-order component for protected routes
export function withAuth<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  return function AuthenticatedComponent(props: P) {
    const { isAuthenticated, isLoading, user } = useAuth()
    
    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      )
    }
    
    if (!isAuthenticated || !user) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-4">Authentication Required</h2>
            <p className="text-gray-600">Please log in to access this page.</p>
          </div>
        </div>
      )
    }
    
    return <Component {...props} />
  }
}

// Hook for role-based access control
export function useRoleAccess(requiredRole: string): boolean {
  const { user } = useAuth()
  
  if (!user) return false
  
  return user.roles.some(role => 
    role.role === requiredRole || 
    role.role === 'MASTER_ADMIN' // Master admin has access to everything
  )
}

// Hook for context-based access control
export function useContextAccess(contextId: string): boolean {
  const { user } = useAuth()
  
  if (!user) return false
  
  return user.roles.some(role => 
    role.contextId === contextId || 
    role.role === 'MASTER_ADMIN'
  )
}