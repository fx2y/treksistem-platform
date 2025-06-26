import { relations } from 'drizzle-orm';
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { UserId } from '@treksistem/utils';

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
  ]
);

// User roles table schema
export const userRoles = sqliteTable(
  'user_roles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().$type<Role>(),
    contextId: integer('context_id'),
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
  ]
);

// Relations for relational queries
export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
}));

// Type inference helpers
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;

// Enhanced types with relations
export type UserWithRoles = User & {
  userRoles: UserRole[];
};

export type UserRoleWithUser = UserRole & {
  user: User;
};
