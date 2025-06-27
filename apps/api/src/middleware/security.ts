import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
import type { Context, MiddlewareHandler } from 'hono'
import type { createDb } from '@treksistem/db'
import { auditLogs } from '@treksistem/db'

// Rate limiting configuration
interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  max: number // Maximum requests per window
  authEndpointMax: number // Stricter limit for auth endpoints
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

// Rate limiting storage interface (simplified in-memory for Cloudflare Workers)
interface RateLimitStore {
  increment(key: string): Promise<{ totalRequests: number; resetTime?: number }>
  reset(key: string): Promise<void>
}

// Simple in-memory rate limit store for Cloudflare Workers
// In production, you'd want to use Cloudflare KV or Durable Objects
class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetTime: number }>()

  increment(key: string): { totalRequests: number; resetTime?: number } {
    const now = Date.now()
    const existing = this.store.get(key)
    
    if (!existing || now > existing.resetTime) {
      // Create new window
      const resetTime = now + 60000 // 1 minute window
      this.store.set(key, { count: 1, resetTime })
      return { totalRequests: 1, resetTime }
    }
    
    // Increment existing
    existing.count++
    this.store.set(key, existing)
    return { totalRequests: existing.count, resetTime: existing.resetTime }
  }

  reset(key: string): void {
    this.store.delete(key)
  }
}

// Global rate limit store instance
const rateLimitStore = new MemoryRateLimitStore()

// CSRF protection middleware factory
export function createCSRFMiddleware(origins: string[]): MiddlewareHandler {
  return csrf({
    origin: origins
  })
}

// Security headers middleware factory  
export function createSecurityHeadersMiddleware(): MiddlewareHandler {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", // Needed for some OAuth flows
        "https://accounts.google.com",
        "https://apis.google.com"
      ],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'",
        "https://accounts.google.com"
      ],
      imgSrc: [
        "'self'", 
        "data:", 
        "https:",
        "https://lh3.googleusercontent.com" // Google profile pictures
      ],
      connectSrc: [
        "'self'",
        "https://accounts.google.com",
        "https://oauth2.googleapis.com"
      ],
      frameSrc: [
        "https://accounts.google.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com"
      ]
    },
    strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: ["'self'"],
      payment: []
    }
  })
}

// Rate limiting middleware factory
export function createRateLimitMiddleware(config: RateLimitConfig): MiddlewareHandler {
  return async (c: Context, next) => {
    const ip = c.req.header('CF-Connecting-IP') || 
              c.req.header('X-Forwarded-For') || 
              c.req.header('X-Real-IP') || 
              'unknown'
    
    const isAuthEndpoint = c.req.path.includes('/auth/')
    const limit = isAuthEndpoint ? config.authEndpointMax : config.max
    
    const key = `rate_limit:${ip}:${isAuthEndpoint ? 'auth' : 'general'}`
    
    try {
      const { totalRequests, resetTime } = rateLimitStore.increment(key)
      
      // Add rate limit headers
      c.header('X-RateLimit-Limit', limit.toString())
      c.header('X-RateLimit-Remaining', Math.max(0, limit - totalRequests).toString())
      if (resetTime) {
        c.header('X-RateLimit-Reset', Math.floor(resetTime / 1000).toString())
      }
      
      if (totalRequests > limit) {
        // Log rate limit violation
        await logSecurityEvent(c, {
          event: 'rate_limit_exceeded',
          details: {
            ip,
            path: c.req.path,
            limit,
            requests: totalRequests,
            isAuthEndpoint
          }
        })
        
        throw new HTTPException(429, {
          message: JSON.stringify({
            error: 'rate_limited',
            retryAfter: resetTime ? Math.ceil((resetTime - Date.now()) / 1000) : 60
          })
        })
      }
      
      await next()
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      // If rate limiting fails, allow the request but log the error
      console.error('Rate limiting error:', error)
      await next()
    }
  }
}

// Request validation middleware factory
export function createRequestValidationMiddleware(): MiddlewareHandler {
  return async (c: Context, next) => {
    try {
      // Validate common request headers and structure
      const contentType = c.req.header('content-type')
      const method = c.req.method
      
      // For POST requests, ensure proper content type
      if (method === 'POST' && contentType && !contentType.includes('application/json')) {
        // Allow form data for certain endpoints
        if (!c.req.path.includes('/upload/') && !contentType.includes('multipart/form-data')) {
          throw new HTTPException(400, {
            message: JSON.stringify({
              error: 'invalid_content_type',
              details: 'Expected application/json'
            })
          })
        }
      }
      
      // Validate request size (simplified check)
      const contentLength = c.req.header('content-length')
      if (contentLength && parseInt(contentLength) > 1024 * 1024) { // 1MB limit
        throw new HTTPException(413, {
          message: JSON.stringify({
            error: 'payload_too_large',
            details: 'Request payload exceeds 1MB limit'
          })
        })
      }
      
      await next()
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }
      
      console.error('Request validation error:', error)
      throw new HTTPException(400, {
        message: JSON.stringify({
          error: 'request_validation_failed',
          details: 'Invalid request format'
        })
      })
    }
  }
}

// Security monitoring middleware factory
export function createSecurityMonitoringMiddleware(
  db?: ReturnType<typeof createDb>
): MiddlewareHandler {
  return async (c: Context, next) => {
    const startTime = Date.now()
    
    try {
      await next()
      
      // Log successful requests for security monitoring
      const responseTime = Date.now() - startTime
      if (c.req.path.includes('/auth/') || responseTime > 5000) {
        await logSecurityEvent(c, {
          event: 'request_completed',
          details: {
            path: c.req.path,
            method: c.req.method,
            status: c.res.status,
            responseTime,
            userAgent: c.req.header('user-agent')
          }
        }, db)
      }
    } catch (error) {
      // Log security-relevant errors
      await logSecurityEvent(c, {
        event: 'request_error',
        details: {
          path: c.req.path,
          method: c.req.method,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }
      }, db)
      
      throw error
    }
  }
}

// IP filtering middleware (for blocking known bad actors)
export function createIPFilterMiddleware(blockedIPs: string[] = []): MiddlewareHandler {
  return async (c: Context, next) => {
    const ip = c.req.header('CF-Connecting-IP') || 
              c.req.header('X-Forwarded-For') || 
              c.req.header('X-Real-IP')
    
    if (ip && blockedIPs.includes(ip)) {
      await logSecurityEvent(c, {
        event: 'blocked_ip_access',
        details: { ip, path: c.req.path }
      })
      
      throw new HTTPException(403, {
        message: JSON.stringify({
          error: 'access_denied',
          details: 'IP address is blocked'
        })
      })
    }
    
    await next()
  }
}

// Comprehensive security middleware stack
export function createSecurityMiddlewareStack(config: {
  origins: string[]
  csrfSecret?: string
  rateLimitConfig?: Partial<RateLimitConfig>
  blockedIPs?: string[]
  db?: ReturnType<typeof createDb>
}): MiddlewareHandler[] {
  const defaultRateLimit: RateLimitConfig = {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    authEndpointMax: 10, // 10 auth requests per minute
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    ...config.rateLimitConfig
  }

  return [
    // IP filtering (first line of defense)
    createIPFilterMiddleware(config.blockedIPs),
    
    // Security headers
    createSecurityHeadersMiddleware(),
    
    // Request validation
    createRequestValidationMiddleware(),
    
    // Rate limiting
    createRateLimitMiddleware(defaultRateLimit),
    
    // CSRF protection
    createCSRFMiddleware(config.origins),
    
    // Security monitoring (last to catch all security events)
    createSecurityMonitoringMiddleware(config.db)
  ]
}

// Helper function to log security events
async function logSecurityEvent(
  c: Context,
  event: {
    event: string
    details: Record<string, unknown>
  },
  db?: ReturnType<typeof createDb>
): Promise<void> {
  try {
    const ip = c.req.header('CF-Connecting-IP') || 
              c.req.header('X-Forwarded-For') || 
              c.req.header('X-Real-IP')
    
    const userAgent = c.req.header('user-agent')
    
    console.log('Security Event:', {
      ...event,
      ip,
      userAgent,
      timestamp: new Date().toISOString()
    })
    
    // Store in database if available
    if (db) {
      await db.insert(auditLogs).values({
        action: event.event,
        ipAddress: ip,
        userAgent,
        success: event.event.includes('completed') || event.event.includes('success'),
        details: JSON.stringify(event.details),
        timestamp: new Date()
      }).catch(error => {
        console.error('Failed to log security event to database:', error)
      })
    }
  } catch (error) {
    console.error('Failed to log security event:', error)
  }
}

// Helper function to get client IP
export function getClientIP(c: Context): string {
  return c.req.header('CF-Connecting-IP') || 
         c.req.header('X-Forwarded-For') || 
         c.req.header('X-Real-IP') || 
         'unknown'
}

// Helper function to get security context from request
export function getSecurityContext(c: Context) {
  return {
    ip: getClientIP(c),
    userAgent: c.req.header('user-agent'),
    fingerprint: c.req.header('x-fingerprint') // Custom header from frontend
  }
}