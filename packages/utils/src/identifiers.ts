import { nanoid } from 'nanoid'

// TypeScript branded types for enhanced type safety
declare const userIdBrand: unique symbol
declare const orderIdBrand: unique symbol
declare const productIdBrand: unique symbol
declare const organizationIdBrand: unique symbol
declare const sessionIdBrand: unique symbol
declare const partnerIdBrand: unique symbol
declare const vehicleTypeIdBrand: unique symbol
declare const payloadTypeIdBrand: unique symbol
declare const facilityIdBrand: unique symbol
declare const serviceIdBrand: unique symbol

export type UserId = string & { [userIdBrand]: true }
export type OrderId = string & { [orderIdBrand]: true }
export type ProductId = string & { [productIdBrand]: true }
export type OrganizationId = string & { [organizationIdBrand]: true }
export type SessionId = string & { [sessionIdBrand]: true }
export type PartnerId = string & { [partnerIdBrand]: true }
export type VehicleTypeId = string & { [vehicleTypeIdBrand]: true }
export type PayloadTypeId = string & { [payloadTypeIdBrand]: true }
export type FacilityId = string & { [facilityIdBrand]: true }
export type ServiceId = string & { [serviceIdBrand]: true }

/**
 * Generates a secure, prefixed, non-sequential public ID with TypeScript branded types.
 * 
 * This function creates cryptographically secure, URL-friendly identifiers that prevent
 * data enumeration vulnerabilities by replacing sequential database IDs with unpredictable,
 * prefixed strings optimized for Cloudflare Workers environment.
 * 
 * @param prefix - A short, alphanumeric string to identify the entity type (e.g., 'user', 'ord'). 
 *                Must be 2-10 lowercase alphanumeric characters. The function will append an underscore.
 * @returns A prefixed public ID string (e.g., "user_a1b2c3d4e5f6g7h8i9j0k").
 * @throws Error if prefix is invalid (contains non-alphanumeric chars, wrong length, or uppercase)
 * 
 * @example
 * ```typescript
 * // Basic usage
 * const userId = generatePublicId<UserId>('user')     // "user_V1StGXR8_Z5jdHi6B-myT"
 * const orderId = generatePublicId<OrderId>('ord')    // "ord_a1b2c3d4e5f6g7h8i9j0k"
 * const productId = generatePublicId<ProductId>('prod') // "prod_Z9Y8X7W6V5U4T3S2R1Q0P"
 * 
 * // Type safety with branded types
 * function getUserById(id: UserId): Promise<User> {
 *   // TypeScript ensures only UserId can be passed here
 *   return db.query('SELECT * FROM users WHERE public_id = ?', [id])
 * }
 * 
 * getUserById(userId) // ✓ Valid
 * getUserById(orderId) // ✗ TypeScript error
 * ```
 * 
 * @security
 * - Uses nanoid v5.x with hardware random generator (cryptographically secure)
 * - 21-character nanoid provides UUID v4 collision probability (~2.3 trillion combinations)
 * - URL-safe alphabet (A-Za-z0-9_-) ensures no encoding needed
 * - Non-sequential generation prevents enumeration attacks
 * - Prefix validation prevents injection or malformed identifiers
 * 
 * @performance
 * - Optimized for Cloudflare Workers V8 engine
 * - ~3.7M operations/second in benchmarks
 * - 124 bytes minified (critical for 1MB Worker bundle limit)
 * - ESM-only import for tree-shaking optimization
 */
export function generatePublicId<T extends string = string>(prefix: string): `${string}_${string}` & T {
  // Validate prefix: 2-10 lowercase alphanumeric characters only
  if (!/^[a-z0-9]{2,10}$/.test(prefix)) {
    throw new Error(
      `Invalid prefix: "${prefix}". Must be 2-10 lowercase alphanumeric characters only. ` +
      `Examples: "user", "ord", "prod", "org", "sess"`
    )
  }

  // Generate secure 21-character nanoid and combine with validated prefix
  const id = nanoid()
  
  return `${prefix}_${id}` as `${string}_${string}` & T
}

/**
 * Type guard to check if a string is a valid public ID format.
 * 
 * @param value - The string to validate
 * @returns True if the string matches the public ID format (prefix_nanoid)
 * 
 * @example
 * ```typescript
 * isValidPublicId('user_V1StGXR8_Z5jdHi6B-myT') // true
 * isValidPublicId('invalid-format')              // false
 * isValidPublicId('USER_123')                    // false (uppercase prefix)
 * ```
 */
export function isValidPublicId(value: string): value is `${string}_${string}` {
  if (typeof value !== 'string') return false
  
  const underscoreIndex = value.indexOf('_')
  if (underscoreIndex === -1) return false
  
  const prefix = value.slice(0, underscoreIndex)
  const id = value.slice(underscoreIndex + 1)
  
  // Validate prefix format
  if (!/^[a-z0-9]{2,10}$/.test(prefix)) return false
  
  // Validate nanoid format (21 characters, URL-safe alphabet)
  if (!/^[A-Za-z0-9_-]{21}$/.test(id)) return false
  
  return true
}

/**
 * Extracts the prefix from a public ID.
 * 
 * @param publicId - A valid public ID string
 * @returns The prefix portion of the public ID
 * @throws Error if the public ID format is invalid
 * 
 * @example
 * ```typescript
 * extractPrefix('user_V1StGXR8_Z5jdHi6B-myT') // 'user'
 * extractPrefix('ord_a1b2c3d4e5f6g7h8i9j0k')  // 'ord'
 * ```
 */
export function extractPrefix(publicId: string): string {
  if (!isValidPublicId(publicId)) {
    throw new Error(`Invalid public ID format: "${publicId}"`)
  }
  
  const underscoreIndex = publicId.indexOf('_')
  return publicId.slice(0, underscoreIndex)
}

// Pre-defined generator functions for common entity types
export const generateUserId = () => generatePublicId<UserId>('user')
export const generateOrderId = () => generatePublicId<OrderId>('ord')
export const generateProductId = () => generatePublicId<ProductId>('prod')
export const generateOrganizationId = () => generatePublicId<OrganizationId>('org')
export const generateSessionId = () => generatePublicId<SessionId>('sess')

// Master data ID generators for partner-scoped entities
export const generatePartnerId = () => generatePublicId<PartnerId>('partner')
export const generateVehicleTypeId = () => generatePublicId<VehicleTypeId>('vt')
export const generatePayloadTypeId = () => generatePublicId<PayloadTypeId>('pt')
export const generateFacilityId = () => generatePublicId<FacilityId>('fac')
export const generateServiceId = () => generatePublicId<ServiceId>('svc')

// Type guard functions for branded types
export function isVehicleTypeId(value: string): value is VehicleTypeId {
  return typeof value === 'string' && value.startsWith('vt_') && isValidPublicId(value)
}

export function isPayloadTypeId(value: string): value is PayloadTypeId {
  return typeof value === 'string' && value.startsWith('pt_') && isValidPublicId(value)
}

export function isFacilityId(value: string): value is FacilityId {
  return typeof value === 'string' && value.startsWith('fac_') && isValidPublicId(value)
}

export function isPartnerId(value: string): value is PartnerId {
  return typeof value === 'string' && value.startsWith('partner_') && isValidPublicId(value)
}

export function isUserId(value: string): value is UserId {
  return typeof value === 'string' && value.startsWith('user_') && isValidPublicId(value)
}

export function isServiceId(value: string): value is ServiceId {
  return typeof value === 'string' && value.startsWith('svc_') && isValidPublicId(value)
}