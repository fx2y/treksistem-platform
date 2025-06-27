/**
 * Service Routes
 * 
 * Comprehensive CRUD endpoints for partner-scoped service management.
 * Implements Security→JWT→RBAC→Business middleware ordering with full
 * partner context validation and audit logging.
 * 
 * Endpoints:
 * - POST   /api/v1/partners/{partnerId}/services
 * - PUT    /api/v1/services/{serviceId}
 * - GET    /api/v1/services/{serviceId}
 * - GET    /api/v1/partners/{partnerId}/services
 * - DELETE /api/v1/services/{serviceId}
 */

import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createDb } from '@treksistem/db';
import { createServiceService, ServiceError } from '../services/service.service';
import { createMonitoringService } from '../services/monitoring.service';
import {
  createServiceMiddlewareStack,
  validateServiceParams,
} from '../middleware/service.middleware';
import { getCurrentUser } from '../middleware/jwt';
import type { UserSession, PartnerId, ServiceId } from '@treksistem/types';
import { createServiceSchema, updateServiceSchema } from '@treksistem/types';

// Environment bindings interface
interface ServiceEnv {
  DB: D1Database;
}

// Type assertion helper
function getEnvDB(env: unknown): D1Database {
  return (env as ServiceEnv).DB;
}

// Error handler helper
function handleServiceError(error: unknown): HTTPException {
  if (error instanceof ServiceError) {
    return new HTTPException(error.statusCode as 400 | 401 | 403 | 404 | 409 | 500, {
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
  console.error('Unexpected error in service operation:', error);
  return new HTTPException(500, {
    message: JSON.stringify({
      error: 'internal_server_error',
      details: 'An unexpected error occurred',
    }),
  });
}

// Create service router
export function createServiceRouter() {
  const app = new Hono<{ Bindings: ServiceEnv }>();

  // Apply base middleware to all routes
  app.use('*', validateServiceParams()); // Parameter validation

  // POST /api/v1/partners/{partnerId}/services - Create service for specific partner
  app.post(
    '/partners/:partnerId/services',
    zValidator('json', createServiceSchema),
    ...createServiceMiddlewareStack('admin'),
    async (c: Context) => {
      try {
        const partnerId = c.req.param('partnerId') as PartnerId;
        const data = c.req.valid('json');
        const user = getCurrentUser(c) as UserSession;

        // Validate that the user has access to create services for this partner
        const userPartnerId = c.get('partnerId') as PartnerId | null;
        const isMasterAdmin = c.get('isMasterAdmin') as boolean;
        
        if (!isMasterAdmin && partnerId !== userPartnerId) {
          throw new HTTPException(403, {
            message: JSON.stringify({
              error: 'forbidden',
              details: 'Cannot create services for other partners',
            }),
          });
        }

        const serviceService = createServiceService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const service = await serviceService.createService(data, user);

        return c.json({
          success: true,
          data: service,
          timestamp: Date.now(),
        }, 201);
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // PUT /api/v1/services/{serviceId} - Update service
  app.put(
    '/services/:serviceId',
    zValidator('json', updateServiceSchema),
    ...createServiceMiddlewareStack('admin', true),
    async (c: Context) => {
      try {
        const serviceId = c.req.param('serviceId') as ServiceId;
        const data = c.req.valid('json');
        const user = getCurrentUser(c) as UserSession;
        const serviceService = createServiceService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const service = await serviceService.updateService(serviceId, data, user);

        return c.json({
          success: true,
          data: service,
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // GET /api/v1/services/{serviceId} - Get single service
  app.get(
    '/services/:serviceId',
    ...createServiceMiddlewareStack('read', true),
    async (c: Context) => {
      try {
        const serviceId = c.req.param('serviceId') as ServiceId;
        const partnerId = c.get('partnerId') as PartnerId | null;
        const serviceService = createServiceService(
          getEnvDB(c.env),
          createMonitoringService(createDb(getEnvDB(c.env)))
        );

        const service = await serviceService.getServiceByPublicId(serviceId, partnerId || undefined);

        return c.json({
          success: true,
          data: service,
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // GET /api/v1/partners/{partnerId}/services - Get all services for partner
  app.get(
    '/partners/:partnerId/services',
    ...createServiceMiddlewareStack('read'),
    async (c: Context) => {
      try {
        const partnerId = c.req.param('partnerId') as PartnerId;
        const user = getCurrentUser(c) as UserSession;

        // Validate that the user has access to read services for this partner
        const userPartnerId = c.get('partnerId') as PartnerId | null;
        const isMasterAdmin = c.get('isMasterAdmin') as boolean;
        
        if (!isMasterAdmin && partnerId !== userPartnerId) {
          throw new HTTPException(403, {
            message: JSON.stringify({
              error: 'forbidden',
              details: 'Cannot access services for other partners',
            }),
          });
        }

        const serviceService = createServiceService(
          getEnvDB(c.env),
          createMonitoringService(createDb(getEnvDB(c.env)))
        );

        const services = await serviceService.getServicesByPartnerId(partnerId);

        return c.json({
          success: true,
          data: services,
          count: services.length,
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // DELETE /api/v1/services/{serviceId} - Delete service (soft delete)
  app.delete(
    '/services/:serviceId',
    ...createServiceMiddlewareStack('admin', true),
    async (c: Context) => {
      try {
        const serviceId = c.req.param('serviceId') as ServiceId;
        const user = getCurrentUser(c) as UserSession;
        const serviceService = createServiceService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        await serviceService.deleteService(serviceId, user);

        return c.json({
          success: true,
          message: 'Service deleted successfully',
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Health check endpoint
  app.get('/health', async (c: Context) => {
    try {
      const db = createDb(c.env.DB);
      
      // Simple database connectivity test
      const start = Date.now();
      await db.query.services.findFirst({
        columns: { id: true }
      });
      const responseTime = Date.now() - start;

      return c.json({
        status: 'healthy',
        service: 'services',
        database: {
          status: 'connected',
          responseTime: `${responseTime}ms`,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      return c.json({
        status: 'unhealthy',
        service: 'services',
        database: {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
      }, 503);
    }
  });

  return app;
}