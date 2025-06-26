/**
 * Master Data Routes
 * 
 * Comprehensive CRUD endpoints for partner-scoped master data management.
 * Implements Security→JWT→RBAC→Business middleware ordering with full
 * partner context validation and audit logging.
 * 
 * Endpoints:
 * - GET    /api/v1/master-data/vehicle-types
 * - POST   /api/v1/master-data/vehicle-types
 * - GET    /api/v1/master-data/vehicle-types/:id
 * - PUT    /api/v1/master-data/vehicle-types/:id
 * - DELETE /api/v1/master-data/vehicle-types/:id
 * 
 * Similar patterns for payload-types and facilities
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createDb } from '@treksistem/db';
import { createMasterDataService, MasterDataError } from '../services/master-data.service';
import { createMonitoringService } from '../services/monitoring.service';
import {
  requirePartnerContext,
  validateMasterDataOperation,
  validateResourceOwnership,
  validateMasterDataParams,
  createMasterDataMiddlewareStack,
} from '../middleware/master-data.middleware';
import { requireAuth, requireRole, getCurrentUser } from '../middleware/jwt';
import type { UserSession, PartnerId, VehicleTypeId, PayloadTypeId, FacilityId } from '@treksistem/types';

// Environment bindings interface
interface MasterDataEnv {
  DB: D1Database;
}

// Validation schemas
const createVehicleTypeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  iconUrl: z.string().url(),
  displayOrder: z.number().int().min(0).max(1000).optional(),
  capabilities: z.array(z.string()).optional(),
});

const updateVehicleTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  iconUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(1000).optional(),
  capabilities: z.array(z.string()).optional(),
});

const createPayloadTypeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  iconUrl: z.string().url(),
  displayOrder: z.number().int().min(0).max(1000).optional(),
  requirements: z.array(z.string()).optional(),
});

const updatePayloadTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  iconUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(1000).optional(),
  requirements: z.array(z.string()).optional(),
});

const createFacilitySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  iconUrl: z.string().url(),
  displayOrder: z.number().int().min(0).max(1000).optional(),
  category: z.string().min(1).max(50),
});

const updateFacilitySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  iconUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(1000).optional(),
  category: z.string().min(1).max(50).optional(),
});

// Error handler helper
function handleServiceError(error: unknown): HTTPException {
  if (error instanceof MasterDataError) {
    return new HTTPException(error.statusCode, {
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
  console.error('Unexpected error in master data operation:', error);
  return new HTTPException(500, {
    message: JSON.stringify({
      error: 'internal_server_error',
      details: 'An unexpected error occurred',
    }),
  });
}

// Create master data router
export function createMasterDataRouter() {
  const app = new Hono<{ Bindings: MasterDataEnv }>();

  // Apply base middleware to all routes
  app.use('*', requireAuth); // JWT authentication required
  app.use('*', validateMasterDataParams()); // Parameter validation

  // Combined master data endpoint
  app.get('/', ...createMasterDataMiddlewareStack('read'), async (c: Context) => {
    try {
      const partnerId = c.get('partnerId') as PartnerId | null;
      const masterDataService = createMasterDataService(
        c.env.DB,
        createMonitoringService(createDb(c.env.DB))
      );

      const masterData = await masterDataService.getAllMasterData(partnerId || undefined);

      return c.json({
        success: true,
        data: masterData,
        timestamp: Date.now(),
      });
    } catch (error) {
      throw handleServiceError(error);
    }
  });

  // Vehicle Types routes
  const vehicleTypesRouter = new Hono<{ Bindings: MasterDataEnv }>();

  // List vehicle types
  vehicleTypesRouter.get('/', ...createMasterDataMiddlewareStack('read'), async (c: Context) => {
    try {
      const partnerId = c.get('partnerId') as PartnerId | null;
      const masterDataService = createMasterDataService(
        c.env.DB,
        createMonitoringService(createDb(c.env.DB))
      );

      const vehicleTypes = await masterDataService.getVehicleTypes(partnerId || undefined);

      return c.json({
        success: true,
        data: vehicleTypes,
        count: vehicleTypes.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      throw handleServiceError(error);
    }
  });

  // Get vehicle type by ID
  vehicleTypesRouter.get('/:id', ...createMasterDataMiddlewareStack('read'), async (c: Context) => {
    try {
      const id = c.req.param('id') as VehicleTypeId;
      const partnerId = c.get('partnerId') as PartnerId | null;
      const masterDataService = createMasterDataService(
        c.env.DB,
        createMonitoringService(createDb(c.env.DB))
      );

      const vehicleType = await masterDataService.getVehicleTypeById(id, partnerId || undefined);

      return c.json({
        success: true,
        data: vehicleType,
        timestamp: Date.now(),
      });
    } catch (error) {
      throw handleServiceError(error);
    }
  });

  // Create vehicle type
  vehicleTypesRouter.post(
    '/',
    zValidator('json', createVehicleTypeSchema),
    ...createMasterDataMiddlewareStack('create'),
    async (c: Context) => {
      try {
        const data = c.req.valid('json');
        const user = getCurrentUser(c) as UserSession;
        const masterDataService = createMasterDataService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const vehicleType = await masterDataService.createVehicleType(data, user);

        return c.json({
          success: true,
          data: vehicleType,
          timestamp: Date.now(),
        }, 201);
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Update vehicle type
  vehicleTypesRouter.put(
    '/:id',
    zValidator('json', updateVehicleTypeSchema),
    ...createMasterDataMiddlewareStack('update', 'vehicle-types'),
    async (c: Context) => {
      try {
        const id = c.req.param('id') as VehicleTypeId;
        const data = c.req.valid('json');
        const user = getCurrentUser(c) as UserSession;
        const masterDataService = createMasterDataService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const vehicleType = await masterDataService.updateVehicleType(id, data, user);

        return c.json({
          success: true,
          data: vehicleType,
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Delete vehicle type (soft delete)
  vehicleTypesRouter.delete(
    '/:id',
    ...createMasterDataMiddlewareStack('delete', 'vehicle-types'),
    async (c: Context) => {
      try {
        const id = c.req.param('id') as VehicleTypeId;
        const user = getCurrentUser(c) as UserSession;
        const masterDataService = createMasterDataService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        await masterDataService.deleteVehicleType(id, user);

        return c.json({
          success: true,
          message: 'Vehicle type deleted successfully',
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Payload Types routes (similar structure to vehicle types)
  const payloadTypesRouter = new Hono<{ Bindings: MasterDataEnv }>();

  payloadTypesRouter.get('/', ...createMasterDataMiddlewareStack('read'), async (c: Context) => {
    try {
      const partnerId = c.get('partnerId') as PartnerId | null;
      const masterDataService = createMasterDataService(
        c.env.DB,
        createMonitoringService(createDb(c.env.DB))
      );

      const payloadTypes = await masterDataService.getPayloadTypes(partnerId || undefined);

      return c.json({
        success: true,
        data: payloadTypes,
        count: payloadTypes.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      throw handleServiceError(error);
    }
  });

  // Get payload type by ID
  payloadTypesRouter.get('/:id', ...createMasterDataMiddlewareStack('read'), async (c: Context) => {
    try {
      const id = c.req.param('id') as PayloadTypeId;
      const partnerId = c.get('partnerId') as PartnerId | null;
      const masterDataService = createMasterDataService(
        c.env.DB,
        createMonitoringService(createDb(c.env.DB))
      );

      const payloadType = await masterDataService.getPayloadTypeById(id, partnerId || undefined);

      return c.json({
        success: true,
        data: payloadType,
        timestamp: Date.now(),
      });
    } catch (error) {
      throw handleServiceError(error);
    }
  });

  // Create payload type
  payloadTypesRouter.post(
    '/',
    zValidator('json', createPayloadTypeSchema),
    ...createMasterDataMiddlewareStack('create'),
    async (c: Context) => {
      try {
        const data = c.req.valid('json');
        const user = getCurrentUser(c) as UserSession;
        const masterDataService = createMasterDataService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const payloadType = await masterDataService.createPayloadType(data, user);

        return c.json({
          success: true,
          data: payloadType,
          timestamp: Date.now(),
        }, 201);
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Update payload type
  payloadTypesRouter.put(
    '/:id',
    zValidator('json', updatePayloadTypeSchema),
    ...createMasterDataMiddlewareStack('update', 'payload-types'),
    async (c: Context) => {
      try {
        const id = c.req.param('id') as PayloadTypeId;
        const data = c.req.valid('json');
        const user = getCurrentUser(c) as UserSession;
        const masterDataService = createMasterDataService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const payloadType = await masterDataService.updatePayloadType(id, data, user);

        return c.json({
          success: true,
          data: payloadType,
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Delete payload type (soft delete)
  payloadTypesRouter.delete(
    '/:id',
    ...createMasterDataMiddlewareStack('delete', 'payload-types'),
    async (c: Context) => {
      try {
        const id = c.req.param('id') as PayloadTypeId;
        const user = getCurrentUser(c) as UserSession;
        const masterDataService = createMasterDataService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        await masterDataService.deletePayloadType(id, user);

        return c.json({
          success: true,
          message: 'Payload type deleted successfully',
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Facilities routes (similar structure)
  const facilitiesRouter = new Hono<{ Bindings: MasterDataEnv }>();

  facilitiesRouter.get('/', ...createMasterDataMiddlewareStack('read'), async (c: Context) => {
    try {
      const partnerId = c.get('partnerId') as PartnerId | null;
      const masterDataService = createMasterDataService(
        c.env.DB,
        createMonitoringService(createDb(c.env.DB))
      );

      const facilities = await masterDataService.getFacilities(partnerId || undefined);

      return c.json({
        success: true,
        data: facilities,
        count: facilities.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      throw handleServiceError(error);
    }
  });

  // Get facility by ID
  facilitiesRouter.get('/:id', ...createMasterDataMiddlewareStack('read'), async (c: Context) => {
    try {
      const id = c.req.param('id') as FacilityId;
      const partnerId = c.get('partnerId') as PartnerId | null;
      const masterDataService = createMasterDataService(
        c.env.DB,
        createMonitoringService(createDb(c.env.DB))
      );

      const facility = await masterDataService.getFacilityById(id, partnerId || undefined);

      return c.json({
        success: true,
        data: facility,
        timestamp: Date.now(),
      });
    } catch (error) {
      throw handleServiceError(error);
    }
  });

  // Create facility
  facilitiesRouter.post(
    '/',
    zValidator('json', createFacilitySchema),
    ...createMasterDataMiddlewareStack('create'),
    async (c: Context) => {
      try {
        const data = c.req.valid('json');
        const user = getCurrentUser(c) as UserSession;
        const masterDataService = createMasterDataService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const facility = await masterDataService.createFacility(data, user);

        return c.json({
          success: true,
          data: facility,
          timestamp: Date.now(),
        }, 201);
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Update facility
  facilitiesRouter.put(
    '/:id',
    zValidator('json', updateFacilitySchema),
    ...createMasterDataMiddlewareStack('update', 'facilities'),
    async (c: Context) => {
      try {
        const id = c.req.param('id') as FacilityId;
        const data = c.req.valid('json');
        const user = getCurrentUser(c) as UserSession;
        const masterDataService = createMasterDataService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        const facility = await masterDataService.updateFacility(id, data, user);

        return c.json({
          success: true,
          data: facility,
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Delete facility (soft delete)
  facilitiesRouter.delete(
    '/:id',
    ...createMasterDataMiddlewareStack('delete', 'facilities'),
    async (c: Context) => {
      try {
        const id = c.req.param('id') as FacilityId;
        const user = getCurrentUser(c) as UserSession;
        const masterDataService = createMasterDataService(
          c.env.DB,
          createMonitoringService(createDb(c.env.DB))
        );

        await masterDataService.deleteFacility(id, user);

        return c.json({
          success: true,
          message: 'Facility deleted successfully',
          timestamp: Date.now(),
        });
      } catch (error) {
        throw handleServiceError(error);
      }
    }
  );

  // Mount sub-routers
  app.route('/vehicle-types', vehicleTypesRouter);
  app.route('/payload-types', payloadTypesRouter);
  app.route('/facilities', facilitiesRouter);

  // Health check endpoint
  app.get('/health', async (c: Context) => {
    try {
      const db = createDb(c.env.DB);
      
      // Simple database connectivity test
      const start = Date.now();
      await db.select().from(createDb(c.env.DB)._.schema.masterVehicleTypes).limit(1);
      const responseTime = Date.now() - start;

      return c.json({
        status: 'healthy',
        service: 'master-data',
        database: {
          status: 'connected',
          responseTime: `${responseTime}ms`,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      return c.json({
        status: 'unhealthy',
        service: 'master-data',
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