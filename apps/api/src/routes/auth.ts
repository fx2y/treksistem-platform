import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'
import { createAuthService } from '../services/auth.service'
import { createJWTService, extractUserInfo } from '../services/jwt.service'
import { createMonitoringService } from '../services/monitoring.service'
import { getSecurityContext, getClientIP } from '../middleware/security'
import { createDb } from '@treksistem/db'

// Environment bindings interface
interface Env {
  DB: D1Database
  JWT_SECRET: string
  GOOGLE_CLIENT_ID: string
  CSRF_SECRET?: string
}

// Request validation schemas
const googleAuthSchema = z.object({
  token: z.string().min(1, 'Google ID token is required'),
  fingerprint: z.string().optional(),
  timezone: z.string().optional()
})

const tokenRefreshSchema = z.object({
  token: z.string().min(1, 'Refresh token is required')
})

const tokenRevocationSchema = z.object({
  token: z.string().min(1, 'Token to revoke is required'),
  reason: z.string().optional()
})

// Response interfaces
interface AuthSuccessResponse {
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

interface ErrorResponse {
  error: string
  details?: string
}

// Create auth router
export function createAuthRouter() {
  const auth = new Hono<{ Bindings: Env }>()

  // Google OAuth callback endpoint
  auth.post(
    '/google/callback',
    zValidator('json', googleAuthSchema),
    async (c) => {
      const { token: googleToken, fingerprint, timezone } = c.req.valid('json')
      
      try {
        // Initialize services
        const db = createDb(c.env.DB)
        const authService = createAuthService(c.env.GOOGLE_CLIENT_ID, db)
        const jwtService = createJWTService(c.env.JWT_SECRET, db)
        const monitoring = createMonitoringService(db)

        // Get security context
        const securityContext = {
          ...getSecurityContext(c),
          fingerprint,
          timezone
        }

        // Authenticate with Google
        const authResult = await authService.authenticate(googleToken, securityContext)

        // Generate JWT
        const { token: jwt, expiresAt, jti } = await jwtService.sign(authResult.user)

        // Record security event
        await monitoring.recordSecurityEvent({
          type: 'auth_success',
          userId: authResult.user.sub,
          email: authResult.user.email,
          ip: securityContext.ip,
          userAgent: securityContext.userAgent,
          details: {
            isNewUser: authResult.isNewUser,
            securityFlags: authResult.securityFlags,
            jti,
            fingerprint
          },
          timestamp: Date.now(),
          severity: 'info'
        })

        // Prepare response
        const response: AuthSuccessResponse = {
          jwt,
          user: {
            id: authResult.user.sub,
            email: authResult.user.email,
            name: authResult.user.name,
            picture: authResult.user.picture,
            roles: authResult.user.roles
          },
          session: {
            expiresAt,
            refreshable: true
          }
        }

        // Set security headers
        c.header('X-Frame-Options', 'DENY')
        c.header('X-Content-Type-Options', 'nosniff')

        return c.json(response, 200)

      } catch (error) {
        const db = createDb(c.env.DB)
        const monitoring = createMonitoringService(db)

        // Determine error type and status code
        let statusCode = 500
        let errorCode = 'auth_service_unavailable'
        let details = 'Internal server error'

        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Rate limit')) {
          statusCode = 429
          errorCode = 'rate_limited'
          details = 'Too many authentication attempts'
        } else if (errorMessage.includes('verification failed') || errorMessage.includes('Invalid token')) {
          statusCode = 401
          errorCode = 'invalid_token'
          details = 'Google token verification failed'
        } else if (errorMessage.includes('Token has been revoked')) {
          statusCode = 401
          errorCode = 'token_revoked'
          details = 'Authentication token has been revoked'
        }

        // Record security event for failed authentication
        await monitoring.recordSecurityEvent({
          type: 'auth_failure',
          ip: getClientIP(c),
          userAgent: c.req.header('user-agent'),
          details: {
            error: error instanceof Error ? error.message : String(error),
            fingerprint,
            errorCode
          },
          timestamp: Date.now(),
          severity: statusCode === 429 ? 'warning' : 'error'
        })

        // Report error to monitoring
        await monitoring.reportException(error as Error, c, 'medium')

        const errorResponse: ErrorResponse = {
          error: errorCode,
          details: details
        }

        return c.json(errorResponse, statusCode as 500 | 401 | 429)
      }
    }
  )

  // Token refresh endpoint
  auth.post(
    '/refresh',
    zValidator('json', tokenRefreshSchema),
    async (c) => {
      const { token: oldToken } = c.req.valid('json')

      try {
        const db = createDb(c.env.DB)
        const jwtService = createJWTService(c.env.JWT_SECRET, db)
        const monitoring = createMonitoringService(db)

        // Refresh token
        const { token: newToken, expiresAt, jti } = await jwtService.refreshToken(oldToken)

        // Verify the new token to get user info
        const userSession = await jwtService.verify(newToken)

        // Record security event
        await monitoring.recordSecurityEvent({
          type: 'token_revocation', // Old token gets revoked
          userId: userSession.sub,
          email: userSession.email,
          ip: getClientIP(c),
          userAgent: c.req.header('user-agent'),
          details: {
            action: 'token_refresh',
            newJti: jti,
            oldToken: oldToken.slice(0, 20) + '...' // Partial token for logging
          },
          timestamp: Date.now(),
          severity: 'info'
        })

        const response = {
          jwt: newToken,
          expiresAt,
          refreshable: true
        }

        return c.json(response, 200)

      } catch (error) {
        const db = createDb(c.env.DB)
        const monitoring = createMonitoringService(db)

        await monitoring.reportException(error as Error, c, 'medium')

        let statusCode = 401
        let errorCode = 'invalid_token'
        let details = 'Token refresh failed'

        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('revoked')) {
          errorCode = 'token_revoked'
          details = 'Token has been revoked'
        } else if (errorMessage.includes('expired')) {
          errorCode = 'token_expired'
          details = 'Token has expired'
        }

        const errorResponse: ErrorResponse = {
          error: errorCode,
          details
        }

        return c.json(errorResponse, statusCode as 500 | 401 | 429)
      }
    }
  )

  // Token revocation endpoint
  auth.post(
    '/revoke',
    zValidator('json', tokenRevocationSchema),
    async (c) => {
      const { token, reason } = c.req.valid('json')

      try {
        const db = createDb(c.env.DB)
        const jwtService = createJWTService(c.env.JWT_SECRET, db)
        const monitoring = createMonitoringService(db)

        // Verify token first to get user info
        const userSession = await jwtService.verify(token)

        // Revoke the token
        await jwtService.revoke(userSession.jti, userSession.sub, reason)

        // Record security event
        await monitoring.recordSecurityEvent({
          type: 'token_revocation',
          userId: userSession.sub,
          email: userSession.email,
          ip: getClientIP(c),
          userAgent: c.req.header('user-agent'),
          details: {
            action: 'manual_revocation',
            reason: reason || 'user_logout',
            jti: userSession.jti
          },
          timestamp: Date.now(),
          severity: 'info'
        })

        return c.json({ success: true }, 200)

      } catch (error) {
        const db = createDb(c.env.DB)
        const monitoring = createMonitoringService(db)

        await monitoring.reportException(error as Error, c, 'low')

        const errorResponse: ErrorResponse = {
          error: 'revocation_failed',
          details: 'Failed to revoke token'
        }

        return c.json(errorResponse, 400)
      }
    }
  )

  // User profile endpoint (requires authentication)
  auth.get('/profile', async (c) => {
    try {
      // This endpoint would typically use JWT middleware
      // For now, return placeholder response
      return c.json({
        message: 'Profile endpoint - requires JWT middleware implementation'
      })
    } catch (error) {
      const errorResponse: ErrorResponse = {
        error: 'profile_unavailable',
        details: 'Unable to fetch user profile'
      }
      return c.json(errorResponse, 500)
    }
  })

  // Health check for auth service
  auth.get('/health', async (c) => {
    try {
      const db = createDb(c.env.DB)
      const monitoring = createMonitoringService(db)
      
      const healthStatus = await monitoring.getHealthStatus()
      
      // Additional auth-specific health checks
      const authHealthChecks = {
        google_client_configured: !!c.env.GOOGLE_CLIENT_ID,
        jwt_secret_configured: !!c.env.JWT_SECRET,
        database_connected: healthStatus.checks.database.status === 'ok'
      }

      const overallStatus = Object.values(authHealthChecks).every(Boolean) && 
                           healthStatus.status === 'healthy'

      return c.json({
        status: overallStatus ? 'healthy' : 'unhealthy',
        timestamp: Date.now(),
        checks: {
          ...healthStatus.checks,
          auth: authHealthChecks
        }
      })

    } catch (error) {
      return c.json({
        status: 'unhealthy',
        timestamp: Date.now(),
        error: 'Health check failed'
      }, 500)
    }
  })

  return auth
}

// Helper function to handle auth errors consistently
function handleAuthError(error: Error, c: Context): Response {
  console.error('Auth error:', error)

  if (error.message.includes('Rate limit')) {
    return c.json({
      error: 'rate_limited',
      details: 'Too many requests'
    }, 429)
  }

  if (error.message.includes('Invalid token') || error.message.includes('verification failed')) {
    return c.json({
      error: 'invalid_token',
      details: 'Authentication failed'
    }, 401)
  }

  if (error.message.includes('revoked')) {
    return c.json({
      error: 'token_revoked',
      details: 'Token has been revoked'
    }, 401)
  }

  // Default to server error
  return c.json({
    error: 'auth_service_unavailable',
    details: 'Authentication service temporarily unavailable'
  }, 500)
}