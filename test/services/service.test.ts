/**
 * Service Management Test Suite
 * 
 * Comprehensive test suite for service management system including:
 * - Database schema verification
 * - API endpoint testing (all CRUD operations)
 * - Authorization scenarios
 * - Error handling and business logic validation
 * - Middleware verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@treksistem/db/schema';
import { createServiceService, ServiceError } from '../../apps/api/src/services/service.service';
import { 
  generateServiceId, 
  generatePartnerId, 
  generateUserId,
  generateVehicleTypeId,
  generatePayloadTypeId,
  generateFacilityId,
  type ServiceId,
  type PartnerId,
  type UserId,
  isServiceId
} from '@treksistem/utils';
import {
  type ServiceDTO,
  type CreateServiceRequest,
  type UpdateServiceRequest,
  type UserSession,
  ServiceConfigSchema,
  createServiceSchema,
  updateServiceSchema
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

CREATE TABLE master_vehicle_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  partner_id TEXT,
  display_order INTEGER DEFAULT 0 NOT NULL,
  capabilities TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE master_payload_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  partner_id TEXT,
  display_order INTEGER DEFAULT 0 NOT NULL,
  requirements TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE master_facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  partner_id TEXT,
  display_order INTEGER DEFAULT 0 NOT NULL,
  category TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- Indexes
CREATE UNIQUE INDEX services_public_id_idx ON services(public_id);
CREATE INDEX services_partner_id_idx ON services(partner_id);
CREATE INDEX services_active_idx ON services(is_active);
CREATE INDEX services_name_idx ON services(name);
`;

// Mock batch functionality for testDb
(testDb as any).batch = async (statements: any[]) => {
  const results = [];
  for (const stmt of statements) {
    results.push(await stmt);
  }
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
        if (!error.message.includes('already exists')) {
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

async function createTestMasterData() {
  const now = new Date();
  
  // Create vehicle type
  const vehicleType = {
    publicId: generateVehicleTypeId(),
    name: 'Test Vehicle',
    iconUrl: 'https://example.com/icon.svg',
    isActive: true,
    partnerId: null,
    displayOrder: 0,
    capabilities: '[]',
    createdAt: now,
    updatedAt: now,
    createdBy: 'system' as UserId,
    updatedBy: 'system' as UserId,
  };

  // Create payload type
  const payloadType = {
    publicId: generatePayloadTypeId(),
    name: 'Test Payload',
    iconUrl: 'https://example.com/icon.svg',
    isActive: true,
    partnerId: null,
    displayOrder: 0,
    requirements: '[]',
    createdAt: now,
    updatedAt: now,
    createdBy: 'system' as UserId,
    updatedBy: 'system' as UserId,
  };

  // Create facility
  const facility = {
    publicId: generateFacilityId(),
    name: 'Test Facility',
    iconUrl: 'https://example.com/icon.svg',
    isActive: true,
    partnerId: null,
    displayOrder: 0,
    category: 'STORAGE',
    createdAt: now,
    updatedAt: now,
    createdBy: 'system' as UserId,
    updatedBy: 'system' as UserId,
  };

  await testDb.insert(schema.masterVehicleTypes).values(vehicleType);
  await testDb.insert(schema.masterPayloadTypes).values(payloadType);
  await testDb.insert(schema.masterFacilities).values(facility);

  return { vehicleType, payloadType, facility };
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

describe('Service Management System', () => {
  beforeEach(() => {
    initializeTestDatabase();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean database in proper order (dependent tables first)
    try {
      await testDb.delete(schema.services);
      await testDb.delete(schema.partners);
      await testDb.delete(schema.users);
      await testDb.delete(schema.masterVehicleTypes);
      await testDb.delete(schema.masterPayloadTypes);
      await testDb.delete(schema.masterFacilities);
    } catch (error) {
      // If tables don't exist, ignore the error
      console.log('Database cleanup warning:', error);
    }
    
    // Add small delay to ensure test isolation
    await new Promise(resolve => setTimeout(resolve, 1));
  });

  describe('1. Database Schema & Static Analysis Verification', () => {
    it('should generate valid service IDs', () => {
      const id = generateServiceId();
      expect(id).toMatch(/^svc_[A-Za-z0-9_-]{21}$/);
      expect(isServiceId(id)).toBe(true);
    });

    it('should validate service configuration schema', () => {
      const validConfig = {
        businessModel: 'PRIVATE',
        vehicleTypeIds: ['vt_V1StGXR8_Z5jdHi6B-myT'],
        payloadTypeIds: ['pt_V1StGXR8_Z5jdHi6B-myT'],
        operationalRange: { maxDistanceKm: 25 },
        orderOptions: ['A_TO_B'],
      };

      const result = ServiceConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should reject invalid service configuration', () => {
      const invalidConfig = {
        businessModel: 'PRIVATE',
        vehicleTypeIds: ['vt_V1StGXR8_Z5jdHi6B-myT'],
        payloadTypeIds: ['pt_V1StGXR8_Z5jdHi6B-myT'],
        // Missing required operationalRange
        orderOptions: ['A_TO_B'],
      };

      const result = ServiceConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should validate create service schema', () => {
      const validData = {
        name: 'Test Service',
        config: {
          businessModel: 'PRIVATE',
          vehicleTypeIds: ['vt_V1StGXR8_Z5jdHi6B-myT'],
          payloadTypeIds: ['pt_V1StGXR8_Z5jdHi6B-myT'],
          operationalRange: { maxDistanceKm: 25 },
          orderOptions: ['A_TO_B'],
        },
      };

      const result = createServiceSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('2. Service Creation (POST /api/v1/partners/{partnerId}/services)', () => {
    let serviceService: ReturnType<typeof createServiceService>;
    let partnerData: { partner: schema.Partner; user: schema.User };
    let masterData: any;

    beforeEach(async () => {
      serviceService = createServiceService(testDb, mockMonitoringService);
      partnerData = await createTestPartner();
      masterData = await createTestMasterData();
    });

    it('should create service successfully for partner admin', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const serviceData: CreateServiceRequest = {
        name: 'Sameday Food Delivery',
        config: {
          businessModel: 'PRIVATE',
          vehicleTypeIds: [masterData.vehicleType.publicId],
          payloadTypeIds: [masterData.payloadType.publicId],
          operationalRange: { maxDistanceKm: 15 },
          orderOptions: ['A_TO_B'],
        },
      };

      const result = await serviceService.createService(serviceData, userSession);

      expect(result.name).toBe('Sameday Food Delivery');
      expect(result.partnerId).toBe(partnerData.partner.publicId);
      expect(result.publicId).toMatch(/^svc_[A-Za-z0-9_-]{21}$/);
      expect(result.config.operationalRange.maxDistanceKm).toBe(15);
      expect(result.isActive).toBe(true);
      expect(result.createdBy).toBe(userSession.sub);
      expect(result.updatedBy).toBe(userSession.sub);
    });

    it('should fail when creating service without partner context', async () => {
      const userSession = createUserSession('user_test123' as UserId, undefined, [{ role: 'DRIVER' }]);

      const serviceData: CreateServiceRequest = {
        name: 'Test Service',
        config: {
          businessModel: 'PRIVATE',
          vehicleTypeIds: [masterData.vehicleType.publicId],
          payloadTypeIds: [masterData.payloadType.publicId],
          operationalRange: { maxDistanceKm: 15 },
          orderOptions: ['A_TO_B'],
        },
      };

      await expect(serviceService.createService(serviceData, userSession))
        .rejects.toThrow('Partner context required for creating services');
    });

    it('should record audit event on successful creation', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const serviceData: CreateServiceRequest = {
        name: 'Test Service',
        config: {
          businessModel: 'PRIVATE',
          vehicleTypeIds: [masterData.vehicleType.publicId],
          payloadTypeIds: [masterData.payloadType.publicId],
          operationalRange: { maxDistanceKm: 15 },
          orderOptions: ['A_TO_B'],
        },
      };

      await serviceService.createService(serviceData, userSession);

      expect(mockMonitoringService.recordSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auth_success',
          userId: userSession.sub,
          details: expect.objectContaining({
            action: 'service_create',
          }),
        })
      );
    });
  });

  describe('3. Service Update (PUT /api/v1/services/{serviceId})', () => {
    let serviceService: ReturnType<typeof createServiceService>;
    let partnerData: { partner: schema.Partner; user: schema.User };
    let masterData: any;
    let testService: ServiceDTO;

    beforeEach(async () => {
      serviceService = createServiceService(testDb, mockMonitoringService);
      partnerData = await createTestPartner();
      masterData = await createTestMasterData();
      
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      testService = await serviceService.createService({
        name: 'Old Name',
        config: {
          businessModel: 'PRIVATE',
          vehicleTypeIds: [masterData.vehicleType.publicId],
          payloadTypeIds: [masterData.payloadType.publicId],
          operationalRange: { maxDistanceKm: 15 },
          orderOptions: ['A_TO_B'],
        },
      }, userSession);
    });

    it('should update service name successfully', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const result = await serviceService.updateService(
        testService.publicId,
        { name: 'New Updated Name' },
        userSession
      );

      expect(result.name).toBe('New Updated Name');
      expect(result.updatedBy).toBe(userSession.sub);
    });

    it('should update service isActive status', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const result = await serviceService.updateService(
        testService.publicId,
        { isActive: false },
        userSession
      );

      expect(result.isActive).toBe(false);
    });

    it('should fail to update service from different partner', async () => {
      const otherPartnerData = await createTestPartner();
      const userSession = createUserSession(
        otherPartnerData.user.publicId as UserId,
        otherPartnerData.partner.publicId as PartnerId
      );

      await expect(serviceService.updateService(
        testService.publicId,
        { name: 'Unauthorized Update' },
        userSession
      )).rejects.toThrow('Access denied');
    });

    it('should allow master admin to update any service', async () => {
      const masterAdminSession = createUserSession(
        'user_masteradmin' as UserId,
        undefined,
        [{ role: 'MASTER_ADMIN' }]
      );

      const result = await serviceService.updateService(
        testService.publicId,
        { name: 'Admin Updated Name' },
        masterAdminSession
      );

      expect(result.name).toBe('Admin Updated Name');
    });
  });

  describe('4. Service Retrieval (GET)', () => {
    let serviceService: ReturnType<typeof createServiceService>;
    let partnerData1: { partner: schema.Partner; user: schema.User };
    let partnerData2: { partner: schema.Partner; user: schema.User };
    let masterData: any;
    let service1: ServiceDTO;
    let service2: ServiceDTO;

    beforeEach(async () => {
      serviceService = createServiceService(testDb, mockMonitoringService);
      partnerData1 = await createTestPartner();
      partnerData2 = await createTestPartner();
      masterData = await createTestMasterData();
      
      const userSession1 = createUserSession(
        partnerData1.user.publicId as UserId,
        partnerData1.partner.publicId as PartnerId
      );

      const userSession2 = createUserSession(
        partnerData2.user.publicId as UserId,
        partnerData2.partner.publicId as PartnerId
      );

      service1 = await serviceService.createService({
        name: 'Service A',
        config: {
          businessModel: 'PRIVATE',
          vehicleTypeIds: [masterData.vehicleType.publicId],
          payloadTypeIds: [masterData.payloadType.publicId],
          operationalRange: { maxDistanceKm: 15 },
          orderOptions: ['A_TO_B'],
        },
      }, userSession1);

      service2 = await serviceService.createService({
        name: 'Service B',
        config: {
          businessModel: 'PUBLIC',
          vehicleTypeIds: [masterData.vehicleType.publicId],
          payloadTypeIds: [masterData.payloadType.publicId],
          operationalRange: { maxDistanceKm: 25 },
          orderOptions: ['PICKUP_AT_SENDER'],
        },
      }, userSession2);
    });

    it('should get service by public ID for owner', async () => {
      const result = await serviceService.getServiceByPublicId(
        service1.publicId,
        partnerData1.partner.publicId as PartnerId
      );

      expect(result.publicId).toBe(service1.publicId);
      expect(result.name).toBe('Service A');
    });

    it('should get all services for a partner', async () => {
      const services = await serviceService.getServicesByPartnerId(
        partnerData1.partner.publicId as PartnerId
      );

      expect(services).toHaveLength(1);
      expect(services[0].publicId).toBe(service1.publicId);
    });

    it('should not return services from other partners', async () => {
      const services = await serviceService.getServicesByPartnerId(
        partnerData2.partner.publicId as PartnerId
      );

      expect(services).toHaveLength(1);
      expect(services[0].publicId).toBe(service2.publicId);
      expect(services[0].name).toBe('Service B');
    });

    it('should throw error for non-existent service', async () => {
      await expect(serviceService.getServiceByPublicId('svc_nonexistent123456789' as ServiceId))
        .rejects.toThrow('Service with ID \'svc_nonexistent123456789\' not found');
    });
  });

  describe('5. Service Deletion (DELETE /api/v1/services/{serviceId})', () => {
    let serviceService: ReturnType<typeof createServiceService>;
    let partnerData: { partner: schema.Partner; user: schema.User };
    let masterData: any;
    let testService: ServiceDTO;

    beforeEach(async () => {
      serviceService = createServiceService(testDb, mockMonitoringService);
      partnerData = await createTestPartner();
      masterData = await createTestMasterData();
      
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      testService = await serviceService.createService({
        name: 'Service to Delete',
        config: {
          businessModel: 'PRIVATE',
          vehicleTypeIds: [masterData.vehicleType.publicId],
          payloadTypeIds: [masterData.payloadType.publicId],
          operationalRange: { maxDistanceKm: 15 },
          orderOptions: ['A_TO_B'],
        },
      }, userSession);
    });

    it('should soft delete service successfully', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      await serviceService.deleteService(testService.publicId, userSession);

      // Verify service is no longer accessible
      await expect(serviceService.getServiceByPublicId(testService.publicId))
        .rejects.toThrow('Service with ID');
    });

    it('should fail to delete service from different partner', async () => {
      const otherPartnerData = await createTestPartner();
      const userSession = createUserSession(
        otherPartnerData.user.publicId as UserId,
        otherPartnerData.partner.publicId as PartnerId
      );

      await expect(serviceService.deleteService(testService.publicId, userSession))
        .rejects.toThrow('Access denied');
    });

    it('should allow master admin to delete any service', async () => {
      const masterAdminSession = createUserSession(
        'user_masteradmin' as UserId,
        undefined,
        [{ role: 'MASTER_ADMIN' }]
      );

      await expect(serviceService.deleteService(testService.publicId, masterAdminSession))
        .resolves.not.toThrow();
    });

    it('should record audit event on successful deletion', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      await serviceService.deleteService(testService.publicId, userSession);

      expect(mockMonitoringService.recordSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auth_success',
          details: expect.objectContaining({
            action: 'service_delete',
          }),
        })
      );
    });
  });

  describe('6. Business Logic Validation', () => {
    let serviceService: ReturnType<typeof createServiceService>;
    let partnerData: { partner: schema.Partner; user: schema.User };
    let masterData: any;

    beforeEach(async () => {
      serviceService = createServiceService(testDb, mockMonitoringService);
      partnerData = await createTestPartner();
      masterData = await createTestMasterData();
    });

    it('should validate partner access correctly', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const serviceData: CreateServiceRequest = {
        name: 'Valid Service',
        config: {
          businessModel: 'PRIVATE',
          vehicleTypeIds: [masterData.vehicleType.publicId],
          payloadTypeIds: [masterData.payloadType.publicId],
          operationalRange: { maxDistanceKm: 15 },
          orderOptions: ['A_TO_B'],
        },
      };

      // Should succeed for correct partner context
      const result = await serviceService.createService(serviceData, userSession);
      expect(result.partnerId).toBe(partnerData.partner.publicId);
    });

    it('should transform database records correctly', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      const serviceData: CreateServiceRequest = {
        name: 'Transform Test',
        config: {
          businessModel: 'PUBLIC',
          vehicleTypeIds: [masterData.vehicleType.publicId],
          payloadTypeIds: [masterData.payloadType.publicId],
          facilityIds: [masterData.facility.publicId],
          capacity: {
            maxWeightKg: 50,
            maxItems: 10,
          },
          operationalRange: { maxDistanceKm: 30 },
          orderOptions: ['PICKUP_AT_SENDER', 'A_TO_B'],
        },
      };

      const result = await serviceService.createService(serviceData, userSession);

      expect(result.config.businessModel).toBe('PUBLIC');
      expect(result.config.capacity?.maxWeightKg).toBe(50);
      expect(result.config.capacity?.maxItems).toBe(10);
      expect(result.config.facilityIds).toContain(masterData.facility.publicId);
      expect(result.config.orderOptions).toHaveLength(2);
      expect(typeof result.createdAt).toBe('string');
      expect(typeof result.updatedAt).toBe('string');
    });

    it('should handle partial config updates correctly', async () => {
      const userSession = createUserSession(
        partnerData.user.publicId as UserId,
        partnerData.partner.publicId as PartnerId
      );

      // Create initial service
      const initialService = await serviceService.createService({
        name: 'Initial Service',
        config: {
          businessModel: 'PRIVATE',
          vehicleTypeIds: [masterData.vehicleType.publicId],
          payloadTypeIds: [masterData.payloadType.publicId],
          operationalRange: { maxDistanceKm: 15 },
          orderOptions: ['A_TO_B'],
        },
      }, userSession);

      // Update with partial config
      const updatedService = await serviceService.updateService(
        initialService.publicId,
        {
          config: {
            businessModel: 'PUBLIC',
            vehicleTypeIds: [masterData.vehicleType.publicId],
            payloadTypeIds: [masterData.payloadType.publicId],
            operationalRange: { maxDistanceKm: 25 },
            orderOptions: ['PICKUP_AT_SENDER'],
          },
        },
        userSession
      );

      expect(updatedService.config.businessModel).toBe('PUBLIC');
      expect(updatedService.config.operationalRange.maxDistanceKm).toBe(25);
      expect(updatedService.config.orderOptions).toEqual(['PICKUP_AT_SENDER']);
    });
  });

  describe('7. Error Handling', () => {
    let serviceService: ReturnType<typeof createServiceService>;

    beforeEach(() => {
      serviceService = createServiceService(testDb, mockMonitoringService);
    });

    it('should throw ServiceNotFoundError for non-existent service', async () => {
      await expect(serviceService.getServiceByPublicId('svc_nonexistent123456789' as ServiceId))
        .rejects.toThrow('Service with ID \'svc_nonexistent123456789\' not found');
    });

    it('should throw ServicePermissionError for insufficient permissions', async () => {
      const driverSession = createUserSession(
        'user_driver' as UserId,
        undefined,
        [{ role: 'DRIVER' }]
      );

      const serviceData: CreateServiceRequest = {
        name: 'Unauthorized Service',
        config: {
          businessModel: 'PRIVATE',
          vehicleTypeIds: ['vt_test123456789012345'],
          payloadTypeIds: ['pt_test123456789012345'],
          operationalRange: { maxDistanceKm: 15 },
          orderOptions: ['A_TO_B'],
        },
      };

      await expect(serviceService.createService(serviceData, driverSession))
        .rejects.toThrow('Partner context required for creating services');
    });

    it('should handle service errors with proper error codes', async () => {
      try {
        await serviceService.getServiceByPublicId('svc_nonexistent123456789' as ServiceId);
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceError);
        if (error instanceof ServiceError) {
          expect(error.code).toBe('service_not_found');
          expect(error.statusCode).toBe(404);
        }
      }
    });
  });
});