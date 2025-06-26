import { sign, verify } from 'hono/jwt'
import { nanoid } from 'nanoid'
import type { createDb } from '@treksistem/db'
import { sessionRevocations } from '@treksistem/db'
import { eq, and, lt } from 'drizzle-orm'

// JWT Security Configuration
const JWT_EXPIRY_HOURS = 4 // 4 hours maximum
const JWT_EXPIRY_SECONDS = JWT_EXPIRY_HOURS * 60 * 60

// Rate limiting tier for user permissions
export type RateLimitTier = 'basic' | 'premium' | 'admin'

// User role context for RBAC
export interface UserRoleContext {
  role: 'MASTER_ADMIN' | 'PARTNER_ADMIN' | 'DRIVER'
  contextId: string | null // Partner public_id for scoped roles
  grantedAt: number // Unix timestamp
  grantedBy: string // User public_id who granted this role
}

// JWT payload interface with comprehensive security claims
export interface UserSession {
  sub: string // User's public ID (primary identifier)
  email: string // Verified email address
  email_verified: boolean // Google verification status
  name: string // Display name
  picture: string // Avatar URL
  roles: UserRoleContext[] // All role assignments
  
  // Security & Audit Fields
  iat: number // Issued At
  exp: number // Expiration (max 4h)
  jti: string // JWT ID for revocation tracking
  sid: string // Session ID for concurrent session management
  
  // Rate Limiting & Security Context
  rate_limit_tier: RateLimitTier
  last_activity: number // For session timeout
  ip_address?: string // For geo-security (optional)
}

// JWT service interface for production features
export interface JWTService {
  sign(payload: Omit<UserSession, 'iat' | 'exp' | 'jti'>): Promise<{
    token: string
    expiresAt: number
    jti: string
  }>
  
  verify(token: string): Promise<UserSession>
  
  // Security features
  revoke(jti: string, userId?: string, reason?: string): Promise<void>
  isRevoked(jti: string): Promise<boolean>
  refreshToken(oldToken: string): Promise<{
    token: string
    expiresAt: number
    jti: string
  }>
  
  // Cleanup expired revocations
  cleanupExpiredRevocations(): Promise<void>
}

// Production JWT service implementation
export class ProductionJWTService implements JWTService {
  constructor(
    private secret: string,
    private db: ReturnType<typeof createDb>
  ) {}

  async sign(payload: Omit<UserSession, 'iat' | 'exp' | 'jti'>): Promise<{
    token: string
    expiresAt: number
    jti: string
  }> {
    const now = Math.floor(Date.now() / 1000)
    const exp = now + JWT_EXPIRY_SECONDS
    const jti = nanoid() // Unique JWT ID for revocation tracking
    
    const fullPayload: UserSession = {
      ...payload,
      iat: now,
      exp,
      jti
    }
    
    const token = await sign(fullPayload, this.secret)
    
    return { token, expiresAt: exp, jti }
  }
  
  async verify(token: string): Promise<UserSession> {
    try {
      const payload = await verify(token, this.secret) as UserSession
      
      // Check if token is revoked
      if (await this.isRevoked(payload.jti)) {
        throw new Error('Token has been revoked')
      }
      
      // Validate required security claims
      if (!payload.jti || !payload.sid || !payload.sub) {
        throw new Error('Invalid token: missing security claims')
      }
      
      // Check expiration (additional safety check)
      const now = Math.floor(Date.now() / 1000)
      if (payload.exp <= now) {
        throw new Error('Token has expired')
      }
      
      return payload
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`)
    }
  }
  
  async revoke(jti: string, userId?: string, reason?: string): Promise<void> {
    try {
      // Calculate expiration time for the revocation record
      const expiresAt = new Date(Date.now() + (JWT_EXPIRY_SECONDS * 1000))
      
      await this.db.insert(sessionRevocations).values({
        jti,
        userId: userId ? parseInt(userId) : null,
        expiresAt,
        reason
      })
    } catch (error) {
      // If it's a unique constraint violation, the token is already revoked
      if (error.message.includes('UNIQUE constraint failed')) {
        return // Already revoked, which is fine
      }
      throw new Error(`Failed to revoke token: ${error.message}`)
    }
  }
  
  async isRevoked(jti: string): Promise<boolean> {
    try {
      const revocation = await this.db
        .select()
        .from(sessionRevocations)
        .where(
          and(
            eq(sessionRevocations.jti, jti),
            // Only check non-expired revocations
            // Expired revocations should be cleaned up
          )
        )
        .limit(1)
      
      return revocation.length > 0
    } catch (error) {
      // In case of database error, fail safe by considering token revoked
      console.error('Error checking token revocation:', error)
      return true
    }
  }
  
  async refreshToken(oldToken: string): Promise<{
    token: string
    expiresAt: number
    jti: string
  }> {
    // Verify old token first
    const oldPayload = await this.verify(oldToken)
    
    // Revoke the old token
    await this.revoke(oldPayload.jti, oldPayload.sub, 'token_refresh')
    
    // Generate new session ID but keep other data
    const newSessionId = nanoid()
    
    // Create new token with updated activity time
    const newPayload = {
      ...oldPayload,
      sid: newSessionId,
      last_activity: Math.floor(Date.now() / 1000)
    }
    
    // Remove the old JWT-specific fields before signing
    const { iat, exp, jti, ...payloadToSign } = newPayload
    
    return await this.sign(payloadToSign)
  }
  
  async cleanupExpiredRevocations(): Promise<void> {
    try {
      const now = new Date()
      
      await this.db
        .delete(sessionRevocations)
        .where(lt(sessionRevocations.expiresAt, now))
      
    } catch (error) {
      console.error('Error cleaning up expired revocations:', error)
      // Don't throw - this is a maintenance operation
    }
  }
}

// Factory function to create JWT service
export function createJWTService(
  secret: string,
  db: ReturnType<typeof createDb>
): JWTService {
  return new ProductionJWTService(secret, db)
}

// Helper function to extract user information from session
export function extractUserInfo(session: UserSession) {
  return {
    id: session.sub,
    email: session.email,
    name: session.name,
    picture: session.picture,
    roles: session.roles,
    emailVerified: session.email_verified
  }
}

// Helper function to determine rate limit tier based on roles
export function determineRateLimitTier(roles: UserRoleContext[]): RateLimitTier {
  if (roles.some(r => r.role === 'MASTER_ADMIN')) {
    return 'admin'
  }
  if (roles.some(r => r.role === 'PARTNER_ADMIN')) {
    return 'premium'
  }
  return 'basic'
}