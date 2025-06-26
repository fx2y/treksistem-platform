/**
 * @fileoverview Test Database Setup for OAuth Verification
 *
 * Sets up an in-memory SQLite database with the complete schema
 * for testing OAuth authentication flows
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@treksistem/db/schema';
import type {
  NewUser,
  NewUserRole,
  NewAuditLog,
  NewSessionRevocation,
} from '@treksistem/db/schema';
import { generateUserId } from '@treksistem/utils';

// Create in-memory database for testing
const sqlite = new Database(':memory:');
export const testDb = drizzle(sqlite, { schema });

// SQL to create tables - extracted from migrations
export const createTablesSQL = `
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

CREATE TABLE session_revocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  jti TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER NOT NULL,
  reason TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
CREATE INDEX users_last_activity_idx ON users(last_activity);

CREATE UNIQUE INDEX user_roles_composite_idx ON user_roles(user_id, role, context_id);
CREATE INDEX user_roles_context_id_idx ON user_roles(context_id);
CREATE INDEX user_roles_granted_by_idx ON user_roles(granted_by);
CREATE INDEX user_roles_granted_at_idx ON user_roles(granted_at);

CREATE UNIQUE INDEX session_revocations_jti_idx ON session_revocations(jti);
CREATE INDEX session_revocations_expires_at_idx ON session_revocations(expires_at);
CREATE INDEX session_revocations_user_id_idx ON session_revocations(user_id);

CREATE INDEX audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX audit_logs_action_idx ON audit_logs(action);
CREATE INDEX audit_logs_timestamp_idx ON audit_logs(timestamp);
CREATE INDEX audit_logs_email_idx ON audit_logs(email);
CREATE INDEX audit_logs_ip_address_idx ON audit_logs(ip_address);
`;

export function initializeTestDatabase() {
  // Execute all table creation statements
  const statements = createTablesSQL.split(';').filter(s => s.trim());

  for (const statement of statements) {
    if (statement.trim()) {
      sqlite.exec(statement);
    }
  }

  console.log('✅ Test database initialized with complete schema');
}

export async function seedTestData() {
  const now = new Date();

  // Create test users
  const testUsers: NewUser[] = [
    {
      publicId: generateUserId(),
      email: 'test.user@example.com',
      fullName: 'Test User',
      googleId: 'test_google_id_123',
      emailVerified: true,
      lastActivity: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      publicId: generateUserId(),
      email: 'admin.user@example.com',
      fullName: 'Admin User',
      googleId: 'admin_google_id_456',
      emailVerified: true,
      lastActivity: now,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const insertedUsers = [];
  for (const user of testUsers) {
    const [insertedUser] = await testDb
      .insert(schema.users)
      .values(user)
      .returning();
    insertedUsers.push(insertedUser);
  }

  // Create test roles
  const testRoles: NewUserRole[] = [
    {
      userId: insertedUsers[0].id,
      role: 'DRIVER',
      contextId: null,
      grantedAt: now,
      grantedBy: insertedUsers[1].publicId, // Admin granted the role
      createdAt: now,
      updatedAt: now,
    },
    {
      userId: insertedUsers[1].id,
      role: 'MASTER_ADMIN',
      contextId: null,
      grantedAt: now,
      grantedBy: 'system', // System-granted master admin role
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const role of testRoles) {
    await testDb.insert(schema.userRoles).values(role);
  }

  // Create test audit logs
  const testAuditLogs: NewAuditLog[] = [
    {
      userId: insertedUsers[0].id,
      action: 'login',
      email: insertedUsers[0].email,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      success: true,
      timestamp: now,
    },
    {
      userId: insertedUsers[1].id,
      action: 'user_created',
      email: insertedUsers[1].email,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      success: true,
      timestamp: now,
    },
  ];

  for (const log of testAuditLogs) {
    await testDb.insert(schema.auditLogs).values(log);
  }

  console.log('✅ Test database seeded with sample data');
  return insertedUsers;
}

export async function cleanTestDatabase() {
  // Clean all tables in reverse dependency order
  await testDb.delete(schema.auditLogs);
  await testDb.delete(schema.sessionRevocations);
  await testDb.delete(schema.userRoles);
  await testDb.delete(schema.users);

  console.log('✅ Test database cleaned');
}

export function closeTestDatabase() {
  sqlite.close();
  console.log('✅ Test database connection closed');
}

// Test database utilities
export class TestDatabaseManager {
  async setup() {
    initializeTestDatabase();
    return seedTestData();
  }

  async cleanup() {
    await cleanTestDatabase();
  }

  async reset() {
    await this.cleanup();
    return await seedTestData();
  }

  getDb() {
    return testDb;
  }

  close() {
    closeTestDatabase();
  }
}

// Export singleton instance
export const testDbManager = new TestDatabaseManager();

// Integration test helpers
export async function createTestUser(overrides: Partial<NewUser> = {}) {
  const now = new Date();
  const defaultUser: NewUser = {
    publicId: generateUserId(),
    email: `test-${Date.now()}@example.com`,
    fullName: 'Test User',
    googleId: `test_google_${Date.now()}`,
    emailVerified: true,
    lastActivity: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };

  const [user] = await testDb
    .insert(schema.users)
    .values(defaultUser)
    .returning();
  return user;
}

export async function createTestUserRole(
  userId: number,
  role: schema.Role = 'DRIVER',
  contextId: string | null = null,
  grantedBy: string = 'system'
) {
  const now = new Date();
  const userRole: NewUserRole = {
    userId,
    role,
    contextId,
    grantedAt: now,
    grantedBy,
    createdAt: now,
    updatedAt: now,
  };

  const [insertedRole] = await testDb
    .insert(schema.userRoles)
    .values(userRole)
    .returning();
  return insertedRole;
}

export async function createTestAuditLog(
  userId: number,
  action: string,
  success: boolean = true
) {
  const now = new Date();
  const auditLog: NewAuditLog = {
    userId,
    action,
    email: `test-${userId}@example.com`,
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    success,
    timestamp: now,
  };

  const [log] = await testDb
    .insert(schema.auditLogs)
    .values(auditLog)
    .returning();
  return log;
}

export async function createTestSessionRevocation(
  jti: string,
  userId?: number
) {
  const now = new Date();
  const expiry = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours from now

  const revocation: NewSessionRevocation = {
    jti,
    userId: userId || null,
    expiresAt: expiry,
    revokedAt: now,
    reason: 'test_revocation',
  };

  const [revokedSession] = await testDb
    .insert(schema.sessionRevocations)
    .values(revocation)
    .returning();
  return revokedSession;
}
