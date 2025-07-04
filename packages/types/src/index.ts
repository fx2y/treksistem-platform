// Shared TypeScript types for the Treksistem platform
// Core user and authentication types

import { z } from 'zod';

// Import and re-export branded types from utils (single source of truth)
import type {
  UserId,
  PartnerId,
  VehicleTypeId,
  PayloadTypeId,
  FacilityId,
  ServiceId,
  PricingSchemeId,
} from '@treksistem/utils';

// Import type guard functions for use in schemas
import {
  isVehicleTypeId,
  isPayloadTypeId,
  isFacilityId,
} from '@treksistem/utils';

export type {
  UserId,
  PartnerId,
  VehicleTypeId,
  PayloadTypeId,
  FacilityId,
  ServiceId,
  PricingSchemeId,
} from '@treksistem/utils';

// Re-export type guard functions from utils
export {
  isVehicleTypeId,
  isPayloadTypeId,
  isFacilityId,
} from '@treksistem/utils';

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
  | 'rate_limit_hit'
  | 'suspicious_activity'

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

// API Response Types
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

export interface ErrorResponse {
  error: string
  details?: string
  code?: string
  timestamp?: number
}

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

export interface TokenRefreshResponse {
  jwt: string
  expiresAt: number
  refreshable: boolean
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: number
  checks?: Record<string, {
    status: 'ok' | 'error'
    message?: string
    responseTime?: string
  }>
}

export interface SystemMetrics {
  timestamp: number
  requestCount: number
  errorCount: number
  avgResponseTime: number
  activeConnections: number
}

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

// Type Guards
export function isRole(value: string): value is Role {
  return ['MASTER_ADMIN', 'PARTNER_ADMIN', 'DRIVER'].includes(value as Role)
}

export function isRateLimitTier(value: string): value is RateLimitTier {
  return ['basic', 'premium', 'admin'].includes(value as RateLimitTier)
}

export function isSecurityEventType(value: string): value is SecurityEventType {
  return [
    'auth_success', 
    'auth_failure', 
    'token_revocation',
    'rate_limit_hit',
    'suspicious_activity'
  ].includes(value)
}

export function isSecurityEventSeverity(value: string): value is SecurityEventSeverity {
  return ['info', 'warning', 'error', 'critical'].includes(value as SecurityEventSeverity)
}

export function isValidMasterDataCategory(value: string): value is 'vehicleTypes' | 'payloadTypes' | 'facilities' {
  return ['vehicleTypes', 'payloadTypes', 'facilities'].includes(value)
}

// Partner Management Types

// Business type options for partners
export type BusinessType = 'UMKM' | 'CORPORATION' | 'INDIVIDUAL'

// Subscription tier options
export type SubscriptionTier = 'BASIC' | 'PREMIUM' | 'ENTERPRISE'

// Partner core interface
export interface Partner {
  publicId: PartnerId
  ownerUserId: number
  name: string
  businessType?: BusinessType
  description?: string
  address?: string
  phoneNumber?: string
  email?: string
  websiteUrl?: string
  logoUrl?: string
  locationLat?: number
  locationLng?: number
  businessRegistrationNumber?: string
  taxIdentificationNumber?: string
  subscriptionTier: SubscriptionTier
  isActive: boolean
  maxDrivers: number
  maxVehicles: number
  // Audit fields
  createdAt: Date
  updatedAt: Date
  createdBy: UserId
  updatedBy: UserId
}

// Partner statistics interface
export interface PartnerStatistics {
  activeDrivers: number
  activeVehicles: number
  totalOrders: number
  monthlyRevenue?: number
  averageOrderValue?: number
}

// Partner DTO for API responses
export interface PartnerDTO {
  publicId: PartnerId
  name: string
  businessType?: BusinessType
  description?: string
  address?: string
  phoneNumber?: string
  email?: string
  websiteUrl?: string
  logoUrl?: string
  locationLat?: number
  locationLng?: number
  businessRegistrationNumber?: string
  taxIdentificationNumber?: string
  subscriptionTier: SubscriptionTier
  isActive: boolean
  maxDrivers: number
  maxVehicles: number
  statistics: PartnerStatistics
  createdAt: Date
  updatedAt: Date
  createdBy: UserId
  updatedBy: UserId
}

// Create partner request
export interface CreatePartnerRequest {
  name: string
  businessType?: BusinessType
  description?: string
  address?: string
  phoneNumber?: string
  email?: string
  websiteUrl?: string
  logoUrl?: string
  locationLat?: number
  locationLng?: number
  businessRegistrationNumber?: string
  taxIdentificationNumber?: string
  subscriptionTier?: SubscriptionTier
}

// Update partner request
export interface UpdatePartnerRequest {
  name?: string
  businessType?: BusinessType
  description?: string
  address?: string
  phoneNumber?: string
  email?: string
  websiteUrl?: string
  logoUrl?: string
  locationLat?: number
  locationLng?: number
  businessRegistrationNumber?: string
  taxIdentificationNumber?: string
  subscriptionTier?: SubscriptionTier
  isActive?: boolean
  maxDrivers?: number
  maxVehicles?: number
}

// Partner filters for listing
export interface PartnerFilters {
  businessType?: BusinessType
  subscriptionTier?: SubscriptionTier
  isActive?: boolean
  search?: string
  page?: number
  limit?: number
}

// Type guards for partner types
export function isBusinessType(value: string): value is BusinessType {
  return ['UMKM', 'CORPORATION', 'INDIVIDUAL'].includes(value as BusinessType)
}

export function isSubscriptionTier(value: string): value is SubscriptionTier {
  return ['BASIC', 'PREMIUM', 'ENTERPRISE'].includes(value as SubscriptionTier)
}

// Service Management Types

// Service configuration schema for flexible JSON validation
export const ServiceConfigSchema = z.object({
  businessModel: z.enum(['PRIVATE', 'PUBLIC']), // 'PRIVATE' (internal only), 'PUBLIC' (listed for anyone)
  vehicleTypeIds: z.array(z.string().refine(isVehicleTypeId)), // References master_vehicle_types
  payloadTypeIds: z.array(z.string().refine(isPayloadTypeId)), // References master_payload_types
  facilityIds: z.array(z.string().refine(isFacilityId)).optional(), // References master_facilities
  capacity: z.object({
    maxWeightKg: z.number().positive().optional(),
    maxItems: z.number().positive().int().optional(),
  }).optional(),
  operationalRange: z.object({
    maxDistanceKm: z.number().positive(),
  }),
  orderOptions: z.array(z.enum(['PICKUP_AT_SENDER', 'A_TO_B'])),
});

// Create service request schema
export const createServiceSchema = z.object({
  name: z.string().min(3).max(100),
  config: ServiceConfigSchema, // Nested validation
});

// Update service request schema (partial updates allowed)
export const updateServiceSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  config: ServiceConfigSchema.partial().optional(), // Allow partial updates to the config
  isActive: z.boolean().optional(),
});

// Infer TypeScript types from Zod schemas
export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;
export type CreateServiceRequest = z.infer<typeof createServiceSchema>;
export type UpdateServiceRequest = z.infer<typeof updateServiceSchema>;

// Service DTO for API responses
export interface ServiceDTO {
  publicId: ServiceId;
  partnerId: PartnerId;
  name: string;
  isActive: boolean;
  config: ServiceConfig; // The validated ServiceConfig object
  createdAt: string; // ISO8601Timestamp
  updatedAt: string; // ISO8601Timestamp
  createdBy: UserId;
  updatedBy: UserId;
}

// Pricing Schema Types - Re-export all pricing-related types and schemas
export * from './schemas/pricing.schema';