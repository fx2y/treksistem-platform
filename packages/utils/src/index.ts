/**
 * @fileoverview Treksistem Utilities Package
 * 
 * This package provides shared utilities for the Treksistem platform, focusing on
 * secure, non-sequential public identifier generation optimized for Cloudflare Workers.
 * 
 * ## Features
 * - 🔒 Cryptographically secure ID generation using nanoid v5.x
 * - 🎯 TypeScript branded types for enhanced type safety
 * - ⚡ Optimized for Cloudflare Workers V8 engine (>1M ops/sec)
 * - 🌐 URL-safe identifiers with customizable prefixes
 * - 🛡️ Prevents data enumeration vulnerabilities
 * - 📦 ESM-only with tree-shaking support
 * 
 * ## Usage
 * ```typescript
 * import { generatePublicId, generateUserId, type UserId } from '@treksistem/utils'
 * 
 * // Generate typed IDs
 * const userId = generateUserId()                    // "user_V1StGXR8_Z5jdHi6B-myT"
 * const customId = generatePublicId<UserId>('user')  // "user_a1b2c3d4e5f6g7h8i9j0k"
 * 
 * // Type-safe function parameters
 * function getUserData(id: UserId) {
 *   // TypeScript ensures only UserId can be passed
 *   return api.get(`/users/${id}`)
 * }
 * ```
 * 
 * @author Treksistem Platform Team
 * @version 0.1.0
 * @license MIT
 */

// Core identifier generation and validation
export {
  generatePublicId,
  isValidPublicId,
  extractPrefix,
} from './identifiers.js'

// Branded TypeScript types for enhanced type safety
export type {
  UserId,
  OrderId,
  ProductId,
  OrganizationId,
  SessionId,
  PartnerId,
  VehicleTypeId,
  PayloadTypeId,
  FacilityId,
} from './identifiers.js'

// Pre-defined generator functions for common entity types
export {
  generateUserId,
  generateOrderId,
  generateProductId,
  generateOrganizationId,
  generateSessionId,
  generatePartnerId,
  generateVehicleTypeId,
  generatePayloadTypeId,
  generateFacilityId,
} from './identifiers.js'

// Re-export everything from identifiers for convenience
export * from './identifiers.js'