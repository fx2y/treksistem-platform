/**
 * Master Data Middleware
 * 
 * Specialized middleware for master data operations that handles:
 * - Partner context validation and enforcement
 * - Ownership checks for data access
 * - Resource-specific authorization
 * - Master data parameter validation
 * 
 * This middleware integrates with the existing RBAC system and extends it
 * with master data specific business rules and partner isolation.
 */

import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { UserSession, PartnerId } from '@treksistem/types';
import { createDb } from '@treksistem/db';
import { masterVehicleTypes, masterPayloadTypes, masterFacilities } from '@treksistem/db';
import { eq } from 'drizzle-orm';
import { createMonitoringService } from '../services/monitoring.service';
import { getClientIP } from './security';

// Environment bindings interface for master data middleware
interface MasterDataEnv {
  DB: D1Database;
}

// Type assertion helper
function assertEnv(env: unknown): MasterDataEnv {
  return env as MasterDataEnv;
}

/**
 * Middleware to require partner context for operations
 * Partner admins must have a valid partner context, master admins can operate globally
 */
export function requirePartnerContext(
  allowGlobal: boolean = false
): MiddlewareHandler<{ Bindings: MasterDataEnv }> {
  return async (c: Context, next) => {
    const user = c.get('user') as UserSession | undefined;

    if (!user) {
      throw new HTTPException(401, {
        message: JSON.stringify({
          error: 'authentication_required',
          details: 'Partner context validation requires authentication',
        }),
      });
    }

    // Check if user is master admin (can operate globally)
    const isMasterAdmin = user.roles.some(role => role.role === 'MASTER_ADMIN');
    
    // Get partner context from user roles
    const partnerRole = user.roles.find(role => role.contextId);
    const partnerId = partnerRole?.contextId as PartnerId | null;

    // Master admins always have access
    if (isMasterAdmin) {
      c.set('partnerId', partnerId); // May be null for global operations
      c.set('isMasterAdmin', true);
      await next();
      return;
    }

    // For non-master admins, require partner context unless explicitly allowed global
    if (!allowGlobal && !partnerId) {
      const env = assertEnv(c.env);
      const db = createDb(env.DB);
      const monitoring = createMonitoringService(db);

      // Log partner context requirement failure
      await monitoring.recordSecurityEvent({
        type: 'auth_failure',
        userId: user.sub,
        email: user.email,
        details: {
          action: 'master_data_access_denied',
          reason: 'insufficient_partner_context',
          requiredContext: 'partner_admin_or_master_admin',
          userRoles: user.roles.map(r => r.role),
          operation: 'partner_context_validation',
        },
        timestamp: Date.now(),
        severity: 'warning',
      });

      throw new HTTPException(403, {
        message: JSON.stringify({
          error: 'partner_context_required',
          details: 'This operation requires a valid partner context',
        }),
      });
    }

    c.set('partnerId', partnerId);
    c.set('isMasterAdmin', false);
    await next();
  };
}

/**
 * Middleware to validate master data resource ownership
 * Ensures users can only access/modify master data within their partner scope
 */
export function validateResourceOwnership(
  resourceType: 'vehicle-types' | 'payload-types' | 'facilities'
): MiddlewareHandler<{ Bindings: MasterDataEnv }> {
  return async (c: Context, next) => {
    const user = c.get('user') as UserSession;
    const isMasterAdmin = c.get('isMasterAdmin') as boolean;
    const userPartnerId = c.get('partnerId') as PartnerId | null;
    
    // Get resource ID from path parameters
    const resourceId = c.req.param('id');
    
    // Skip ownership check for creation operations (no ID in path)
    if (!resourceId) {
      await next();
      return;
    }

    // Master admins can access any resource
    if (isMasterAdmin) {
      await next();
      return;
    }

    try {
      const env = assertEnv(c.env);
      const db = createDb(env.DB);
      
      // Check resource ownership based on type
      let resourceRecord: any = null;
      
      switch (resourceType) {
        case 'vehicle-types':
          const vehicleRecord = await db
            .select()
            .from(masterVehicleTypes)
            .where(eq(masterVehicleTypes.publicId, resourceId))
            .limit(1);
          resourceRecord = vehicleRecord[0];
          break;
          
        case 'payload-types':
          const payloadRecord = await db
            .select()
            .from(masterPayloadTypes)
            .where(eq(masterPayloadTypes.publicId, resourceId))
            .limit(1);
          resourceRecord = payloadRecord[0];
          break;
          
        case 'facilities':
          const facilityRecord = await db
            .select()
            .from(masterFacilities)
            .where(eq(masterFacilities.publicId, resourceId))
            .limit(1);
          resourceRecord = facilityRecord[0];
          break;
      }

      // Resource not found
      if (!resourceRecord) {
        throw new HTTPException(404, {
          message: JSON.stringify({
            error: 'resource_not_found',
            details: `${resourceType.replace('-', ' ')} with ID '${resourceId}' not found`,
          }),
        });
      }

      // Check ownership: global resources (partnerId = null) are accessible to all
      // Partner resources are only accessible to the owning partner
      const resourcePartnerId = resourceRecord.partnerId as PartnerId | null;
      
      if (resourcePartnerId && resourcePartnerId !== userPartnerId) {
        const monitoring = createMonitoringService(db);
        
        // Log ownership violation
        await monitoring.recordSecurityEvent({
          type: 'auth_failure',
          userId: user.sub,
          email: user.email,
          details: {
            action: 'master_data_access_denied',
            reason: 'resource_ownership_violation',
            resourceType,
            resourceId,
            resourcePartnerId,
            userPartnerId,
            path: c.req.path,
          },
          timestamp: Date.now(),
          severity: 'warning',
        });

        throw new HTTPException(403, {
          message: JSON.stringify({
            error: 'resource_access_denied',
            details: 'You do not have permission to access this resource',
          }),
        });
      }

      // Store resource info for use in handlers
      c.set('resourceRecord', resourceRecord);
      
      await next();
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      
      // Database or other unexpected error
      throw new HTTPException(500, {
        message: JSON.stringify({
          error: 'ownership_validation_failed',
          details: 'Unable to validate resource ownership',
        }),
      });
    }
  };
}

/**
 * Middleware to validate master data operation permissions
 * Different operations require different permission levels
 */
export function validateMasterDataOperation(
  operation: 'read' | 'create' | 'update' | 'delete'
): MiddlewareHandler<{ Bindings: MasterDataEnv }> {
  return async (c: Context, next) => {
    const user = c.get('user') as UserSession;
    const isMasterAdmin = c.get('isMasterAdmin') as boolean;
    
    // Master admins can perform any operation
    if (isMasterAdmin) {
      await next();
      return;
    }

    // Check if user has required role for the operation
    const hasPartnerAdminRole = user.roles.some(role => role.role === 'PARTNER_ADMIN');
    const hasDriverRole = user.roles.some(role => role.role === 'DRIVER');

    // Operation permission matrix
    const permissionMatrix: Record<string, boolean> = {
      read: hasPartnerAdminRole || hasDriverRole, // All authenticated users can read
      create: hasPartnerAdminRole, // Only partner admins and above can create
      update: hasPartnerAdminRole, // Only partner admins and above can update
      delete: hasPartnerAdminRole, // Only partner admins and above can delete
    };

    if (!permissionMatrix[operation]) {
      const env = assertEnv(c.env);
      const db = createDb(env.DB);
      const monitoring = createMonitoringService(db);

      // Log permission denied
      await monitoring.recordSecurityEvent({
        type: 'auth_failure',
        userId: user.sub,
        email: user.email,
        details: {
          action: 'master_data_access_denied',
          reason: 'insufficient_permissions',
          operation,
          resourceType: c.req.param('type'),
          requiredRoles: ['PARTNER_ADMIN', 'MASTER_ADMIN'],
          userRoles: user.roles.map(r => r.role),
        },
        timestamp: Date.now(),
        severity: 'warning',
      });

      throw new HTTPException(403, {
        message: JSON.stringify({
          error: 'operation_not_permitted',
          details: `Your role does not permit '${operation}' operations on master data`,
        }),
      });
    }

    await next();
  };
}

/**
 * Middleware to validate and sanitize master data parameters
 * Ensures API parameters are valid and safe
 */
export function validateMasterDataParams(): MiddlewareHandler<{ Bindings: MasterDataEnv }> {
  return async (c: Context, next) => {
    // Validate resource type parameter
    const resourceType = c.req.param('type');
    if (resourceType) {
      const validTypes = ['vehicle-types', 'payload-types', 'facilities'];
      if (!validTypes.includes(resourceType)) {
        throw new HTTPException(400, {
          message: JSON.stringify({
            error: 'invalid_resource_type',
            details: `Resource type must be one of: ${validTypes.join(', ')}`,
          }),
        });
      }
    }

    // Validate query parameters for filtering
    const query = c.req.query();
    
    // Validate isActive parameter
    if (query.isActive && !['true', 'false'].includes(query.isActive)) {
      throw new HTTPException(400, {
        message: JSON.stringify({
          error: 'invalid_parameter',
          details: 'isActive parameter must be "true" or "false"',
        }),
      });
    }

    // Validate displayOrder parameter
    if (query.displayOrder) {
      const order = parseInt(query.displayOrder, 10);
      if (isNaN(order) || order < 0) {
        throw new HTTPException(400, {
          message: JSON.stringify({
            error: 'invalid_parameter',
            details: 'displayOrder must be a non-negative integer',
          }),
        });
      }
    }

    // Validate pagination parameters
    if (query.limit) {
      const limit = parseInt(query.limit, 10);
      if (isNaN(limit) || limit < 1 || limit > 100) {
        throw new HTTPException(400, {
          message: JSON.stringify({
            error: 'invalid_parameter',
            details: 'limit must be between 1 and 100',
          }),
        });
      }
    }

    if (query.offset) {
      const offset = parseInt(query.offset, 10);
      if (isNaN(offset) || offset < 0) {
        throw new HTTPException(400, {
          message: JSON.stringify({
            error: 'invalid_parameter',
            details: 'offset must be a non-negative integer',
          }),
        });
      }
    }

    await next();
  };
}

/**
 * Helper middleware factory to combine common master data middleware
 */
export function createMasterDataMiddlewareStack(
  operation: 'read' | 'create' | 'update' | 'delete',
  resourceType?: 'vehicle-types' | 'payload-types' | 'facilities'
): MiddlewareHandler<{ Bindings: MasterDataEnv }>[] {
  const middleware: MiddlewareHandler<{ Bindings: MasterDataEnv }>[] = [
    validateMasterDataParams(),
    requirePartnerContext(operation === 'read'), // Allow global read access
    validateMasterDataOperation(operation),
  ];

  // Add resource ownership validation for operations that target specific resources
  if (resourceType && ['update', 'delete'].includes(operation)) {
    middleware.push(validateResourceOwnership(resourceType));
  }

  return middleware;
}