/**
 * Service Middleware
 * 
 * Specialized middleware for service operations that handles:
 * - Partner context validation and enforcement for services
 * - Service ownership checks for data access
 * - Service-specific authorization
 * - Service parameter validation
 * 
 * This middleware integrates with the existing RBAC system and enforces
 * service-specific business rules and partner isolation.
 */

import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { UserSession, PartnerId, ServiceId } from '@treksistem/types';
import { createDb } from '@treksistem/db';
import { services } from '@treksistem/db';
import { eq, and } from 'drizzle-orm';
import { createMonitoringService } from '../services/monitoring.service';

// Environment bindings interface for service middleware
interface ServiceEnv {
  DB: D1Database;
}

// Type assertion helper
function assertEnv(env: unknown): ServiceEnv {
  return env as ServiceEnv;
}

/**
 * Middleware to require partner access for service operations
 * Partner admins must have a valid partner context, master admins can operate globally
 */
export function requirePartnerAccess(
  operation: 'read' | 'admin' = 'read'
): MiddlewareHandler<{ Bindings: ServiceEnv }> {
  return async (c: Context, next) => {
    const user = c.get('user') as UserSession | undefined;

    if (!user) {
      throw new HTTPException(401, {
        message: JSON.stringify({
          error: 'authentication_required',
          details: 'Service operations require authentication',
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
      c.set('partnerId', partnerId);
      c.set('isMasterAdmin', true);
      await next();
      return;
    }

    // For services, we always require partner context (services are never global)
    if (!partnerId) {
      const env = assertEnv(c.env);
      const db = createDb(env.DB);
      const monitoring = createMonitoringService(db);

      // Log partner context requirement failure
      await monitoring.recordSecurityEvent({
        type: 'auth_failure',
        userId: user.sub,
        email: user.email,
        details: {
          action: 'service_access_denied',
          reason: 'insufficient_partner_context',
          requiredContext: 'partner_admin_or_master_admin',
          userRoles: user.roles.map(r => r.role),
          operation: 'service_access_validation',
        },
        timestamp: Date.now(),
        severity: 'warning',
      });

      throw new HTTPException(403, {
        message: JSON.stringify({
          error: 'partner_context_required',
          details: 'Service operations require a valid partner context',
        }),
      });
    }

    // Check role permissions for admin operations
    if (operation === 'admin') {
      const hasAdminRole = user.roles.some(role => 
        role.role === 'PARTNER_ADMIN' && role.contextId === partnerId
      );
      
      if (!hasAdminRole) {
        const env = assertEnv(c.env);
        const db = createDb(env.DB);
        const monitoring = createMonitoringService(db);

        await monitoring.recordSecurityEvent({
          type: 'auth_failure',
          userId: user.sub,
          email: user.email,
          details: {
            action: 'service_access_denied',
            reason: 'insufficient_permissions',
            operation,
            requiredRoles: ['PARTNER_ADMIN', 'MASTER_ADMIN'],
            userRoles: user.roles.map(r => r.role),
          },
          timestamp: Date.now(),
          severity: 'warning',
        });

        throw new HTTPException(403, {
          message: JSON.stringify({
            error: 'insufficient_permissions',
            details: 'Admin operations require PARTNER_ADMIN role or higher',
          }),
        });
      }
    }

    c.set('partnerId', partnerId);
    c.set('isMasterAdmin', false);
    await next();
  };
}

/**
 * Middleware to validate service ownership
 * Ensures users can only access/modify services within their partner scope
 */
export function requireServiceAccess(
  operation: 'read' | 'admin' = 'read'
): MiddlewareHandler<{ Bindings: ServiceEnv }> {
  return async (c: Context, next) => {
    const user = c.get('user') as UserSession;
    const isMasterAdmin = c.get('isMasterAdmin') as boolean;
    const userPartnerId = c.get('partnerId') as PartnerId | null;
    
    // Get service ID from path parameters
    const serviceId = c.req.param('serviceId') || c.req.param('id');
    
    // Skip ownership check for list operations (no ID in path)
    if (!serviceId) {
      await next();
      return;
    }

    // Master admins can access any service
    if (isMasterAdmin) {
      await next();
      return;
    }

    try {
      const env = assertEnv(c.env);
      const db = createDb(env.DB);
      
      // Check service ownership
      const serviceRecord = await db
        .select()
        .from(services)
        .where(
          and(
            eq(services.publicId, serviceId as ServiceId),
            eq(services.isActive, true)
          )
        )
        .limit(1);

      // Service not found
      if (!serviceRecord[0]) {
        throw new HTTPException(404, {
          message: JSON.stringify({
            error: 'service_not_found',
            details: `Service with ID '${serviceId}' not found`,
          }),
        });
      }

      const service = serviceRecord[0];
      
      // Check ownership: services are always partner-scoped
      if (service.partnerId !== userPartnerId) {
        const monitoring = createMonitoringService(db);
        
        // Log ownership violation
        await monitoring.recordSecurityEvent({
          type: 'auth_failure',
          userId: user.sub,
          email: user.email,
          details: {
            action: 'service_access_denied',
            reason: 'service_ownership_violation',
            serviceId,
            servicePartnerId: service.partnerId,
            userPartnerId,
            path: c.req.path,
          },
          timestamp: Date.now(),
          severity: 'warning',
        });

        throw new HTTPException(403, {
          message: JSON.stringify({
            error: 'service_access_denied',
            details: 'You do not have permission to access this service',
          }),
        });
      }

      // For admin operations, check role permissions
      if (operation === 'admin') {
        const hasAdminRole = user.roles.some(role => 
          role.role === 'PARTNER_ADMIN' && role.contextId === userPartnerId
        );
        
        if (!hasAdminRole) {
          const monitoring = createMonitoringService(db);

          await monitoring.recordSecurityEvent({
            type: 'auth_failure',
            userId: user.sub,
            email: user.email,
            details: {
              action: 'service_access_denied',
              reason: 'insufficient_permissions',
              operation,
              serviceId,
              requiredRoles: ['PARTNER_ADMIN', 'MASTER_ADMIN'],
              userRoles: user.roles.map(r => r.role),
            },
            timestamp: Date.now(),
            severity: 'warning',
          });

          throw new HTTPException(403, {
            message: JSON.stringify({
              error: 'insufficient_permissions',
              details: 'Admin operations require PARTNER_ADMIN role or higher',
            }),
          });
        }
      }

      // Store service info for use in handlers
      c.set('serviceRecord', service);
      
      await next();
      
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      
      // Database or other unexpected error
      throw new HTTPException(500, {
        message: JSON.stringify({
          error: 'service_access_validation_failed',
          details: 'Unable to validate service access',
        }),
      });
    }
  };
}

/**
 * Middleware to validate service parameters
 * Ensures API parameters are valid and safe
 */
export function validateServiceParams(): MiddlewareHandler<{ Bindings: ServiceEnv }> {
  return async (c: Context, next) => {
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

    // Validate partner ID parameter if present
    const partnerId = c.req.param('partnerId');
    if (partnerId && !partnerId.startsWith('partner_')) {
      throw new HTTPException(400, {
        message: JSON.stringify({
          error: 'invalid_parameter',
          details: 'Partner ID must have "partner_" prefix',
        }),
      });
    }

    // Validate service ID parameter if present
    const serviceId = c.req.param('serviceId') || c.req.param('id');
    if (serviceId && !serviceId.startsWith('svc_')) {
      throw new HTTPException(400, {
        message: JSON.stringify({
          error: 'invalid_parameter',
          details: 'Service ID must have "svc_" prefix',
        }),
      });
    }

    await next();
  };
}

/**
 * Helper middleware factory to combine common service middleware
 */
export function createServiceMiddlewareStack(
  operation: 'read' | 'admin',
  requiresServiceId: boolean = false
): MiddlewareHandler<{ Bindings: ServiceEnv }>[] {
  const middleware: MiddlewareHandler<{ Bindings: ServiceEnv }>[] = [
    validateServiceParams(),
    requirePartnerAccess(operation),
  ];

  // Add service ownership validation for operations that target specific services
  if (requiresServiceId) {
    middleware.push(requireServiceAccess(operation));
  }

  return middleware;
}