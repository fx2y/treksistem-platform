import { OAuth2Client } from 'google-auth-library'
import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { generateUserId } from '@treksistem/utils'
import type { createDb } from '@treksistem/db'
import { users, userRoles, auditLogs } from '@treksistem/db'
import type { UserSession, UserRoleContext } from './jwt.service'
import { determineRateLimitTier } from './jwt.service'

// Google ID token payload structure
export interface GoogleIdTokenPayload {
  sub: string // Google account ID
  email: string
  email_verified: boolean
  name: string
  picture: string
  
  // Security validations
  aud: string // Must match our Google Client ID
  iss: string // Must be 'accounts.google.com'
  exp: number // Token expiration
  iat: number // Token issued at
  
  // Optional Google claims
  hd?: string // Hosted domain (for workspace accounts)
  given_name?: string
  family_name?: string
  locale?: string
}

// Authentication context for security tracking
export interface AuthContext {
  ip?: string
  userAgent?: string
  fingerprint?: string
}

// Authentication result with security flags
export interface AuthResult {
  user: Omit<UserSession, 'iat' | 'exp' | 'jti'>
  isNewUser: boolean
  securityFlags: {
    suspiciousLocation?: boolean
    newDevice?: boolean
    rateLimited?: boolean
  }
}

// Audit log attempt structure
export interface AuthAttempt {
  email: string
  success: boolean
  ip?: string
  userAgent?: string
  reason?: string
  fingerprint?: string
}

// Rate limit check result
export interface RateLimitResult {
  allowed: boolean
  resetTime?: number
  remainingAttempts?: number
}

// Authentication service interface
export interface AuthService {
  authenticate(providerToken: string, context: AuthContext): Promise<AuthResult>
  logAuthAttempt(attempt: AuthAttempt): Promise<void>
  checkRateLimit(ip: string, email?: string): Promise<RateLimitResult>
}

// Production authentication service implementation
export class ProductionAuthService implements AuthService {
  private googleClient: OAuth2Client

  constructor(
    private googleClientId: string,
    private db: ReturnType<typeof createDb>
  ) {
    this.googleClient = new OAuth2Client(googleClientId)
  }

  async authenticate(providerToken: string, context: AuthContext): Promise<AuthResult> {
    let email = ''
    
    try {
      // Verify Google ID token
      const googlePayload = await this.verifyGoogleToken(providerToken)
      email = googlePayload.email
      
      // Check rate limiting
      const rateLimitCheck = await this.checkRateLimit(context.ip || '', email)
      if (!rateLimitCheck.allowed) {
        await this.logAuthAttempt({
          email,
          success: false,
          ip: context.ip,
          userAgent: context.userAgent,
          reason: 'rate_limited',
          fingerprint: context.fingerprint
        })
        
        throw new Error('Rate limit exceeded')
      }
      
      // Find or create user
      const { user: dbUser, isNewUser } = await this.findOrCreateUser(googlePayload)
      
      // Get user roles
      const roles = await this.getUserRoles(dbUser.id)
      
      // Create user session data
      const sessionId = nanoid()
      const now = Math.floor(Date.now() / 1000)
      
      const userSession: Omit<UserSession, 'iat' | 'exp' | 'jti'> = {
        sub: dbUser.publicId,
        email: dbUser.email,
        email_verified: googlePayload.email_verified,
        name: dbUser.fullName || googlePayload.name,
        picture: dbUser.avatarUrl || googlePayload.picture,
        roles,
        sid: sessionId,
        rate_limit_tier: determineRateLimitTier(roles),
        last_activity: now,
        ip_address: context.ip
      }
      
      // Update user's last activity
      await this.updateUserActivity(dbUser.id)
      
      // Determine security flags
      const securityFlags = await this.analyzeSecurityFlags(
        dbUser.id,
        context,
        isNewUser
      )
      
      // Log successful authentication
      await this.logAuthAttempt({
        email,
        success: true,
        ip: context.ip,
        userAgent: context.userAgent,
        fingerprint: context.fingerprint
      })
      
      return {
        user: userSession,
        isNewUser,
        securityFlags
      }
      
    } catch (error) {
      // Log failed authentication attempt
      await this.logAuthAttempt({
        email,
        success: false,
        ip: context.ip,
        userAgent: context.userAgent,
        reason: error.message,
        fingerprint: context.fingerprint
      })
      
      throw error
    }
  }
  
  private async verifyGoogleToken(token: string): Promise<GoogleIdTokenPayload> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: token,
        audience: this.googleClientId
      })
      
      const payload = ticket.getPayload()
      if (!payload) {
        throw new Error('Invalid token payload')
      }
      
      // Validate required fields
      if (!payload.sub || !payload.email || !payload.name) {
        throw new Error('Missing required fields in token')
      }
      
      // Validate issuer and audience
      if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
        throw new Error('Invalid token issuer')
      }
      
      if (payload.aud !== this.googleClientId) {
        throw new Error('Invalid token audience')
      }
      
      return payload as GoogleIdTokenPayload
      
    } catch (error) {
      throw new Error(`Google token verification failed: ${error.message}`)
    }
  }
  
  private async findOrCreateUser(googlePayload: GoogleIdTokenPayload) {
    // Try to find existing user by Google ID
    let existingUser = await this.db
      .select()
      .from(users)
      .where(eq(users.googleId, googlePayload.sub))
      .limit(1)
    
    if (existingUser.length > 0) {
      return { user: existingUser[0], isNewUser: false }
    }
    
    // Try to find by email (for account linking)
    existingUser = await this.db
      .select()
      .from(users)
      .where(eq(users.email, googlePayload.email))
      .limit(1)
    
    if (existingUser.length > 0) {
      // Link Google account to existing user
      await this.db
        .update(users)
        .set({
          googleId: googlePayload.sub,
          emailVerified: googlePayload.email_verified,
          avatarUrl: googlePayload.picture,
          updatedAt: new Date()
        })
        .where(eq(users.id, existingUser[0].id))
      
      return { 
        user: { 
          ...existingUser[0], 
          googleId: googlePayload.sub,
          emailVerified: googlePayload.email_verified 
        }, 
        isNewUser: false 
      }
    }
    
    // Create new user
    const userId = generateUserId()
    const now = new Date()
    
    const newUser = {
      publicId: userId,
      email: googlePayload.email,
      fullName: googlePayload.name,
      avatarUrl: googlePayload.picture,
      googleId: googlePayload.sub,
      emailVerified: googlePayload.email_verified,
      lastActivity: now,
      createdAt: now,
      updatedAt: now
    }
    
    // Use transaction to create user and assign default role
    await this.db.batch([
      this.db.insert(users).values(newUser),
      // Get the user ID for role assignment (we'll need to query it back)
    ])
    
    // Get the created user
    const createdUser = await this.db
      .select()
      .from(users)
      .where(eq(users.publicId, userId))
      .limit(1)
    
    if (createdUser.length === 0) {
      throw new Error('Failed to create user')
    }
    
    // Assign default DRIVER role
    await this.db.insert(userRoles).values({
      userId: createdUser[0].id,
      role: 'DRIVER',
      contextId: null,
      grantedAt: now,
      grantedBy: 'system', // System-granted for new user registration
      createdAt: now,
      updatedAt: now
    })
    
    return { user: createdUser[0], isNewUser: true }
  }
  
  private async getUserRoles(userId: number): Promise<UserRoleContext[]> {
    const roles = await this.db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, userId))
    
    return roles.map(role => ({
      role: role.role,
      contextId: role.contextId || null,
      grantedAt: Math.floor(role.grantedAt.getTime() / 1000),
      grantedBy: role.grantedBy
    }))
  }
  
  private async updateUserActivity(userId: number): Promise<void> {
    await this.db
      .update(users)
      .set({
        lastActivity: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
  }
  
  private async analyzeSecurityFlags(
    userId: number,
    context: AuthContext,
    isNewUser: boolean
  ): Promise<AuthResult['securityFlags']> {
    const flags: AuthResult['securityFlags'] = {}
    
    // For new users, all locations and devices are "new"
    if (isNewUser) {
      flags.newDevice = true
      return flags
    }
    
    // Check for suspicious patterns
    // This is a simplified implementation - in production you'd want
    // more sophisticated geo-location and device fingerprinting
    if (context.fingerprint) {
      // Check if this device fingerprint has been seen before
      const recentLogins = await this.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, userId),
            eq(auditLogs.action, 'login'),
            eq(auditLogs.success, true)
          )
        )
        .limit(10)
      
      const hasSeenFingerprint = recentLogins.some(log => {
        try {
          const details = log.details ? JSON.parse(log.details) : {}
          return details.fingerprint === context.fingerprint
        } catch {
          return false
        }
      })
      
      if (!hasSeenFingerprint) {
        flags.newDevice = true
      }
    }
    
    return flags
  }
  
  async logAuthAttempt(attempt: AuthAttempt): Promise<void> {
    try {
      const details = {
        fingerprint: attempt.fingerprint,
        reason: attempt.reason
      }
      
      await this.db.insert(auditLogs).values({
        email: attempt.email,
        action: attempt.success ? 'login_success' : 'login_failure',
        ipAddress: attempt.ip,
        userAgent: attempt.userAgent,
        success: attempt.success,
        details: JSON.stringify(details),
        timestamp: new Date()
      })
    } catch (error) {
      // Don't throw on audit log failures - just log the error
      console.error('Failed to log auth attempt:', error)
    }
  }
  
  async checkRateLimit(ip: string, email?: string): Promise<RateLimitResult> {
    // This is a simplified rate limit check
    // In production, you'd use a more sophisticated system like Redis
    
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000)
    
    // Check IP-based rate limiting (10 attempts per minute)
    if (ip) {
      const ipAttempts = await this.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.ipAddress, ip),
            eq(auditLogs.action, 'login_failure')
          )
        )
        .limit(20)
      
      const recentIpAttempts = ipAttempts.filter(
        log => log.timestamp >= oneMinuteAgo
      )
      
      if (recentIpAttempts.length >= 10) {
        return {
          allowed: false,
          resetTime: Math.floor((oneMinuteAgo.getTime() + 60000) / 1000),
          remainingAttempts: 0
        }
      }
    }
    
    // Check email-based rate limiting (5 failed attempts per hour)
    if (email) {
      const emailAttempts = await this.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.email, email),
            eq(auditLogs.action, 'login_failure')
          )
        )
        .limit(10)
      
      const recentEmailAttempts = emailAttempts.filter(
        log => log.timestamp >= oneHourAgo
      )
      
      if (recentEmailAttempts.length >= 5) {
        return {
          allowed: false,
          resetTime: Math.floor((oneHourAgo.getTime() + 3600000) / 1000),
          remainingAttempts: 0
        }
      }
    }
    
    return { allowed: true }
  }
}

// Factory function to create auth service
export function createAuthService(
  googleClientId: string,
  db: ReturnType<typeof createDb>
): AuthService {
  return new ProductionAuthService(googleClientId, db)
}