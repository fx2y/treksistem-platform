import { relations } from 'drizzle-orm';
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import type { UserId } from '@treksistem/utils';
import type { 
  VehicleTypeId, 
  PayloadTypeId, 
  FacilityId, 
  PartnerId 
} from '@treksistem/types';

// Role type definition for TypeScript type safety
export const roleValues = ['MASTER_ADMIN', 'PARTNER_ADMIN', 'DRIVER'] as const;
export type Role = (typeof roleValues)[number];

// Users table schema
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    publicId: text('public_id').notNull().unique().$type<UserId>(),
    email: text('email').notNull().unique(),
    phoneNumber: text('phone_number'),
    fullName: text('full_name'),
    avatarUrl: text('avatar_url'),
    googleId: text('google_id').notNull().unique(),
    emailVerified: integer('email_verified', { mode: 'boolean' })
      .notNull()
      .default(false),
    lastActivity: integer('last_activity', { mode: 'timestamp' })
      .$defaultFn(() => new Date()),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  table => [
    uniqueIndex('users_public_id_idx').on(table.publicId),
    uniqueIndex('users_email_idx').on(table.email),
    uniqueIndex('users_google_id_idx').on(table.googleId),
    index('users_last_activity_idx').on(table.lastActivity),
  ]
);

// User roles table schema - Enhanced for RBAC with audit trail
export const userRoles = sqliteTable(
  'user_roles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().$type<Role>(),
    contextId: text('context_id'), // Partner public_id for scoped roles (string, not integer)
    grantedAt: integer('granted_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    grantedBy: text('granted_by').notNull(), // User public_id who granted this role
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  table => [
    uniqueIndex('user_roles_composite_idx').on(
      table.userId,
      table.role,
      table.contextId
    ),
    index('user_roles_context_id_idx').on(table.contextId),
    index('user_roles_granted_by_idx').on(table.grantedBy),
    index('user_roles_granted_at_idx').on(table.grantedAt),
  ]
);

// Session revocation table for JWT blacklisting
export const sessionRevocations = sqliteTable(
  'session_revocations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jti: text('jti').notNull().unique(), // JWT ID for revocation tracking
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    reason: text('reason'), // Optional reason for revocation
  },
  table => [
    uniqueIndex('session_revocations_jti_idx').on(table.jti),
    index('session_revocations_expires_at_idx').on(table.expiresAt),
    index('session_revocations_user_id_idx').on(table.userId),
  ]
);

// Audit log table for security monitoring
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // e.g., 'login', 'logout', 'token_refresh'
    email: text('email'), // Email involved in the action
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    success: integer('success', { mode: 'boolean' }).notNull(),
    details: text('details'), // JSON string for additional context
    timestamp: integer('timestamp', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  table => [
    index('audit_logs_user_id_idx').on(table.userId),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_timestamp_idx').on(table.timestamp),
    index('audit_logs_email_idx').on(table.email),
    index('audit_logs_ip_address_idx').on(table.ipAddress),
  ]
);

// Master data tables for partner-scoped configuration

// Master vehicle types table - Partner-scoped or global vehicle configurations
export const masterVehicleTypes = sqliteTable(
  'master_vehicle_types',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    publicId: text('public_id').notNull().unique().$type<VehicleTypeId>(),
    name: text('name').notNull(),
    description: text('description'),
    iconUrl: text('icon_url').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    partnerId: text('partner_id').$type<PartnerId>(), // Null = global
    displayOrder: integer('display_order').notNull().default(0),
    capabilities: text('capabilities'), // JSON array - e.g., ["HOT_FOOD", "FROZEN_FOOD"]
    // Audit fields
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    createdBy: text('created_by').notNull().$type<UserId>(),
    updatedBy: text('updated_by').notNull().$type<UserId>(),
  },
  table => [
    uniqueIndex('master_vehicle_types_public_id_idx').on(table.publicId),
    index('master_vehicle_types_partner_id_idx').on(table.partnerId),
    index('master_vehicle_types_active_idx').on(table.isActive),
    index('master_vehicle_types_display_order_idx').on(table.displayOrder),
    index('master_vehicle_types_name_idx').on(table.name),
  ]
);

// Master payload types table - Partner-scoped or global payload configurations
export const masterPayloadTypes = sqliteTable(
  'master_payload_types',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    publicId: text('public_id').notNull().unique().$type<PayloadTypeId>(),
    name: text('name').notNull(),
    description: text('description'),
    iconUrl: text('icon_url').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    partnerId: text('partner_id').$type<PartnerId>(), // Null = global
    displayOrder: integer('display_order').notNull().default(0),
    requirements: text('requirements'), // JSON array - e.g., ["TEMPERATURE_CONTROLLED", "FRAGILE"]
    // Audit fields
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    createdBy: text('created_by').notNull().$type<UserId>(),
    updatedBy: text('updated_by').notNull().$type<UserId>(),
  },
  table => [
    uniqueIndex('master_payload_types_public_id_idx').on(table.publicId),
    index('master_payload_types_partner_id_idx').on(table.partnerId),
    index('master_payload_types_active_idx').on(table.isActive),
    index('master_payload_types_display_order_idx').on(table.displayOrder),
    index('master_payload_types_name_idx').on(table.name),
  ]
);

// Master facilities table - Partner-scoped or global facility configurations
export const masterFacilities = sqliteTable(
  'master_facilities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    publicId: text('public_id').notNull().unique().$type<FacilityId>(),
    name: text('name').notNull(),
    description: text('description'),
    iconUrl: text('icon_url').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    partnerId: text('partner_id').$type<PartnerId>(), // Null = global
    displayOrder: integer('display_order').notNull().default(0),
    category: text('category').notNull(), // e.g., "COOLING", "STORAGE", "SAFETY"
    // Audit fields
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    createdBy: text('created_by').notNull().$type<UserId>(),
    updatedBy: text('updated_by').notNull().$type<UserId>(),
  },
  table => [
    uniqueIndex('master_facilities_public_id_idx').on(table.publicId),
    index('master_facilities_partner_id_idx').on(table.partnerId),
    index('master_facilities_active_idx').on(table.isActive),
    index('master_facilities_display_order_idx').on(table.displayOrder),
    index('master_facilities_name_idx').on(table.name),
    index('master_facilities_category_idx').on(table.category),
  ]
);

// Relations for relational queries
export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
  sessionRevocations: many(sessionRevocations),
  auditLogs: many(auditLogs),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
}));

export const sessionRevocationsRelations = relations(sessionRevocations, ({ one }) => ({
  user: one(users, { fields: [sessionRevocations.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

// Master data relations for audit trails
export const masterVehicleTypesRelations = relations(masterVehicleTypes, ({ one }) => ({
  creator: one(users, { 
    fields: [masterVehicleTypes.createdBy], 
    references: [users.publicId] 
  }),
  updater: one(users, { 
    fields: [masterVehicleTypes.updatedBy], 
    references: [users.publicId] 
  }),
}));

export const masterPayloadTypesRelations = relations(masterPayloadTypes, ({ one }) => ({
  creator: one(users, { 
    fields: [masterPayloadTypes.createdBy], 
    references: [users.publicId] 
  }),
  updater: one(users, { 
    fields: [masterPayloadTypes.updatedBy], 
    references: [users.publicId] 
  }),
}));

export const masterFacilitiesRelations = relations(masterFacilities, ({ one }) => ({
  creator: one(users, { 
    fields: [masterFacilities.createdBy], 
    references: [users.publicId] 
  }),
  updater: one(users, { 
    fields: [masterFacilities.updatedBy], 
    references: [users.publicId] 
  }),
}));

// Type inference helpers
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
export type SessionRevocation = typeof sessionRevocations.$inferSelect;
export type NewSessionRevocation = typeof sessionRevocations.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

// Enhanced types with relations
export type UserWithRoles = User & {
  userRoles: UserRole[];
};

export type UserRoleWithUser = UserRole & {
  user: User;
};

export type UserWithAuditHistory = User & {
  userRoles: UserRole[];
  sessionRevocations: SessionRevocation[];
  auditLogs: AuditLog[];
};

export type SessionRevocationWithUser = SessionRevocation & {
  user: User | null;
};

export type AuditLogWithUser = AuditLog & {
  user: User | null;
};

// Master data type inference helpers
export type MasterVehicleType = typeof masterVehicleTypes.$inferSelect;
export type NewMasterVehicleType = typeof masterVehicleTypes.$inferInsert;
export type MasterPayloadType = typeof masterPayloadTypes.$inferSelect;
export type NewMasterPayloadType = typeof masterPayloadTypes.$inferInsert;
export type MasterFacility = typeof masterFacilities.$inferSelect;
export type NewMasterFacility = typeof masterFacilities.$inferInsert;

// Enhanced master data types with relations
export type MasterVehicleTypeWithAudit = MasterVehicleType & {
  creator: User | null;
  updater: User | null;
};

export type MasterPayloadTypeWithAudit = MasterPayloadType & {
  creator: User | null;
  updater: User | null;
};

export type MasterFacilityWithAudit = MasterFacility & {
  creator: User | null;
  updater: User | null;
};
