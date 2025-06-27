/**
 * Partner Routes
 * 
 * Comprehensive CRUD endpoints for partner management with multi-tenant support.
 * Implements Security→JWT→RBAC→Business middleware ordering with full
 * partner context validation and audit logging.
 * 
 * Endpoints:
 * - GET    /api/v1/partners (admin only - list all partners with filters)
 * - POST   /api/v1/partners (create new partner)
 * - GET    /api/v1/partners/:partnerId (get partner details)
 * - PUT    /api/v1/partners/:partnerId (update partner)
 * - DELETE /api/v1/partners/:partnerId (soft delete partner)
 * - GET    /api/v1/partners/:partnerId/statistics (get partner statistics)
 * - PUT    /api/v1/partners/:partnerId/subscription (update subscription)
 * - POST   /api/v1/partners/:partnerId/activate (activate partner)
 * - POST   /api/v1/partners/:partnerId/deactivate (deactivate partner)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createDb } from '@treksistem/db';
import { createPartnerService, PartnerError } from '../services/partner.service';
import { createMonitoringService } from '../services/monitoring.service';
import { requireAuth, getCurrentUser, requireMasterAdmin } from '../middleware/jwt';
import type { 
  UserSession, 
  PartnerId, 
  AuthenticatedContext,
  BusinessType,
  SubscriptionTier 
} from '@treksistem/types';
import { isPartnerId } from '@treksistem/utils';

// Environment bindings interface
interface PartnerEnv {
  DB: D1Database;
}

// Validation schemas
const createPartnerSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(100, 'Name must be less than 100 characters'),
  businessType: z.enum(['UMKM', 'CORPORATION', 'INDIVIDUAL']).optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  address: z.string().max(255, 'Address must be less than 255 characters').optional(),
  phoneNumber: z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format').optional(),
  email: z.string().email('Invalid email format').optional(),
  websiteUrl: z.string().url('Invalid website URL').optional(),
  logoUrl: z.string().url('Invalid logo URL').optional(),
  locationLat: z.number().min(-90).max(90).optional(),
  locationLng: z.number().min(-180).max(180).optional(),
  businessRegistrationNumber: z.string().max(50).optional(),
  taxIdentificationNumber: z.string().max(50).optional(),
  subscriptionTier: z.enum(['BASIC', 'PREMIUM', 'ENTERPRISE']).optional(),
});

const updatePartnerSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  businessType: z.enum(['UMKM', 'CORPORATION', 'INDIVIDUAL']).optional(),
  description: z.string().max(500).optional(),
  address: z.string().max(255).optional(),
  phoneNumber: z.string().regex(/^\+?[\d\s\-\(\)]+$/).optional(),
  email: z.string().email().optional(),
  websiteUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  locationLat: z.number().min(-90).max(90).optional(),
  locationLng: z.number().min(-180).max(180).optional(),
  businessRegistrationNumber: z.string().max(50).optional(),
  taxIdentificationNumber: z.string().max(50).optional(),
  subscriptionTier: z.enum(['BASIC', 'PREMIUM', 'ENTERPRISE']).optional(),
  isActive: z.boolean().optional(),
  maxDrivers: z.number().int().min(1).max(1000).optional(),
  maxVehicles: z.number().int().min(1).max(1000).optional(),
});

const partnerFiltersSchema = z.object({
  businessType: z.enum(['UMKM', 'CORPORATION', 'INDIVIDUAL']).optional(),
  subscriptionTier: z.enum(['BASIC', 'PREMIUM', 'ENTERPRISE']).optional(),
  isActive: z.boolean().optional(),
  search: z.string().max(100).optional(),
  page: z.number().int().min(1).default(1).optional(),
  limit: z.number().int().min(1).max(100).default(20).optional(),
});

const updateSubscriptionSchema = z.object({
  subscriptionTier: z.enum(['BASIC', 'PREMIUM', 'ENTERPRISE']),
});

const partnerIdParamSchema = z.object({
  partnerId: z.string().refine(isPartnerId, 'Invalid partner ID format'),
});

// Partner-specific middleware for permission validation
function requirePartnerAccess(permission: 'read' | 'admin' = 'read') {
  return async (c: Context, next: () => Promise<void>) => {
    const user = getCurrentUser(c);
    if (!user) {
      return c.json({ error: 'authentication_required', details: 'User session not found' }, 401);
    }

    const { partnerId } = c.req.param();
    if (!partnerId || !isPartnerId(partnerId)) {
      return c.json({ error: 'invalid_partner_id', details: 'Valid partner ID required' }, 400);
    }

    // Master admin bypasses all partner restrictions
    const isMasterAdmin = user.roles.some(role => role.role === 'MASTER_ADMIN');
    if (isMasterAdmin) {
      return next();
    }

    // Check partner-specific permissions
    const hasAccess = user.roles.some(role => {
      if (role.contextId !== partnerId) return false;
      
      if (permission === 'read') {
        return role.role === 'PARTNER_ADMIN' || role.role === 'DRIVER';
      } else if (permission === 'admin') {
        return role.role === 'PARTNER_ADMIN';
      }
      
      return false;
    });

    if (!hasAccess) {
      return c.json({ 
        error: 'insufficient_partner_permissions', 
        details: `${permission} access denied for partner ${partnerId}` 
      }, 403);
    }

    return next();
  };
}

// Error handler helper
function handleServiceError(error: unknown): HTTPException {
  if (error instanceof PartnerError) {
    return new HTTPException(error.statusCode as 400 | 401 | 403 | 404 | 409 | 422 | 500, {
      message: JSON.stringify({
        error: error.code,
        details: error.message,
      }),
    });
  }

  if (error instanceof HTTPException) {
    return error;
  }

  // Generic server error
  console.error('Unexpected error in partner operation:', error);
  return new HTTPException(500, {
    message: JSON.stringify({
      error: 'internal_server_error',
      details: 'An unexpected error occurred',
    }),
  });
}

// Create partner router
export function createPartnerRouter() {
  const app = new Hono<{ Bindings: PartnerEnv }>();

  // Apply JWT authentication to all routes
  app.use('*', requireAuth);

  // List partners (admin only)
  app.get('/', 
    requireMasterAdmin,
    zValidator('query', partnerFiltersSchema),
    async (c: Context) => {
      try {
        const user = getCurrentUser(c);
        if (!user) {
          throw new HTTPException(401, {
            message: JSON.stringify({
              error: 'authentication_required',
              details: 'User session not found'
            })
          });
        }
        const filters = c.req.valid('query' as never);
        
        const partnerService = createPartnerService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const result = await partnerService.getPartners(filters, user);

        return c.json(result);
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Create new partner
  app.post('/',
    zValidator('json', createPartnerSchema),
    async (c: Context) => {
      try {
        const user = getCurrentUser(c);
        if (!user) {
          throw new HTTPException(401, {
            message: JSON.stringify({
              error: 'authentication_required',
              details: 'User session not found'
            })
          });
        }
        const data = c.req.valid('json' as never);
        
        const partnerService = createPartnerService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const partner = await partnerService.createPartner(user, data);

        return c.json(partner, 201);
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Get partner details
  app.get('/:partnerId',
    zValidator('param', partnerIdParamSchema),
    requirePartnerAccess('read'),
    async (c: Context) => {
      try {
        const user = getCurrentUser(c);
        if (!user) {
          throw new HTTPException(401, {
            message: JSON.stringify({
              error: 'authentication_required',
              details: 'User session not found'
            })
          });
        }
        const { partnerId } = c.req.valid('param' as never);
        
        const partnerService = createPartnerService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const partner = await partnerService.getPartner(partnerId as PartnerId, user);

        return c.json(partner);
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Update partner
  app.put('/:partnerId',
    zValidator('param', partnerIdParamSchema),
    zValidator('json', updatePartnerSchema),
    requirePartnerAccess('admin'),
    async (c: Context) => {
      try {
        const user = getCurrentUser(c);
        if (!user) {
          throw new HTTPException(401, {
            message: JSON.stringify({
              error: 'authentication_required',
              details: 'User session not found'
            })
          });
        }
        const { partnerId } = c.req.valid('param' as never);
        const data = c.req.valid('json' as never);
        
        const partnerService = createPartnerService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const partner = await partnerService.updatePartner(user, partnerId as PartnerId, data);

        return c.json(partner);
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Delete partner (soft delete)
  app.delete('/:partnerId',
    zValidator('param', partnerIdParamSchema),
    requirePartnerAccess('admin'),
    async (c: Context) => {
      try {
        const user = getCurrentUser(c);
        if (!user) {
          throw new HTTPException(401, {
            message: JSON.stringify({
              error: 'authentication_required',
              details: 'User session not found'
            })
          });
        }
        const { partnerId } = c.req.valid('param' as never);
        
        const partnerService = createPartnerService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        await partnerService.deletePartner(user, partnerId as PartnerId);

        return c.json({ success: true }, 200);
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Get partner statistics
  app.get('/:partnerId/statistics',
    zValidator('param', partnerIdParamSchema),
    requirePartnerAccess('read'),
    async (c: Context) => {
      try {
        const user = getCurrentUser(c);
        if (!user) {
          throw new HTTPException(401, {
            message: JSON.stringify({
              error: 'authentication_required',
              details: 'User session not found'
            })
          });
        }
        const { partnerId } = c.req.valid('param' as never);
        
        const partnerService = createPartnerService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const statistics = await partnerService.getPartnerStatistics(partnerId as PartnerId, user);

        return c.json({
          success: true,
          data: statistics,
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Update subscription tier
  app.put('/:partnerId/subscription',
    zValidator('param', partnerIdParamSchema),
    zValidator('json', updateSubscriptionSchema),
    requirePartnerAccess('admin'),
    async (c: Context) => {
      try {
        const user = getCurrentUser(c);
        if (!user) {
          throw new HTTPException(401, {
            message: JSON.stringify({
              error: 'authentication_required',
              details: 'User session not found'
            })
          });
        }
        const { partnerId } = c.req.valid('param' as never);
        const { subscriptionTier } = c.req.valid('json' as never);
        
        const partnerService = createPartnerService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const partner = await partnerService.updateSubscription(
          partnerId as PartnerId, 
          subscriptionTier as SubscriptionTier, 
          user
        );

        return c.json(partner);
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Activate partner
  app.post('/:partnerId/activate',
    zValidator('param', partnerIdParamSchema),
    requirePartnerAccess('admin'),
    async (c: Context) => {
      try {
        const user = getCurrentUser(c);
        if (!user) {
          throw new HTTPException(401, {
            message: JSON.stringify({
              error: 'authentication_required',
              details: 'User session not found'
            })
          });
        }
        const { partnerId } = c.req.valid('param' as never);
        
        const partnerService = createPartnerService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const partner = await partnerService.activatePartner(partnerId as PartnerId, user);

        return c.json(partner);
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Deactivate partner
  app.post('/:partnerId/deactivate',
    zValidator('param', partnerIdParamSchema),
    requirePartnerAccess('admin'),
    async (c: Context) => {
      try {
        const user = getCurrentUser(c);
        if (!user) {
          throw new HTTPException(401, {
            message: JSON.stringify({
              error: 'authentication_required',
              details: 'User session not found'
            })
          });
        }
        const { partnerId } = c.req.valid('param' as never);
        
        const partnerService = createPartnerService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const partner = await partnerService.deactivatePartner(partnerId as PartnerId, user);

        return c.json(partner);
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Health check endpoint
  app.get('/health', async (c: Context) => {
    try {
      const db = createDb(c.env.DB);
      const start = Date.now();
      
      // Simple DB health check
      await db.query.partners.findFirst({
        columns: { id: true }
      });
      
      const responseTime = Date.now() - start;

      return c.json({
        status: 'healthy',
        service: 'partner-management',
        responseTime: `${responseTime}ms`,
        timestamp: Date.now(),
      });
    } catch (error) {
      return c.json({
        status: 'unhealthy',
        service: 'partner-management',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }, 503);
    }
  });

  return app;
}