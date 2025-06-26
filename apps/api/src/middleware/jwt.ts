import type { Context, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createJWTService, type UserSession } from '../services/jwt.service'
import { createMonitoringService } from '../services/monitoring.service'
import { getClientIP } from './security'
import type { createDb } from '@treksistem/db'

// Environment bindings interface for JWT
interface JWTEnv {
  DB: D1Database
  JWT_SECRET: string
}

// Extended context with user session
export interface AuthenticatedContext {
  user: UserSession
  isAuthenticated: true
}

// JWT extraction helper
function extractJWTFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null
  }

  // Support both "Bearer <token>" and just "<token>" formats
  const parts = authHeader.split(' ')
  
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1]
  }
  
  if (parts.length === 1) {
    return parts[0]
  }
  
  return null
}

// JWT verification middleware factory
export function createJWTMiddleware(options: {
  required?: boolean // If false, middleware will not throw for missing tokens
  skipPaths?: string[] // Paths to skip JWT verification
  updateActivity?: boolean // Whether to update user's last activity
} = {}): MiddlewareHandler<{ Bindings: JWTEnv }> {
  const {
    required = true,
    skipPaths = [],
    updateActivity = true
  } = options

  return async (c: Context, next) => {
    // Skip JWT verification for specified paths
    if (skipPaths.some(path => c.req.path.includes(path))) {
      await next()
      return
    }

    const authHeader = c.req.header('Authorization')
    const token = extractJWTFromHeader(authHeader)

    // Handle missing token based on requirements
    if (!token) {
      if (!required) {
        // Optional authentication - continue without user context
        await next()
        return
      }

      throw new HTTPException(401, {
        message: JSON.stringify({
          error: 'missing_token',
          details: 'Authorization header with JWT token is required'
        })
      })
    }

    try {
      // Initialize services
      const db = createDb(c.env.DB)
      const jwtService = createJWTService(c.env.JWT_SECRET, db)
      const monitoring = createMonitoringService(db)

      // Verify JWT token
      const userSession = await jwtService.verify(token)

      // Validate session is still active
      if (!userSession.sub || !userSession.sid) {
        throw new Error('Invalid session data')
      }

      // Update user's last activity if enabled
      if (updateActivity) {
        // This would typically update the user's lastActivity in the database
        // For now, we'll just record it in the session
        userSession.last_activity = Math.floor(Date.now() / 1000)
      }

      // Add user session to context
      c.set('user', userSession)
      c.set('isAuthenticated', true)

      // Record successful token verification for monitoring
      await monitoring.recordSecurityEvent({
        type: 'auth_success',
        userId: userSession.sub,
        email: userSession.email,
        ip: getClientIP(c),
        userAgent: c.req.header('user-agent'),
        details: {
          action: 'token_verification',
          jti: userSession.jti,
          sid: userSession.sid,
          path: c.req.path
        },
        timestamp: Date.now(),
        severity: 'info'
      })

      await next()

    } catch (error) {
      const db = createDb(c.env.DB)
      const monitoring = createMonitoringService(db)

      // Log failed token verification
      await monitoring.recordSecurityEvent({
        type: 'auth_failure',
        ip: getClientIP(c),
        userAgent: c.req.header('user-agent'),
        details: {
          action: 'token_verification_failed',
          error: error.message,
          path: c.req.path,
          token: token.slice(0, 20) + '...' // Partial token for debugging
        },
        timestamp: Date.now(),
        severity: 'warning'
      })

      // Determine specific error type
      let statusCode = 401
      let errorCode = 'invalid_token'
      let details = 'Token verification failed'

      if (error.message.includes('expired')) {
        errorCode = 'token_expired'
        details = 'Token has expired'
      } else if (error.message.includes('revoked')) {
        errorCode = 'token_revoked'
        details = 'Token has been revoked'
      } else if (error.message.includes('invalid') || error.message.includes('verification failed')) {
        errorCode = 'invalid_token'
        details = 'Invalid or malformed token'
      } else if (error.message.includes('signature')) {
        errorCode = 'invalid_signature'
        details = 'Token signature verification failed'
      }

      throw new HTTPException(statusCode, {
        message: JSON.stringify({
          error: errorCode,
          details
        })
      })
    }
  }
}

// Helper middleware to require specific roles
export function requireRole(
  roles: string | string[]
): MiddlewareHandler<{ Bindings: JWTEnv }> {
  const allowedRoles = Array.isArray(roles) ? roles : [roles]

  return async (c: Context, next) => {
    const user = c.get('user') as UserSession | undefined

    if (!user) {
      throw new HTTPException(401, {
        message: JSON.stringify({
          error: 'authentication_required',
          details: 'This endpoint requires authentication'
        })
      })
    }

    // Check if user has any of the required roles
    const userRoles = user.roles.map(r => r.role)
    const hasRequiredRole = allowedRoles.some(role => userRoles.includes(role))

    if (!hasRequiredRole) {
      const db = createDb(c.env.DB)
      const monitoring = createMonitoringService(db)

      // Log authorization failure
      await monitoring.recordSecurityEvent({
        type: 'auth_failure',
        userId: user.sub,
        email: user.email,
        ip: getClientIP(c),
        userAgent: c.req.header('user-agent'),
        details: {
          action: 'authorization_failed',
          requiredRoles: allowedRoles,
          userRoles,
          path: c.req.path
        },
        timestamp: Date.now(),
        severity: 'warning'
      })

      throw new HTTPException(403, {
        message: JSON.stringify({
          error: 'insufficient_permissions',
          details: `This endpoint requires one of the following roles: ${allowedRoles.join(', ')}`
        })
      })
    }

    await next()
  }
}

// Helper middleware to require specific context access
export function requireContext(
  contextId: string | ((user: UserSession) => string)
): MiddlewareHandler<{ Bindings: JWTEnv }> {
  return async (c: Context, next) => {
    const user = c.get('user') as UserSession | undefined

    if (!user) {
      throw new HTTPException(401, {
        message: JSON.stringify({
          error: 'authentication_required',
          details: 'This endpoint requires authentication'
        })
      })
    }

    // Determine required context ID
    const requiredContextId = typeof contextId === 'function' 
      ? contextId(user) 
      : contextId

    // Check if user has access to the required context
    const hasContextAccess = user.roles.some(role => 
      role.contextId === requiredContextId || 
      role.role === 'MASTER_ADMIN' // Master admins have access to all contexts
    )

    if (!hasContextAccess) {
      const db = createDb(c.env.DB)
      const monitoring = createMonitoringService(db)

      // Log context access failure
      await monitoring.recordSecurityEvent({
        type: 'auth_failure',
        userId: user.sub,
        email: user.email,
        ip: getClientIP(c),
        userAgent: c.req.header('user-agent'),
        details: {
          action: 'context_access_denied',
          requiredContext: requiredContextId,
          userContexts: user.roles.map(r => r.contextId),
          path: c.req.path
        },
        timestamp: Date.now(),
        severity: 'warning'
      })

      throw new HTTPException(403, {
        message: JSON.stringify({
          error: 'context_access_denied',
          details: 'You do not have access to this resource context'
        })
      })
    }

    await next()
  }
}

// Helper function to get current user from context
export function getCurrentUser(c: Context): UserSession | null {
  return c.get('user') as UserSession || null
}

// Helper function to check if request is authenticated
export function isAuthenticated(c: Context): boolean {
  return c.get('isAuthenticated') === true
}

// Helper function to check if user has specific role
export function hasRole(user: UserSession, role: string): boolean {
  return user.roles.some(r => r.role === role)
}

// Helper function to check if user has access to context
export function hasContextAccess(user: UserSession, contextId: string): boolean {
  return user.roles.some(role => 
    role.contextId === contextId || 
    role.role === 'MASTER_ADMIN'
  )
}

// Helper function to get user's rate limit tier
export function getUserRateLimitTier(user: UserSession): string {
  return user.rate_limit_tier
}

// Optional authentication middleware (doesn't throw for missing tokens)
export const optionalAuth = createJWTMiddleware({ required: false })

// Required authentication middleware (throws for missing tokens)
export const requireAuth = createJWTMiddleware({ required: true })

// Admin role requirement middleware
export const requireAdmin = requireRole(['MASTER_ADMIN', 'PARTNER_ADMIN'])

// Master admin role requirement middleware
export const requireMasterAdmin = requireRole('MASTER_ADMIN')

// Driver role requirement middleware
export const requireDriver = requireRole('DRIVER')

// Middleware to skip JWT verification on public endpoints
export const skipAuthForPublicEndpoints = createJWTMiddleware({
  required: false,
  skipPaths: ['/ping', '/health', '/auth/health', '/auth/google/callback']
})