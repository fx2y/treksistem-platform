/**
 * @fileoverview Database Integration Patterns for Public IDs
 * 
 * This module provides comprehensive patterns, examples, and utilities for integrating
 * secure public identifiers with Cloudflare D1 (SQLite) databases. It demonstrates
 * best practices for schema design, migrations, and query patterns that maintain
 * security while providing optimal performance.
 * 
 * ## Key Principles
 * - Never expose internal database IDs in APIs
 * - Always use public_id for external-facing operations
 * - Index public_id columns for optimal query performance
 * - Use branded TypeScript types for compile-time safety
 * 
 * @author Treksistem Platform Team
 */

import type { UserId, OrderId, ProductId, OrganizationId } from './identifiers.js'

// =============================================================================
// DATABASE SCHEMA EXAMPLES
// =============================================================================

/**
 * Example table schemas demonstrating proper public ID integration.
 * These schemas follow security best practices by separating internal
 * database IDs from public-facing identifiers.
 */
export const DATABASE_SCHEMAS = {
  /**
   * Users table with secure public ID
   * - Internal `id` for database relationships and performance
   * - Public `public_id` for API exposure and external references
   * - Unique constraint and index on public_id for fast lookups
   */
  users: `
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      username TEXT,
      password_hash TEXT NOT NULL,
      email_verified BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Performance indexes
    CREATE UNIQUE INDEX idx_users_public_id ON users(public_id);
    CREATE UNIQUE INDEX idx_users_email ON users(email);
    CREATE INDEX idx_users_created_at ON users(created_at);
  `,

  /**
   * Organizations table with hierarchical relationships
   */
  organizations: `
    CREATE TABLE organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      owner_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE UNIQUE INDEX idx_organizations_public_id ON organizations(public_id);
    CREATE UNIQUE INDEX idx_organizations_slug ON organizations(slug);
    CREATE INDEX idx_organizations_owner_id ON organizations(owner_id);
  `,

  /**
   * Products table with organization relationships
   */
  products: `
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price_cents INTEGER,
      active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE  
    );
    
    CREATE UNIQUE INDEX idx_products_public_id ON products(public_id);
    CREATE INDEX idx_products_organization_id ON products(organization_id);
    CREATE INDEX idx_products_active ON products(active);
  `,

  /**
   * Orders table with multiple relationships
   */
  orders: `
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      organization_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      total_cents INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );
    
    CREATE UNIQUE INDEX idx_orders_public_id ON orders(public_id);
    CREATE INDEX idx_orders_user_id ON orders(user_id);
    CREATE INDEX idx_orders_organization_id ON orders(organization_id);
    CREATE INDEX idx_orders_status ON orders(status);
    CREATE INDEX idx_orders_created_at ON orders(created_at);
  `
} as const

// =============================================================================
// TYPESCRIPT INTERFACES WITH BRANDED TYPES
// =============================================================================

/**
 * Database record interfaces that map internal structure to TypeScript types.
 * These interfaces represent the actual database records with internal IDs.
 */
export interface UserRecord {
  id: number                    // Internal DB ID (never exposed in API)
  public_id: UserId            // External API ID  
  email: string
  username: string | null
  password_hash: string
  email_verified: boolean
  created_at: string
  updated_at: string
}

export interface OrganizationRecord {
  id: number                    // Internal DB ID
  public_id: OrganizationId    // External API ID
  name: string
  slug: string | null
  owner_id: number             // Internal reference to users.id
  created_at: string
  updated_at: string
}

export interface ProductRecord {
  id: number                    // Internal DB ID
  public_id: ProductId         // External API ID
  organization_id: number      // Internal reference to organizations.id
  name: string
  description: string | null
  price_cents: number | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface OrderRecord {
  id: number                    // Internal DB ID
  public_id: OrderId           // External API ID
  user_id: number              // Internal reference to users.id
  organization_id: number      // Internal reference to organizations.id
  status: string
  total_cents: number
  created_at: string
  updated_at: string
}

/**
 * API response interfaces that only expose public identifiers.
 * These interfaces represent what gets returned to clients.
 */
export interface UserAPI {
  id: UserId                   // Maps to public_id column
  email: string
  username: string | null
  email_verified: boolean
  created_at: string
  updated_at: string
}

export interface OrganizationAPI {
  id: OrganizationId          // Maps to public_id column
  name: string
  slug: string | null
  owner_id: UserId            // Maps to users.public_id
  created_at: string
  updated_at: string
}

export interface ProductAPI {
  id: ProductId               // Maps to public_id column
  organization_id: OrganizationId // Maps to organizations.public_id
  name: string
  description: string | null
  price_cents: number | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface OrderAPI {
  id: OrderId                 // Maps to public_id column
  user_id: UserId            // Maps to users.public_id
  organization_id: OrganizationId // Maps to organizations.public_id
  status: string
  total_cents: number
  created_at: string
  updated_at: string
}

// =============================================================================
// QUERY PATTERNS FOR API ENDPOINTS
// =============================================================================

/**
 * Comprehensive query patterns that demonstrate secure API operations
 * using public IDs while maintaining optimal database performance.
 */
export const QUERY_PATTERNS = {
  /**
   * INSERT operations with generated public IDs
   */
  insertUser: `
    -- Generate public ID in application code, then insert
    INSERT INTO users (public_id, email, username, password_hash)
    VALUES (?, ?, ?, ?)
  `,

  insertOrganization: `
    -- Join with users table to resolve owner public ID to internal ID
    INSERT INTO organizations (public_id, name, slug, owner_id)
    SELECT ?, ?, ?, u.id
    FROM users u
    WHERE u.public_id = ?
  `,

  insertProduct: `
    -- Join with organizations table to resolve public ID to internal ID
    INSERT INTO products (public_id, organization_id, name, description, price_cents)
    SELECT ?, o.id, ?, ?, ?
    FROM organizations o
    WHERE o.public_id = ?
  `,

  /**
   * SELECT operations returning only public IDs
   */
  selectUserByPublicId: `
    -- Select user by public ID, returning only public-safe fields
    SELECT 
      public_id as id,
      email,
      username,
      email_verified,
      created_at,
      updated_at
    FROM users 
    WHERE public_id = ?
  `,

  selectUserOrganizations: `
    -- Get user's organizations using public ID
    SELECT 
      o.public_id as id,
      o.name,
      o.slug,
      u.public_id as owner_id,
      o.created_at,
      o.updated_at  
    FROM organizations o
    JOIN users u ON o.owner_id = u.id
    WHERE u.public_id = ?
    ORDER BY o.created_at DESC
  `,

  selectOrganizationProducts: `
    -- Get organization's products using public ID
    SELECT 
      p.public_id as id,
      o.public_id as organization_id,
      p.name,
      p.description,
      p.price_cents,
      p.active,
      p.created_at,
      p.updated_at
    FROM products p
    JOIN organizations o ON p.organization_id = o.id
    WHERE o.public_id = ? AND p.active = TRUE
    ORDER BY p.created_at DESC
  `,

  selectUserOrders: `
    -- Get user's orders with organization details
    SELECT 
      ord.public_id as id,
      u.public_id as user_id,
      o.public_id as organization_id,
      ord.status,
      ord.total_cents,
      ord.created_at,
      ord.updated_at
    FROM orders ord
    JOIN users u ON ord.user_id = u.id
    JOIN organizations o ON ord.organization_id = o.id
    WHERE u.public_id = ?
    ORDER BY ord.created_at DESC
  `,

  /**
   * UPDATE operations using public IDs
   */
  updateUserByPublicId: `
    UPDATE users 
    SET username = ?, updated_at = CURRENT_TIMESTAMP
    WHERE public_id = ?
  `,

  updateProductByPublicId: `
    -- Update product via public ID with organization ownership check
    UPDATE products 
    SET name = ?, description = ?, price_cents = ?, updated_at = CURRENT_TIMESTAMP
    WHERE public_id = ? 
      AND organization_id IN (
        SELECT id FROM organizations WHERE public_id = ?
      )
  `,

  /**
   * DELETE operations using public IDs
   */
  deleteUserByPublicId: `
    DELETE FROM users WHERE public_id = ?
  `,

  deleteProductByPublicId: `
    -- Delete product with organization ownership check
    DELETE FROM products 
    WHERE public_id = ? 
      AND organization_id IN (
        SELECT id FROM organizations WHERE public_id = ?
      )
  `
} as const

// =============================================================================
// MIGRATION SCRIPTS
// =============================================================================

/**
 * SQL migration scripts for adding public IDs to existing tables.
 * These scripts handle the transition from systems without public IDs.
 */
export const MIGRATION_SCRIPTS = {
  /**
   * Add public_id column to existing users table
   */
  addPublicIdToUsers: `
    -- Step 1: Add the column (nullable initially)
    ALTER TABLE users ADD COLUMN public_id TEXT;
    
    -- Step 2: Populate existing records with generated IDs
    -- Note: This uses SQLite's randomblob() as a fallback
    -- In production, generate proper nanoid values in your migration script
    UPDATE users 
    SET public_id = 'user_' || lower(hex(randomblob(11))) 
    WHERE public_id IS NULL;
    
    -- Step 3: Add constraints after population
    CREATE UNIQUE INDEX idx_users_public_id ON users(public_id);
    
    -- Step 4: Make column non-nullable (SQLite limitation workaround)
    -- This would typically require recreating the table in SQLite
  `,

  /**
   * Create trigger to auto-generate public IDs on insert
   * (Alternative approach for systems that prefer database-level generation)
   */
  createPublicIdTrigger: `
    -- Note: This is a fallback approach. Application-level generation is preferred.
    CREATE TRIGGER generate_user_public_id 
    AFTER INSERT ON users
    WHEN NEW.public_id IS NULL
    BEGIN
      UPDATE users 
      SET public_id = 'user_' || lower(hex(randomblob(11)))
      WHERE id = NEW.id;
    END;
  `
} as const

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Transforms a database record to API-safe format by mapping internal IDs to public IDs.
 * This function ensures that no internal database IDs are exposed in API responses.
 */
export function transformUserRecordToAPI(record: UserRecord): UserAPI {
  return {
    id: record.public_id,
    email: record.email,
    username: record.username,
    email_verified: record.email_verified,
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

/**
 * Transforms organization record with resolved owner public ID.
 */
export function transformOrganizationRecordToAPI(
  record: OrganizationRecord & { owner_public_id: UserId }
): OrganizationAPI {
  return {
    id: record.public_id,
    name: record.name,
    slug: record.slug,
    owner_id: record.owner_public_id,
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

/**
 * Transforms product record with resolved organization public ID.
 */
export function transformProductRecordToAPI(
  record: ProductRecord & { organization_public_id: OrganizationId }
): ProductAPI {
  return {
    id: record.public_id,
    organization_id: record.organization_public_id,
    name: record.name,
    description: record.description,
    price_cents: record.price_cents,
    active: record.active,
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

/**
 * Batch operation example: Create organization with initial products
 * Demonstrates transaction handling with public IDs.
 */
export const BATCH_OPERATIONS = {
  createOrganizationWithProducts: `
    -- Transaction example: Create organization and products atomically
    BEGIN TRANSACTION;
    
    -- Create organization
    INSERT INTO organizations (public_id, name, slug, owner_id)
    SELECT ?, ?, ?, u.id
    FROM users u
    WHERE u.public_id = ?;
    
    -- Get the internal organization ID for foreign key
    -- (This would be handled in application code with proper transaction)
    
    -- Create initial products
    INSERT INTO products (public_id, organization_id, name, price_cents)
    VALUES 
      (?, last_insert_rowid(), 'Starter Product', 999),
      (?, last_insert_rowid(), 'Premium Product', 2999);
    
    COMMIT;
  `
} as const