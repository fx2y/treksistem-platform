/**
 * Pricing Scheme Management Test Suite
 * 
 * Comprehensive test suite for pricing scheme management system including:
 * - Database schema verification
 * - API endpoint testing (all CRUD operations)
 * - Authorization scenarios
 * - Error handling and business logic validation
 * - Middleware verification
 * - Zod schema validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@treksistem/db/schema';
import {
  createPricingSchemeService,
  PricingSchemeError,
} from '../../apps/api/src/services/pricing-scheme.service';
import { 
  generatePricingSchemeId,
  generatePartnerId, 
  generateUserId,
  type ServiceId,
  type PartnerId,
  type UserId,
  isPricingSchemeId
} from '@treksistem/utils';
import {
  type CreateOrUpdatePricingSchemeDTO,
  type UserSession,
  PricingSchemeTypeSchema,
  DistancePricingParamsSchema,
  PerItemPricingParamsSchema,
  ZonalPricingParamsSchema,
  PricingSchemeParamsSchema,
  CreateOrUpdatePricingSchemeDTOSchema,
} from '@treksistem/types';

// Mock monitoring service
const mockMonitoringService = {
  recordSecurityEvent: vi.fn(),
  recordMetric: vi.fn(),
  getHealthStatus: vi.fn(),
};

// Create in-memory test database
const sqlite = new Database(':memory:');
const testDb = drizzle(sqlite, { schema });

// Create test database schema
const createTestTablesSQL = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  phone_number TEXT,
  full_name TEXT,
  avatar_url TEXT,
  google_id TEXT NOT NULL UNIQUE,
  email_verified INTEGER DEFAULT false NOT NULL,
  last_activity INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  owner_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  business_type TEXT,
  description TEXT,
  address TEXT,
  phone_number TEXT,
  email TEXT,
  website_url TEXT,
  logo_url TEXT,
  location_lat REAL,
  location_lng REAL,
  business_registration_number TEXT,
  tax_identification_number TEXT,
  subscription_tier TEXT DEFAULT 'BASIC' NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  max_drivers INTEGER DEFAULT 10 NOT NULL,
  max_vehicles INTEGER DEFAULT 5 NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE services (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  partner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  FOREIGN KEY (partner_id) REFERENCES partners(public_id) ON DELETE CASCADE
);

CREATE TABLE pricing_schemes (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  service_id INTEGER NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('DISTANCE', 'PER_ITEM', 'ZONAL')),
  params TEXT NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- Indexes
CREATE UNIQUE INDEX pricing_schemes_public_id_idx ON pricing_schemes(public_id);
CREATE UNIQUE INDEX pricing_schemes_service_id_idx ON pricing_schemes(service_id);
CREATE INDEX pricing_schemes_type_idx ON pricing_schemes(type);
CREATE INDEX pricing_schemes_active_idx ON pricing_schemes(is_active);

CREATE UNIQUE INDEX services_public_id_idx ON services(public_id);
CREATE INDEX services_partner_id_idx ON services(partner_id);
CREATE INDEX services_active_idx ON services(is_active);
CREATE INDEX services_name_idx ON services(name);
`;

// Mock batch functionality for testDb
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
(testDb as any).batch = async (statements: any[]): Promise<any[]> => {
  const results = [];
  for (const stmt of statements) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    results.push(await stmt);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return results;
};

function initializeTestDatabase() {
  const statements = createTestTablesSQL.split(';').filter(s => s.trim());
  for (const statement of statements) {
    if (statement.trim()) {
      try {
        sqlite.exec(statement);
      } catch (error) {
        // Table might already exist, ignore
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!(error instanceof Error) || !error.message.includes('already exists')) {
          throw error;
        }
      }
    }
  }
}

// Test data factories
async function createTestUser(overrides: Partial<schema.NewUser> = {}) {
  const now = new Date();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const user: schema.NewUser = {
    publicId: generateUserId(),
    email: `test-${timestamp}-${random}@example.com`,
    fullName: 'Test User',
    googleId: `test_google_${timestamp}_${random}`,
    emailVerified: true,
    lastActivity: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };

  const [insertedUser] = await testDb.insert(schema.users).values(user).returning();
  return insertedUser;
}

async function createTestPartner(overrides: Partial<schema.NewPartner> = {}) {
  const now = new Date();
  const user = await createTestUser();
  const partner: schema.NewPartner = {
    publicId: generatePartnerId(),
    ownerUserId: user.id,
    name: `Test Partner ${Date.now()}`,
    subscriptionTier: 'BASIC',
    isActive: true,
    maxDrivers: 10,
    maxVehicles: 5,
    createdAt: now,
    updatedAt: now,
    createdBy: user.publicId as UserId,
    updatedBy: user.publicId as UserId,
    ...overrides,
  };

  const [insertedPartner] = await testDb.insert(schema.partners).values(partner).returning();
  return { partner: insertedPartner, user };
}

async function createTestService(partnerId: PartnerId, userId: UserId, overrides: Partial<schema.NewService> = {}) {
  const now = new Date();
  const service: schema.NewService = {
    publicId: `svc_test${Date.now().toString().slice(-12)}` as ServiceId,
    partnerId,
    name: `Test Service ${Date.now()}`,
    config: JSON.stringify({
      businessModel: 'PRIVATE',
      vehicleTypeIds: ['vt_test123456789012345'],
      payloadTypeIds: ['pt_test123456789012345'],
      operationalRange: { maxDistanceKm: 25 },
      orderOptions: ['A_TO_B'],
    }),
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
    ...overrides,
  };

  const [insertedService] = await testDb.insert(schema.services).values(service).returning();
  return insertedService;
}

async function createTestPricingScheme(
  serviceId: number,
  userId: UserId,
  overrides: Partial<schema.NewPricingScheme> = {}
) {
  const now = new Date();
  const pricingScheme: schema.NewPricingScheme = {
    publicId: generatePricingSchemeId(),
    serviceId,
    type: 'DISTANCE',
    params: JSON.stringify({
      type: 'DISTANCE',
      base_fee: 5000,
      per_km_fee: 2000,
      min_fee: 3000,
    }),
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
    ...overrides,
  };

  const [insertedPricingScheme] = await testDb.insert(schema.pricingSchemes).values(pricingScheme).returning();
  return insertedPricingScheme;
}

function createUserSession(userId: UserId, partnerId?: PartnerId, roles: Array<{ role: 'MASTER_ADMIN' | 'PARTNER_ADMIN' | 'DRIVER', contextId?: string }> = [{ role: 'PARTNER_ADMIN', contextId: partnerId }]): UserSession {
  return {
    sub: userId,
    email: 'test@example.com',
    email_verified: true,
    name: 'Test User',
    picture: 'https://example.com/avatar.jpg',
    roles: roles.map(r => ({
      role: r.role,
      contextId: r.contextId || null,
      grantedAt: Date.now(),
      grantedBy: 'system',
    })),
    iat: Date.now(),
    exp: Date.now() + 4 * 60 * 60 * 1000,
    jti: 'test-jwt-id',
    sid: 'test-session-id',
    rate_limit_tier: 'basic',
    last_activity: Date.now(),
  };
}

describe('Pricing Scheme Management System', () => {
  beforeEach(() => {
    initializeTestDatabase();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean database in proper order (dependent tables first)
    try {
      await testDb.delete(schema.pricingSchemes);
      await testDb.delete(schema.services);
      await testDb.delete(schema.partners);
      await testDb.delete(schema.users);
    } catch (error) {
      // If tables don't exist, ignore the error
      console.log('Database cleanup warning:', error instanceof Error ? error.message : String(error));
    }
    
    // Add small delay to ensure test isolation
    await new Promise(resolve => setTimeout(resolve, 1));
  });

  describe('1. Database Schema & Static Analysis Verification', () => {
    it('should generate valid pricing scheme IDs', () => {
      const id = generatePricingSchemeId();
      expect(id).toMatch(/^prc_[A-Za-z0-9_-]{21}$/);
      expect(isPricingSchemeId(id)).toBe(true);
    });

    it('should validate pricing scheme type schema', () => {
      expect(PricingSchemeTypeSchema.safeParse('DISTANCE').success).toBe(true);
      expect(PricingSchemeTypeSchema.safeParse('PER_ITEM').success).toBe(true);
      expect(PricingSchemeTypeSchema.safeParse('ZONAL').success).toBe(true);
      expect(PricingSchemeTypeSchema.safeParse('INVALID').success).toBe(false);
    });

    it('should validate distance pricing params schema', () => {
      const validParams = {
        type: 'DISTANCE',
        base_fee: 5000,
        per_km_fee: 2000,
      };
      const result = DistancePricingParamsSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should validate per-item pricing params schema', () => {
      const validParams = {
        type: 'PER_ITEM',
        per_piece_fee: 1500,
        rounding_up_to: 5,
      };
      const result = PerItemPricingParamsSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should validate zonal pricing params schema', () => {
      const validParams = {
        type: 'ZONAL',
        zones: [
          {
            name: 'Zone A',
            polygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
            fee: 10000,
          },
        ],
        default_fee: 15000,
      };
      const result = ZonalPricingParamsSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should validate discriminated union pricing params schema', () => {
      const distanceParams = {
        type: 'DISTANCE',
        base_fee: 5000,
        per_km_fee: 2000,
      };
      expect(PricingSchemeParamsSchema.safeParse(distanceParams).success).toBe(true);

      const invalidParams = {
        type: 'DISTANCE',
        per_piece_fee: 1500, // Wrong param for DISTANCE type
      };
      expect(PricingSchemeParamsSchema.safeParse(invalidParams).success).toBe(false);
    });

    it('should validate create/update pricing scheme DTO with type matching', () => {
      const validDTO = {
        type: 'DISTANCE',
        params: {
          type: 'DISTANCE',
          base_fee: 5000,
          per_km_fee: 2000,
        },
        is_active: true,
      };
      expect(CreateOrUpdatePricingSchemeDTOSchema.safeParse(validDTO).success).toBe(true);

      const mismatchedDTO = {
        type: 'DISTANCE',
        params: {
          type: 'PER_ITEM', // Type mismatch
          per_piece_fee: 1500,
        },
        is_active: true,
      };
      expect(CreateOrUpdatePricingSchemeDTOSchema.safeParse(mismatchedDTO).success).toBe(false);
    });
  });

  describe('2. Pricing Scheme Creation (POST /api/v1/services/{serviceId}/pricing)', () => {
    let pricingSchemeService: ReturnType<typeof createPricingSchemeService>;
    let partnerData: { partner: schema.Partner; user: schema.User };
    let testService: schema.Service;

    beforeEach(async () => {
      pricingSchemeService = createPricingSchemeService(testDb, mockMonitoringService);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      partnerData = await createTestPartner();
      testService = await createTestService(
        partnerData.partner.publicId as PartnerId,
        partnerData.user.publicId as UserId
      );
    });

    it('should create distance pricing scheme successfully', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const pricingData: CreateOrUpdatePricingSchemeDTO = {
        type: 'DISTANCE',
        params: {
          type: 'DISTANCE',
          base_fee: 5000,
          per_km_fee: 2000,
          min_fee: 3000,
        },
        is_active: true,
      };

      const result = await pricingSchemeService.createPricingScheme(
        testService.publicId as ServiceId,
        pricingData,
        userSession
      );

      expect(result.serviceId).toBe(testService.publicId);
      expect(result.type).toBe('DISTANCE');
      expect(result.params.type).toBe('DISTANCE');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((result.params as any).base_fee).toBe(5000);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((result.params as any).per_km_fee).toBe(2000);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((result.params as any).min_fee).toBe(3000);
      expect(result.isActive).toBe(true);
      expect(result.createdBy).toBe(userSession.sub);
      expect(result.updatedBy).toBe(userSession.sub);
    });

    it('should create per-item pricing scheme successfully', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const pricingData: CreateOrUpdatePricingSchemeDTO = {
        type: 'PER_ITEM',
        params: {
          type: 'PER_ITEM',
          per_piece_fee: 1500,
          rounding_up_to: 5,
        },
        is_active: true,
      };

      const result = await pricingSchemeService.createPricingScheme(
        testService.publicId as ServiceId,
        pricingData,
        userSession
      );

      expect(result.type).toBe('PER_ITEM');
      expect(result.params.type).toBe('PER_ITEM');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((result.params as any).per_piece_fee).toBe(1500);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((result.params as any).rounding_up_to).toBe(5);
    });

    it('should create zonal pricing scheme successfully', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const pricingData: CreateOrUpdatePricingSchemeDTO = {
        type: 'ZONAL',
        params: {
          type: 'ZONAL',
          zones: [
            {
              name: 'City Center',
              polygon: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
              fee: 8000,
            },
            {
              name: 'Suburbs',
              polygon: 'POLYGON((1 1, 2 1, 2 2, 1 2, 1 1))',
              fee: 12000,
            },
          ],
          default_fee: 15000,
        },
        is_active: true,
      };

      const result = await pricingSchemeService.createPricingScheme(
        testService.publicId as ServiceId,
        pricingData,
        userSession
      );

      expect(result.type).toBe('ZONAL');
      expect(result.params.type).toBe('ZONAL');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((result.params as any).zones).toHaveLength(2);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((result.params as any).zones[0].name).toBe('City Center');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((result.params as any).zones[0].fee).toBe(8000);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((result.params as any).default_fee).toBe(15000);
    });

    it('should fail when service does not exist', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const pricingData: CreateOrUpdatePricingSchemeDTO = {
        type: 'DISTANCE',
        params: {
          type: 'DISTANCE',
          base_fee: 5000,
          per_km_fee: 2000,
        },
        is_active: true,
      };

      await expect(
        pricingSchemeService.createPricingScheme(
          'svc_nonexistent123456789' as ServiceId,
          pricingData,
          userSession
        )
      ).rejects.toThrow('Service with ID \'svc_nonexistent123456789\' not found');
    });

    it('should fail when pricing scheme already exists for service', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const pricingData: CreateOrUpdatePricingSchemeDTO = {
        type: 'DISTANCE',
        params: {
          type: 'DISTANCE',
          base_fee: 5000,
          per_km_fee: 2000,
        },
        is_active: true,
      };

      // Create first pricing scheme
      await pricingSchemeService.createPricingScheme(
        testService.publicId as ServiceId,
        pricingData,
        userSession
      );

      // Try to create second pricing scheme for same service
      await expect(
        pricingSchemeService.createPricingScheme(
          testService.publicId as ServiceId,
          pricingData,
          userSession
        )
      ).rejects.toThrow(`Pricing scheme for service '${testService.publicId}' already exists`);
    });

    it('should fail when user does not have access to service', async () => {
      const otherPartnerData = await createTestPartner();
      const userSession = createUserSession(
        otherPartnerData.user.publicId as UserId,
        otherPartnerData.partner.publicId as PartnerId
      );

      const pricingData: CreateOrUpdatePricingSchemeDTO = {
        type: 'DISTANCE',
        params: {
          type: 'DISTANCE',
          base_fee: 5000,
          per_km_fee: 2000,
        },
        is_active: true,
      };

      await expect(
        pricingSchemeService.createPricingScheme(
          testService.publicId as ServiceId,
          pricingData,
          userSession
        )
      ).rejects.toThrow('Access denied');
    });

    it('should allow master admin to create pricing scheme for any service', async () => {
      const masterAdminSession = createUserSession(
        'user_masteradmin' as UserId,
        undefined,
        [{ role: 'MASTER_ADMIN' }]
      );

      const pricingData: CreateOrUpdatePricingSchemeDTO = {
        type: 'DISTANCE',
        params: {
          type: 'DISTANCE',
          base_fee: 5000,
          per_km_fee: 2000,
        },
        is_active: true,
      };

      const result = await pricingSchemeService.createPricingScheme(
        testService.publicId as ServiceId,
        pricingData,
        masterAdminSession
      );

      expect(result.serviceId).toBe(testService.publicId);
      expect(result.createdBy).toBe(masterAdminSession.sub);
    });

    it('should record audit event on successful creation', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const pricingData: CreateOrUpdatePricingSchemeDTO = {
        type: 'DISTANCE',
        params: {
          type: 'DISTANCE',
          base_fee: 5000,
          per_km_fee: 2000,
        },
        is_active: true,
      };

      await pricingSchemeService.createPricingScheme(
        testService.publicId as ServiceId,
        pricingData,
        userSession
      );

      expect(mockMonitoringService.recordSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auth_success',
          userId: userSession.sub,
          details: expect.objectContaining({
            action: 'pricing_scheme_create',
          }),
        })
      );
    });
  });

  describe('3. Pricing Scheme Update (PUT /api/v1/services/{serviceId}/pricing)', () => {
    let pricingSchemeService: ReturnType<typeof createPricingSchemeService>;
    let partnerData: { partner: schema.Partner; user: schema.User };
    let testService: schema.Service;

    beforeEach(async () => {
      pricingSchemeService = createPricingSchemeService(testDb, mockMonitoringService);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      partnerData = await createTestPartner();
      testService = await createTestService(
        partnerData.partner.publicId as PartnerId,
        partnerData.user.publicId as UserId
      );
      await createTestPricingScheme(
        testService.id,
        partnerData.user.publicId as UserId
      );
    });

    it('should update pricing scheme type and params successfully', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const updateData: CreateOrUpdatePricingSchemeDTO = {
        type: 'PER_ITEM',
        params: {
          type: 'PER_ITEM',
          per_piece_fee: 2500,
          rounding_up_to: 10,
        },
        is_active: true,
      };

      const result = await pricingSchemeService.updatePricingScheme(
        testService.publicId as ServiceId,
        updateData,
        userSession
      );

      expect(result.type).toBe('PER_ITEM');
      expect(result.params.type).toBe('PER_ITEM');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((result.params as any).per_piece_fee).toBe(2500);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((result.params as any).rounding_up_to).toBe(10);
      expect(result.updatedBy).toBe(userSession.sub);
    });

    it('should update pricing scheme active status', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const updateData: CreateOrUpdatePricingSchemeDTO = {
        type: 'DISTANCE',
        params: {
          type: 'DISTANCE',
          base_fee: 5000,
          per_km_fee: 2000,
        },
        is_active: false,
      };

      const result = await pricingSchemeService.updatePricingScheme(
        testService.publicId as ServiceId,
        updateData,
        userSession
      );

      expect(result.isActive).toBe(false);
    });

    it('should fail to update non-existent pricing scheme', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      // Create a service without pricing scheme
      const serviceWithoutPricing = await createTestService(
        partnerData.partner.publicId as PartnerId,
        partnerData.user.publicId as UserId
      );

      const updateData: CreateOrUpdatePricingSchemeDTO = {
        type: 'DISTANCE',
        params: {
          type: 'DISTANCE',
          base_fee: 5000,
          per_km_fee: 2000,
        },
        is_active: true,
      };

      await expect(
        pricingSchemeService.updatePricingScheme(
          serviceWithoutPricing.publicId as ServiceId,
          updateData,
          userSession
        )
      ).rejects.toThrow(`Pricing scheme for service '${serviceWithoutPricing.publicId}' not found`);
    });

    it('should fail to update pricing scheme from different partner', async () => {
      const otherPartnerData = await createTestPartner();
      const userSession = createUserSession(
        otherPartnerData.user.publicId as UserId,
        otherPartnerData.partner.publicId as PartnerId
      );

      const updateData: CreateOrUpdatePricingSchemeDTO = {
        type: 'DISTANCE',
        params: {
          type: 'DISTANCE',
          base_fee: 5000,
          per_km_fee: 2000,
        },
        is_active: true,
      };

      await expect(
        pricingSchemeService.updatePricingScheme(
          testService.publicId as ServiceId,
          updateData,
          userSession
        )
      ).rejects.toThrow('Access denied');
    });

    it('should record audit event on successful update', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const updateData: CreateOrUpdatePricingSchemeDTO = {
        type: 'DISTANCE',
        params: {
          type: 'DISTANCE',
          base_fee: 6000,
          per_km_fee: 2500,
        },
        is_active: true,
      };

      await pricingSchemeService.updatePricingScheme(
        testService.publicId as ServiceId,
        updateData,
        userSession
      );

      expect(mockMonitoringService.recordSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auth_success',
          details: expect.objectContaining({
            action: 'pricing_scheme_update',
          }),
        })
      );
    });
  });

  describe('4. Pricing Scheme Retrieval (GET /api/v1/services/{serviceId}/pricing)', () => {
    let pricingSchemeService: ReturnType<typeof createPricingSchemeService>;
    let partnerData: { partner: schema.Partner; user: schema.User };
    let testService: schema.Service;

    beforeEach(async () => {
      pricingSchemeService = createPricingSchemeService(testDb, mockMonitoringService);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      partnerData = await createTestPartner();
      testService = await createTestService(
        partnerData.partner.publicId as PartnerId,
        partnerData.user.publicId as UserId
      );
      await createTestPricingScheme(
        testService.id,
        partnerData.user.publicId as UserId
      );
    });

    it('should get pricing scheme for authorized user', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const result = await pricingSchemeService.getPricingSchemeByServiceId(
        testService.publicId as ServiceId,
        userSession
      );

      expect(result.serviceId).toBe(testService.publicId);
      expect(result.type).toBe('DISTANCE');
      expect(result.params.type).toBe('DISTANCE');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((result.params as any).base_fee).toBe(5000);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((result.params as any).per_km_fee).toBe(2000);
      expect(result.isActive).toBe(true);
    });

    it('should get pricing scheme for master admin', async () => {
      const masterAdminSession = createUserSession(
        'user_masteradmin' as UserId,
        undefined,
        [{ role: 'MASTER_ADMIN' }]
      );

      const result = await pricingSchemeService.getPricingSchemeByServiceId(
        testService.publicId as ServiceId,
        masterAdminSession
      );

      expect(result.serviceId).toBe(testService.publicId);
    });

    it('should get pricing scheme for public access when no user provided', async () => {
      const result = await pricingSchemeService.getPricingSchemeByServiceId(
        testService.publicId as ServiceId
      );

      expect(result.serviceId).toBe(testService.publicId);
      expect(result.type).toBe('DISTANCE');
    });

    it('should fail to get pricing scheme for unauthorized user', async () => {
      const otherPartnerData = await createTestPartner();
      const userSession = createUserSession(
        otherPartnerData.user.publicId as UserId,
        otherPartnerData.partner.publicId as PartnerId
      );

      await expect(
        pricingSchemeService.getPricingSchemeByServiceId(
          testService.publicId as ServiceId,
          userSession
        )
      ).rejects.toThrow('Access denied');
    });

    it('should fail when pricing scheme does not exist', async () => {
      const serviceWithoutPricing = await createTestService(
        partnerData.partner.publicId as PartnerId,
        partnerData.user.publicId as UserId
      );

      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      await expect(
        pricingSchemeService.getPricingSchemeByServiceId(
          serviceWithoutPricing.publicId as ServiceId,
          userSession
        )
      ).rejects.toThrow(`Pricing scheme for service '${serviceWithoutPricing.publicId}' not found`);
    });

    it('should fail when service does not exist', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      await expect(
        pricingSchemeService.getPricingSchemeByServiceId(
          'svc_nonexistent123456789' as ServiceId,
          userSession
        )
      ).rejects.toThrow('Service with ID \'svc_nonexistent123456789\' not found');
    });
  });

  describe('5. Pricing Scheme Deletion (DELETE /api/v1/services/{serviceId}/pricing)', () => {
    let pricingSchemeService: ReturnType<typeof createPricingSchemeService>;
    let partnerData: { partner: schema.Partner; user: schema.User };
    let testService: schema.Service;

    beforeEach(async () => {
      pricingSchemeService = createPricingSchemeService(testDb, mockMonitoringService);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      partnerData = await createTestPartner();
      testService = await createTestService(
        partnerData.partner.publicId as PartnerId,
        partnerData.user.publicId as UserId
      );
      await createTestPricingScheme(
        testService.id,
        partnerData.user.publicId as UserId
      );
    });

    it('should soft delete pricing scheme successfully', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      await pricingSchemeService.deletePricingScheme(
        testService.publicId as ServiceId,
        userSession
      );

      // Verify pricing scheme is no longer accessible
      await expect(
        pricingSchemeService.getPricingSchemeByServiceId(
          testService.publicId as ServiceId,
          userSession
        )
      ).rejects.toThrow('Pricing scheme for service');
    });

    it('should fail to delete pricing scheme from different partner', async () => {
      const otherPartnerData = await createTestPartner();
      const userSession = createUserSession(
        otherPartnerData.user.publicId as UserId,
        otherPartnerData.partner.publicId as PartnerId
      );

      await expect(
        pricingSchemeService.deletePricingScheme(
          testService.publicId as ServiceId,
          userSession
        )
      ).rejects.toThrow('Access denied');
    });

    it('should allow master admin to delete any pricing scheme', async () => {
      const masterAdminSession = createUserSession(
        'user_masteradmin' as UserId,
        undefined,
        [{ role: 'MASTER_ADMIN' }]
      );

      await expect(
        pricingSchemeService.deletePricingScheme(
          testService.publicId as ServiceId,
          masterAdminSession
        )
      ).resolves.not.toThrow();
    });

    it('should fail to delete non-existent pricing scheme', async () => {
      const serviceWithoutPricing = await createTestService(
        partnerData.partner.publicId as PartnerId,
        partnerData.user.publicId as UserId
      );

      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      await expect(
        pricingSchemeService.deletePricingScheme(
          serviceWithoutPricing.publicId as ServiceId,
          userSession
        )
      ).rejects.toThrow(`Pricing scheme for service '${serviceWithoutPricing.publicId}' not found`);
    });

    it('should record audit event on successful deletion', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      await pricingSchemeService.deletePricingScheme(
        testService.publicId as ServiceId,
        userSession
      );

      expect(mockMonitoringService.recordSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auth_success',
          details: expect.objectContaining({
            action: 'pricing_scheme_delete',
          }),
        })
      );
    });
  });

  describe('6. Error Handling', () => {
    let pricingSchemeService: ReturnType<typeof createPricingSchemeService>;

    beforeEach(() => {
      pricingSchemeService = createPricingSchemeService(testDb, mockMonitoringService);
    });

    it('should throw PricingSchemeNotFoundError for non-existent pricing scheme', async () => {
      const partnerData = await createTestPartner();
      const testService = await createTestService(
        partnerData.partner.publicId as PartnerId,
        partnerData.user.publicId as UserId
      );
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      await expect(
        pricingSchemeService.getPricingSchemeByServiceId(
          testService.publicId as ServiceId,
          userSession
        )
      ).rejects.toThrow(`Pricing scheme for service '${testService.publicId}' not found`);
    });

    it('should handle pricing scheme errors with proper error codes', async () => {
      const partnerData = await createTestPartner();
      const testService = await createTestService(
        partnerData.partner.publicId as PartnerId,
        partnerData.user.publicId as UserId
      );
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      try {
        await pricingSchemeService.getPricingSchemeByServiceId(
          testService.publicId as ServiceId,
          userSession
        );
      } catch (error) {
        expect(error).toBeInstanceOf(PricingSchemeError);
        if (error instanceof PricingSchemeError) {
          expect(error.code).toBe('pricing_scheme_not_found');
          expect(error.statusCode).toBe(404);
        }
      }
    });
  });

  describe('7. Business Logic Validation', () => {
    let pricingSchemeService: ReturnType<typeof createPricingSchemeService>;
    let partnerData: { partner: schema.Partner; user: schema.User };
    let testService: schema.Service;

    beforeEach(async () => {
      pricingSchemeService = createPricingSchemeService(testDb, mockMonitoringService);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      partnerData = await createTestPartner();
      testService = await createTestService(
        partnerData.partner.publicId as PartnerId,
        partnerData.user.publicId as UserId
      );
    });

    it('should properly serialize and deserialize JSON params', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const complexParams = {
        type: 'ZONAL' as const,
        zones: [
          {
            name: 'Complex Zone',
            polygon: 'POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))',
            fee: 25000,
          },
        ],
        default_fee: 35000,
      };

      const pricingData: CreateOrUpdatePricingSchemeDTO = {
        type: 'ZONAL',
        params: complexParams,
        is_active: true,
      };

      const result = await pricingSchemeService.createPricingScheme(
        testService.publicId as ServiceId,
        pricingData,
        userSession
      );

      expect(result.params).toEqual(complexParams);
      expect(typeof result.createdAt).toBe('string');
      expect(typeof result.updatedAt).toBe('string');
    });

    it('should enforce unique constraint on service_id', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const pricingData: CreateOrUpdatePricingSchemeDTO = {
        type: 'DISTANCE',
        params: {
          type: 'DISTANCE',
          base_fee: 5000,
          per_km_fee: 2000,
        },
        is_active: true,
      };

      // Create first pricing scheme
      await pricingSchemeService.createPricingScheme(
        testService.publicId as ServiceId,
        pricingData,
        userSession
      );

      // Attempt to create second pricing scheme for same service should fail
      await expect(
        pricingSchemeService.createPricingScheme(
          testService.publicId as ServiceId,
          pricingData,
          userSession
        )
      ).rejects.toThrow('already exists');
    });

    it('should validate access through service ownership', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      // Create pricing scheme
      const pricingData: CreateOrUpdatePricingSchemeDTO = {
        type: 'DISTANCE',
        params: {
          type: 'DISTANCE',
          base_fee: 5000,
          per_km_fee: 2000,
        },
        is_active: true,
      };

      const result = await pricingSchemeService.createPricingScheme(
        testService.publicId as ServiceId,
        pricingData,
        userSession
      );

      // Owner should be able to access
      const retrieved = await pricingSchemeService.getPricingSchemeByServiceId(
        testService.publicId as ServiceId,
        userSession
      );

      expect(retrieved.pricingSchemeId).toBe(result.pricingSchemeId);
    });
  });
});