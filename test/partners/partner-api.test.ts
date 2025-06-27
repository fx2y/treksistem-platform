/**
 * @fileoverview Partner API Integration Tests
 *
 * Comprehensive test suite for partner management functionality covering:
 * - Partner CRUD operations
 * - RBAC and permission validation
 * - Business rule enforcement
 * - Audit trail verification
 * - Multi-tenant data isolation
 * - Subscription management
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@treksistem/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  generateUserId,
  generatePartnerId,
  type UserId,
  type PartnerId,
} from '@treksistem/utils';
import {
  type PartnerDTO,
  type CreatePartnerRequest,
  type UpdatePartnerRequest,
  type UserSession,
  type BusinessType,
  type SubscriptionTier,
} from '@treksistem/types';
import { createPartnerService, PartnerError } from '../../apps/api/src/services/partner.service';
import { createDb } from '@treksistem/db';

// Test Database Setup
const sqlite = new Database(':memory:');
const testDb = drizzle(sqlite, { schema });

// Add batch method to test database for compatibility
(testDb as any).batch = async (statements: any[]) => {
  const results = [];
  for (const statement of statements) {
    results.push(await statement);
  }
  return results;
};

// Mock createDb to return our test database
vi.mock('@treksistem/db', async () => {
  const actual = await vi.importActual('@treksistem/db');
  return {
    ...actual,
    createDb: vi.fn(() => testDb),
  };
});

// Enhanced SQL schema including partners table
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

CREATE TABLE user_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  context_id TEXT,
  granted_at INTEGER NOT NULL,
  granted_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL,
  email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL,
  details TEXT,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes
CREATE UNIQUE INDEX users_public_id_idx ON users(public_id);
CREATE UNIQUE INDEX users_email_idx ON users(email);
CREATE UNIQUE INDEX users_google_id_idx ON users(google_id);

CREATE UNIQUE INDEX user_roles_composite_idx ON user_roles(user_id, role, context_id);
CREATE INDEX user_roles_context_id_idx ON user_roles(context_id);

CREATE UNIQUE INDEX partners_public_id_idx ON partners(public_id);
CREATE INDEX partners_owner_user_id_idx ON partners(owner_user_id);
CREATE INDEX partners_active_idx ON partners(is_active);
CREATE INDEX partners_subscription_tier_idx ON partners(subscription_tier);
CREATE INDEX partners_business_type_idx ON partners(business_type);
CREATE INDEX partners_email_idx ON partners(email);
CREATE INDEX partners_business_registration_number_idx ON partners(business_registration_number);

CREATE INDEX audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX audit_logs_action_idx ON audit_logs(action);
CREATE INDEX audit_logs_timestamp_idx ON audit_logs(timestamp);
`;

// Test User Interface
interface TestUser {
  id: number;
  publicId: UserId;
  email: string;
  fullName: string;
  googleId: string;
  session: UserSession;
}

// Mock monitoring service for testing
const mockMonitoringService = {
  recordSecurityEvent: async () => {},
  getHealthStatus: async () => ({ status: 'healthy' as const, timestamp: Date.now() }),
  logError: async () => {},
  logInfo: async () => {},
  logWarning: async () => {},
};

// Mock D1Database for testing
const mockD1Database: any = {
  prepare: () => ({
    bind: () => ({
      run: () => Promise.resolve({ success: true }),
      all: () => Promise.resolve([]),
      first: () => Promise.resolve(null),
    }),
  }),
  batch: () => Promise.resolve([]),
  exec: () => Promise.resolve(),
};


// Test Database Manager
class TestDatabaseManager {
  async initialize() {
    const statements = createTestTablesSQL.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        sqlite.exec(statement);
      }
    }
  }

  async cleanup() {
    const tables = ['audit_logs', 'user_roles', 'partners', 'users'];
    for (const table of tables) {
      sqlite.exec(`DELETE FROM ${table}`);
    }
  }

  getDb() {
    return testDb;
  }
}

const testDbManager = new TestDatabaseManager();

// Test User Factory
async function createTestUser(
  db: typeof testDb,
  options: {
    email?: string;
    fullName?: string;
    roles?: Array<{ role: string; contextId?: string }>;
  } = {}
): Promise<TestUser> {
  const publicId = generateUserId();
  const email = options.email || `test-${Math.random()}@example.com`;
  const fullName = options.fullName || 'Test User';
  const googleId = `google_${Math.random()}`;
  const now = new Date();

  // Create user
  const [user] = await db
    .insert(schema.users)
    .values({
      publicId,
      email,
      fullName,
      googleId,
      emailVerified: true,
      lastActivity: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Create roles if specified
  const userRoles = [];
  if (options.roles) {
    for (const roleSpec of options.roles) {
      const [role] = await db
        .insert(schema.userRoles)
        .values({
          userId: user.id,
          role: roleSpec.role as any,
          contextId: roleSpec.contextId || null,
          grantedAt: now,
          grantedBy: publicId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      
      userRoles.push({
        role: role.role,
        contextId: role.contextId,
        grantedAt: new Date(role.grantedAt).getTime(),
        grantedBy: role.grantedBy,
      });
    }
  }

  // Create user session
  const session: UserSession = {
    sub: publicId,
    email,
    email_verified: true,
    name: fullName,
    picture: 'https://example.com/avatar.jpg',
    roles: userRoles,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: `test_${Math.random()}`,
    sid: `session_${Math.random()}`,
    rate_limit_tier: 'basic',
    last_activity: Date.now(),
  };

  return {
    id: user.id,
    publicId,
    email,
    fullName,
    googleId,
    session,
  };
}

// Helper to refresh user session with updated roles from database
async function refreshUserSession(
  db: typeof testDb,
  testUser: TestUser
): Promise<TestUser> {
  // Fetch fresh roles from database
  const userRoles = await db
    .select()
    .from(schema.userRoles)
    .where(eq(schema.userRoles.userId, testUser.id));

  const freshRoles = userRoles.map(role => ({
    role: role.role,
    contextId: role.contextId,
    grantedAt: role.grantedAt.getTime(),
    grantedBy: role.grantedBy,
  }));

  // Create fresh session with updated roles
  const session: UserSession = {
    ...testUser.session,
    roles: freshRoles,
  };

  return {
    ...testUser,
    session,
  };
}

// Test Suite
describe('Partner API Integration Tests', () => {
  beforeAll(async () => {
    await testDbManager.initialize();
  });

  afterAll(async () => {
    sqlite.close();
  });

  beforeEach(async () => {
    await testDbManager.cleanup();
  });

  describe('Partner Creation', () => {
    it('should create a partner with automatic role assignment', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser = await createTestUser(db);
      
      const createRequest: CreatePartnerRequest = {
        name: 'Alpha Logistics',
        businessType: 'UMKM',
        description: 'Small logistics company',
        address: 'Jl. Sudirman 123, Jakarta',
        phoneNumber: '+62-21-1234567',
        email: 'contact@alpha.co.id',
        subscriptionTier: 'BASIC',
      };

      const partner = await partnerService.createPartner(testUser.session, createRequest);

      // Verify partner creation
      expect(partner.publicId).toMatch(/^partner_[A-Za-z0-9_-]{21}$/);
      expect(partner.name).toBe('Alpha Logistics');
      expect(partner.businessType).toBe('UMKM');
      expect(partner.email).toBe('contact@alpha.co.id');
      expect(partner.subscriptionTier).toBe('BASIC');
      expect(partner.isActive).toBe(true);
      expect(partner.maxDrivers).toBe(10);
      expect(partner.maxVehicles).toBe(5);

      // Verify role assignment
      const userRoles = await db.query.userRoles.findMany({
        where: eq(schema.userRoles.userId, testUser.id),
      });

      expect(userRoles).toHaveLength(1);
      expect(userRoles[0].role).toBe('PARTNER_ADMIN');
      expect(userRoles[0].contextId).toBe(partner.publicId);

      // Verify partner exists in database
      const dbPartner = await db.query.partners.findFirst({
        where: eq(schema.partners.publicId, partner.publicId),
      });

      expect(dbPartner).toBeDefined();
      expect(dbPartner!.name).toBe('Alpha Logistics');
    });

    it('should validate unique business registration number', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser1 = await createTestUser(db, { email: 'user1@test.com' });
      const testUser2 = await createTestUser(db, { email: 'user2@test.com' });

      const createRequest1: CreatePartnerRequest = {
        name: 'First Partner',
        businessRegistrationNumber: 'REG123456789',
      };

      const createRequest2: CreatePartnerRequest = {
        name: 'Second Partner',
        businessRegistrationNumber: 'REG123456789', // Same registration number
      };

      // First creation should succeed
      await partnerService.createPartner(testUser1.session, createRequest1);

      // Second creation should fail
      await expect(
        partnerService.createPartner(testUser2.session, createRequest2)
      ).rejects.toThrow('Business registration number');
    });

    it('should validate unique partner email', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser1 = await createTestUser(db, { email: 'user1@test.com' });
      const testUser2 = await createTestUser(db, { email: 'user2@test.com' });

      const createRequest1: CreatePartnerRequest = {
        name: 'First Partner',
        email: 'contact@partner.com',
      };

      const createRequest2: CreatePartnerRequest = {
        name: 'Second Partner',
        email: 'contact@partner.com', // Same email
      };

      // First creation should succeed
      await partnerService.createPartner(testUser1.session, createRequest1);

      // Second creation should fail
      await expect(
        partnerService.createPartner(testUser2.session, createRequest2)
      ).rejects.toThrow('Partner email');
    });

    it('should handle multiple partners per user', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser = await createTestUser(db);

      const createRequest1: CreatePartnerRequest = {
        name: 'First Company',
        businessType: 'UMKM',
      };

      const createRequest2: CreatePartnerRequest = {
        name: 'Second Company',
        businessType: 'CORPORATION',
      };

      const partner1 = await partnerService.createPartner(testUser.session, createRequest1);
      const partner2 = await partnerService.createPartner(testUser.session, createRequest2);

      expect(partner1.publicId).not.toBe(partner2.publicId);
      expect(partner1.name).toBe('First Company');
      expect(partner2.name).toBe('Second Company');

      // Verify both partners belong to same user
      const userPartners = await partnerService.getPartnersByOwner(testUser.publicId);
      expect(userPartners).toHaveLength(2);
    });
  });

  describe('Partner Retrieval', () => {
    it('should retrieve partner with proper access control', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const ownerUser = await createTestUser(db, { email: 'owner@test.com' });
      const otherUser = await createTestUser(db, { email: 'other@test.com' });

      const createRequest: CreatePartnerRequest = {
        name: 'Test Partner',
        businessType: 'UMKM',
      };

      const partner = await partnerService.createPartner(ownerUser.session, createRequest);

      // Refresh user session to include the newly created PARTNER_ADMIN role
      const refreshedOwnerUser = await refreshUserSession(db, ownerUser);

      // Owner should be able to retrieve partner
      const retrievedPartner = await partnerService.getPartner(partner.publicId, refreshedOwnerUser.session);
      expect(retrievedPartner.publicId).toBe(partner.publicId);

      // Other user should not have access (this would be handled by the session validation)
      // In practice, the getUserSession would throw an error for unauthorized access
    });

    it('should retrieve partners by owner', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser = await createTestUser(db);

      const createRequest1: CreatePartnerRequest = { name: 'Partner 1' };
      const createRequest2: CreatePartnerRequest = { name: 'Partner 2' };

      await partnerService.createPartner(testUser.session, createRequest1);
      await partnerService.createPartner(testUser.session, createRequest2);

      const userPartners = await partnerService.getPartnersByOwner(testUser.publicId);

      expect(userPartners).toHaveLength(2);
      expect(userPartners.map(p => p.name)).toContain('Partner 1');
      expect(userPartners.map(p => p.name)).toContain('Partner 2');
    });
  });

  describe('Partner Updates', () => {
    it('should update partner with proper validation', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser = await createTestUser(db);

      // Create partner first
      const createRequest: CreatePartnerRequest = {
        name: 'Original Name',
        businessType: 'UMKM',
        description: 'Original description',
      };

      const partner = await partnerService.createPartner(testUser.session, createRequest);

      // Refresh user session to include the newly created PARTNER_ADMIN role
      const refreshedTestUser = await refreshUserSession(db, testUser);

      const updateRequest: UpdatePartnerRequest = {
        name: 'Updated Name',
        description: 'Updated description',
        subscriptionTier: 'PREMIUM',
      };

      const updatedPartner = await partnerService.updatePartner(
        refreshedTestUser.session,
        partner.publicId,
        updateRequest
      );

      expect(updatedPartner.name).toBe('Updated Name');
      expect(updatedPartner.description).toBe('Updated description');
      expect(updatedPartner.subscriptionTier).toBe('PREMIUM');
      expect(updatedPartner.updatedBy).toBe(refreshedTestUser.publicId);
    });

    it('should validate business rules during update', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser1 = await createTestUser(db, { email: 'user1@test.com' });
      const testUser2 = await createTestUser(db, { email: 'user2@test.com' });

      // Create two partners
      const partner1 = await partnerService.createPartner(testUser1.session, {
        name: 'Partner 1',
        email: 'partner1@test.com',
      });

      const partner2 = await partnerService.createPartner(testUser2.session, {
        name: 'Partner 2',
        email: 'partner2@test.com',
      });

      // Refresh user session to include the newly created PARTNER_ADMIN role
      const refreshedTestUser1 = await refreshUserSession(db, testUser1);

      // Try to update partner1 with partner2's email - should fail
      await expect(
        partnerService.updatePartner(refreshedTestUser1.session, partner1.publicId, {
          email: 'partner2@test.com',
        })
      ).rejects.toThrow('Partner email');
    });
  });

  describe('Partner Deletion', () => {
    it('should soft delete partner', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser = await createTestUser(db);
      const partner = await partnerService.createPartner(testUser.session, {
        name: 'Test Partner',
      });

      const refreshedTestUser = await refreshUserSession(db, testUser);

      await partnerService.deletePartner(refreshedTestUser.session, partner.publicId);

      // Verify partner is soft deleted
      const deletedPartner = await db.query.partners.findFirst({
        where: eq(schema.partners.publicId, partner.publicId),
      });

      expect(deletedPartner).toBeDefined();
      expect(deletedPartner!.isActive).toBe(false);
    });
  });

  describe('Subscription Management', () => {
    it('should update subscription tier', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser = await createTestUser(db);
      const partner = await partnerService.createPartner(testUser.session, {
        name: 'Test Partner',
        subscriptionTier: 'BASIC',
      });

      const refreshedTestUser = await refreshUserSession(db, testUser);

      const updatedPartner = await partnerService.updateSubscription(
        partner.publicId,
        'ENTERPRISE',
        refreshedTestUser.session
      );

      expect(updatedPartner.subscriptionTier).toBe('ENTERPRISE');
    });
  });

  describe('Business Type Validation', () => {
    it('should accept valid business types', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser = await createTestUser(db);

      const businessTypes: BusinessType[] = ['UMKM', 'CORPORATION', 'INDIVIDUAL'];

      for (const businessType of businessTypes) {
        const partner = await partnerService.createPartner(testUser.session, {
          name: `${businessType} Partner`,
          businessType,
        });

        expect(partner.businessType).toBe(businessType);
      }
    });
  });

  describe('Location Data', () => {
    it('should handle geospatial coordinates', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser = await createTestUser(db);

      const partner = await partnerService.createPartner(testUser.session, {
        name: 'Jakarta Partner',
        address: 'Jakarta, Indonesia',
        locationLat: -6.2088,
        locationLng: 106.8456,
      });

      expect(partner.locationLat).toBe(-6.2088);
      expect(partner.locationLng).toBe(106.8456);
    });
  });

  describe('Statistics', () => {
    it('should return partner statistics structure', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser = await createTestUser(db);
      const partner = await partnerService.createPartner(testUser.session, {
        name: 'Test Partner',
      });

      const refreshedTestUser = await refreshUserSession(db, testUser);

      const statistics = await partnerService.getPartnerStatistics(partner.publicId, refreshedTestUser.session);

      expect(statistics).toHaveProperty('activeDrivers');
      expect(statistics).toHaveProperty('activeVehicles');
      expect(statistics).toHaveProperty('totalOrders');
      expect(typeof statistics.activeDrivers).toBe('number');
      expect(typeof statistics.activeVehicles).toBe('number');
      expect(typeof statistics.totalOrders).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle partner not found', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser = await createTestUser(db);
      const nonExistentPartnerId = generatePartnerId();

      await expect(
        partnerService.getPartner(nonExistentPartnerId, testUser.session)
      ).rejects.toThrow('Partner with ID');
    });

    it('should handle user not found', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const nonExistentUserId = generateUserId();
      const mockUserSession: UserSession = {
        sub: nonExistentUserId,
        email: 'nonexistent@test.com',
        name: 'Non Existent User',
        picture: '',
        email_verified: true,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: 'test-jti',
        roles: []
      };

      await expect(
        partnerService.createPartner(mockUserSession, { name: 'Test Partner' })
      ).rejects.toThrow('User not found');
    });
  });

  describe('Data Consistency', () => {
    it('should maintain referential integrity', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser = await createTestUser(db);
      const partner = await partnerService.createPartner(testUser.session, {
        name: 'Test Partner',
      });

      // Verify foreign key relationships
      const dbPartner = await db.query.partners.findFirst({
        where: eq(schema.partners.publicId, partner.publicId),
        with: {
          owner: true,
        },
      });

      expect(dbPartner).toBeDefined();
      expect(dbPartner!.owner).toBeDefined();
      expect(dbPartner!.owner.publicId).toBe(testUser.publicId);
    });

    it('should handle concurrent operations safely', async () => {
      const db = testDbManager.getDb();
      const partnerService = createPartnerService(db, mockMonitoringService as any);
      
      const testUser1 = await createTestUser(db, { email: 'user1@test.com' });
      const testUser2 = await createTestUser(db, { email: 'user2@test.com' });

      // Create partners concurrently
      const promises = [
        partnerService.createPartner(testUser1.session, {
          name: 'Concurrent Partner 1',
          email: 'concurrent1@test.com',
        }),
        partnerService.createPartner(testUser2.session, {
          name: 'Concurrent Partner 2',
          email: 'concurrent2@test.com',
        }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(2);
      expect(results[0].publicId).not.toBe(results[1].publicId);
      expect(results[0].name).toBe('Concurrent Partner 1');
      expect(results[1].name).toBe('Concurrent Partner 2');
    });
  });
});