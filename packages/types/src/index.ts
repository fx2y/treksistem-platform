// Shared TypeScript types for the Treksistem platform
// Core user and authentication types

// User role definitions for RBAC system
export type Role = 'MASTER_ADMIN' | 'PARTNER_ADMIN' | 'DRIVER'

// Rate limiting tier for user permissions and throttling
export type RateLimitTier = 'basic' | 'premium' | 'admin'

// User role context for scoped RBAC with audit trail
export interface UserRoleContext {
  /** Role assigned to the user */
  role: Role
  /** Context identifier for scoped roles (e.g., Partner public_id for PARTNER_ADMIN) */
  contextId: string | null
  /** Unix timestamp when role was granted */
  grantedAt: number
  /** User public_id who granted this role */
  grantedBy: string
}

// Comprehensive JWT payload interface with security claims
export interface UserSession {
  /** User's public ID (primary identifier) */
  sub: string
  /** Verified email address */
  email: string
  /** Google email verification status */
  email_verified: boolean
  /** Display name */
  name: string
  /** Avatar URL */
  picture: string
  /** All role assignments with context */
  roles: UserRoleContext[]
  
  // Security & Audit Fields
  /** Issued At timestamp */
  iat: number
  /** Expiration timestamp (max 4h) */
  exp: number
  /** JWT ID for revocation tracking */
  jti: string
  /** Session ID for concurrent session management */
  sid: string
  
  // Rate Limiting & Security Context
  /** Rate limiting tier based on user roles */
  rate_limit_tier: RateLimitTier
  /** Last activity timestamp for session timeout */
  last_activity: number
  /** IP address for geo-security (optional) */
  ip_address?: string
}

// Extended Hono context with authenticated user
export interface AuthenticatedContext {
  /** Authenticated user session data */
  user: UserSession
  /** Authentication status flag */
  isAuthenticated: true
}

// Security event types for audit logging
export type SecurityEventType = 
  | 'auth_success' 
  | 'auth_failure' 
  | 'token_revocation' 
  | 'permission_denied'
  | 'suspicious_activity'
  | 'rate_limit_hit'

// Security event severity levels
export type SecurityEventSeverity = 'info' | 'warning' | 'error' | 'critical'

// Security event interface for comprehensive audit trail
export interface SecurityEvent {
  /** Type of security event */
  type: SecurityEventType
  /** User ID if authenticated */
  userId?: string
  /** User email if available */
  email?: string
  /** Client IP address */
  ip?: string
  /** User agent string */
  userAgent?: string
  /** Additional event details */
  details?: Record<string, unknown>
  /** Event timestamp */
  timestamp: number
  /** Event severity level */
  severity: SecurityEventSeverity
}

// Database user public identifier type (branded string)
export type UserId = string & { readonly __brand: 'UserId' }

// Helper function to create branded UserId
export function createUserId(id: string): UserId {
  return id as UserId
}

// Partner public identifier type (branded string)
export type PartnerId = string & { readonly __brand: 'PartnerId' }

// Helper function to create branded PartnerId
export function createPartnerId(id: string): PartnerId {
  return id as PartnerId
}

// Driver public identifier type (branded string)
export type DriverId = string & { readonly __brand: 'DriverId' }

// Helper function to create branded DriverId
export function createDriverId(id: string): DriverId {
  return id as DriverId
}

// Master Data Types - Branded identifiers for type safety
export type VehicleTypeId = string & { readonly __brand: 'VehicleTypeId' }
export type PayloadTypeId = string & { readonly __brand: 'PayloadTypeId' }
export type FacilityId = string & { readonly __brand: 'FacilityId' }

// Helper functions to create branded master data IDs
export function createVehicleTypeId(id: string): VehicleTypeId {
  return id as VehicleTypeId
}

export function createPayloadTypeId(id: string): PayloadTypeId {
  return id as PayloadTypeId
}

export function createFacilityId(id: string): FacilityId {
  return id as FacilityId
}

// Master Data Interfaces
export interface VehicleType {
  id: VehicleTypeId
  publicId: string
  name: string
  description?: string
  iconUrl: string
  isActive: boolean
  partnerId?: PartnerId // Partner-scoped or global (null)
  displayOrder: number
  capabilities: string[] // e.g., ["HOT_FOOD", "FROZEN_FOOD"]
  // Audit fields
  createdAt: Date
  updatedAt: Date
  createdBy: UserId
  updatedBy: UserId
}

export interface PayloadType {
  id: PayloadTypeId
  publicId: string
  name: string
  description?: string
  iconUrl: string
  isActive: boolean
  partnerId?: PartnerId // Partner-scoped or global (null)
  displayOrder: number
  requirements: string[] // e.g., ["TEMPERATURE_CONTROLLED", "FRAGILE"]
  // Audit fields
  createdAt: Date
  updatedAt: Date
  createdBy: UserId
  updatedBy: UserId
}

export interface Facility {
  id: FacilityId
  publicId: string
  name: string
  description?: string
  iconUrl: string
  isActive: boolean
  partnerId?: PartnerId // Partner-scoped or global (null)
  displayOrder: number
  category: string // e.g., "COOLING", "STORAGE", "SAFETY"
  // Audit fields
  createdAt: Date
  updatedAt: Date
  createdBy: UserId
  updatedBy: UserId
}

// Master Data API Responses
export interface MasterDataResponse {
  vehicleTypes: VehicleType[]
  payloadTypes: PayloadType[]
  facilities: Facility[]
  // Partner context
  partnerId?: PartnerId
  globalDataIncluded: boolean
}

// Master Data CRUD Request Types
export interface CreateVehicleTypeRequest {
  name: string
  description?: string
  iconUrl: string
  displayOrder?: number
  capabilities?: string[]
}

export interface UpdateVehicleTypeRequest {
  name?: string
  description?: string
  iconUrl?: string
  isActive?: boolean
  displayOrder?: number
  capabilities?: string[]
}

export interface CreatePayloadTypeRequest {
  name: string
  description?: string
  iconUrl: string
  displayOrder?: number
  requirements?: string[]
}

export interface UpdatePayloadTypeRequest {
  name?: string
  description?: string
  iconUrl?: string
  isActive?: boolean
  displayOrder?: number
  requirements?: string[]
}

export interface CreateFacilityRequest {
  name: string
  description?: string
  iconUrl: string
  displayOrder?: number
  category: string
}

export interface UpdateFacilityRequest {
  name?: string
  description?: string
  iconUrl?: string
  isActive?: boolean
  displayOrder?: number
  category?: string
}

// API response interfaces
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  details?: string
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Error response interface for consistent API errors
export interface ErrorResponse {
  error: string
  details?: string
  code?: string
  timestamp?: number
}

// Authentication response interface
export interface AuthResponse {
  jwt: string
  user: {
    id: string
    email: string
    name: string
    picture: string
    roles: UserRoleContext[]
    emailVerified: boolean
  }
  session: {
    expiresAt: number
    refreshable: boolean
  }
}

// Token refresh response
export interface TokenRefreshResponse {
  jwt: string
  expiresAt: number
  refreshable: boolean
}

// Health check response
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: number
  checks?: Record<string, {
    status: 'ok' | 'error'
    message?: string
    responseTime?: string
  }>
}

// Monitoring metrics interface
export interface SystemMetrics {
  timestamp: number
  requestCount: number
  errorCount: number
  avgResponseTime: number
  activeConnections: number
}

// User profile interface for API responses
export interface UserProfile {
  id: string
  email: string
  name: string
  picture: string
  roles: UserRoleContext[]
  emailVerified: boolean
  lastActivity: number
  rateLimitTier: RateLimitTier
}

// Export utility type guards
export function isRole(value: string): value is Role {
  return ['MASTER_ADMIN', 'PARTNER_ADMIN', 'DRIVER'].includes(value)
}

export function isRateLimitTier(value: string): value is RateLimitTier {
  return ['basic', 'premium', 'admin'].includes(value)
}

export function isSecurityEventType(value: string): value is SecurityEventType {
  return [
    'auth_success',
    'auth_failure', 
    'token_revocation',
    'permission_denied',
    'suspicious_activity',
    'rate_limit_hit'
  ].includes(value)
}

export function isSecurityEventSeverity(value: string): value is SecurityEventSeverity {
  return ['info', 'warning', 'error', 'critical'].includes(value)
}

// Master Data type guards
export function isVehicleTypeId(value: string): value is VehicleTypeId {
  return typeof value === 'string' && value.length > 0
}

export function isPayloadTypeId(value: string): value is PayloadTypeId {
  return typeof value === 'string' && value.length > 0
}

export function isFacilityId(value: string): value is FacilityId {
  return typeof value === 'string' && value.length > 0
}

export function isValidMasterDataCategory(value: string): value is 'vehicleTypes' | 'payloadTypes' | 'facilities' {
  return ['vehicleTypes', 'payloadTypes', 'facilities'].includes(value)
}