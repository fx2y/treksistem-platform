/**
 * Pricing Scheme Routes
 * 
 * Comprehensive CRUD endpoints for service-scoped pricing scheme management.
 * Implements Security→JWT→RBAC→Business middleware ordering with full
 * service context validation and audit logging.
 * 
 * Endpoints:
 * - POST   /api/v1/services/{serviceId}/pricing
 * - PUT    /api/v1/services/{serviceId}/pricing
 * - GET    /api/v1/services/{serviceId}/pricing
 * - DELETE /api/v1/services/{serviceId}/pricing
 */

import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { createDb } from '@treksistem/db';
import {
  createPricingSchemeService,
  PricingSchemeError,
} from '../services/pricing-scheme.service';
import { createMonitoringService } from '../services/monitoring.service';
import {
  createServiceMiddlewareStack,
  validateServiceParams,
} from '../middleware/service.middleware';
import { getCurrentUser, createJWTMiddleware } from '../middleware/jwt';
import type { UserSession, ServiceId } from '@treksistem/types';
import {
  CreateOrUpdatePricingSchemeDTOSchema,
  ServiceIdParamSchema,
} from '@treksistem/types';

// Environment bindings interface
interface PricingSchemeEnv {
  DB: D1Database;
}

// Error handler helper
function handlePricingSchemeError(error: unknown): HTTPException {
  if (error instanceof PricingSchemeError) {
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
  // Log error for debugging in development
  return new HTTPException(500, {
    message: JSON.stringify({
      error: 'internal_server_error',
      details: 'An unexpected error occurred',
    }),
  });
}

// Create pricing scheme router
export function createPricingSchemeRouter() {
  const app = new Hono<{ Bindings: PricingSchemeEnv }>();

  // Apply base middleware to all routes
  app.use('*', validateServiceParams()); // Parameter validation

  // POST /api/v1/services/{serviceId}/pricing - Create pricing scheme for service
  app.post(
    '/services/:serviceId/pricing',
    zValidator('param', ServiceIdParamSchema),
    zValidator('json', CreateOrUpdatePricingSchemeDTOSchema),
    ...createServiceMiddlewareStack('admin', true),
    async (c: Context) => {
      try {
        const serviceId = c.req.param('serviceId') as ServiceId;
        const data = c.req.valid('json' as never);
        const user = getCurrentUser(c) as UserSession;

        const pricingSchemeService = createPricingSchemeService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const pricingScheme = await pricingSchemeService.createPricingScheme(
          serviceId,
          data,
          user
        );

        return c.json({
          success: true,
          data: pricingScheme,
          timestamp: Date.now(),
        }, 201);
      } catch (error) {
        throw handlePricingSchemeError(error);
      }
    }
  );

  // PUT /api/v1/services/{serviceId}/pricing - Update pricing scheme
  app.put(
    '/services/:serviceId/pricing',
    zValidator('param', ServiceIdParamSchema),
    zValidator('json', CreateOrUpdatePricingSchemeDTOSchema),
    ...createServiceMiddlewareStack('admin', true),
    async (c: Context) => {
      try {
        const serviceId = c.req.param('serviceId') as ServiceId;
        const data = c.req.valid('json' as never);
        const user = getCurrentUser(c) as UserSession;

        const pricingSchemeService = createPricingSchemeService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const pricingScheme = await pricingSchemeService.updatePricingScheme(
          serviceId,
          data,
          user
        );

        return c.json({
          success: true,
          data: pricingScheme,
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handlePricingSchemeError(error);
      }
    }
  );

  // GET /api/v1/services/{serviceId}/pricing - Get pricing scheme for service
  app.get(
    '/services/:serviceId/pricing',
    zValidator('param', ServiceIdParamSchema),
    validateServiceParams(),
    createJWTMiddleware({ required: false }),
    async (c: Context) => {
      try {
        const serviceId = c.req.param('serviceId') as ServiceId;
        const user = getCurrentUser(c);

        const pricingSchemeService = createPricingSchemeService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const pricingScheme = await pricingSchemeService.getPricingSchemeByServiceId(
          serviceId,
          user ?? undefined
        );

        return c.json({
          success: true,
          data: pricingScheme,
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handlePricingSchemeError(error);
      }
    }
  );

  // DELETE /api/v1/services/{serviceId}/pricing - Delete pricing scheme
  app.delete(
    '/services/:serviceId/pricing',
    zValidator('param', ServiceIdParamSchema),
    ...createServiceMiddlewareStack('admin', true),
    async (c: Context) => {
      try {
        const serviceId = c.req.param('serviceId') as ServiceId;
        const user = getCurrentUser(c) as UserSession;

        const pricingSchemeService = createPricingSchemeService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        await pricingSchemeService.deletePricingScheme(serviceId, user);

        return c.json({
          success: true,
          message: 'Pricing scheme deleted successfully',
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handlePricingSchemeError(error);
      }
    }
  );

  // Health check endpoint
  app.get('/pricing-schemes/health', async (c: Context) => {
    try {
      const db = createDb(c.env.DB);
      
      // Simple database connectivity test
      const start = Date.now();
      await db.query.pricingSchemes.findFirst({
        columns: { id: true }
      });
      const responseTime = Date.now() - start;

      return c.json({
        status: 'healthy',
        service: 'pricing-schemes',
        database: {
          status: 'connected',
          responseTime: `${responseTime}ms`,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      return c.json({
        status: 'unhealthy',
        service: 'pricing-schemes',
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