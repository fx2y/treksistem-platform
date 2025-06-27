/**
 * Pricing Scheme Management Service
 * 
 * Implements business logic for service-scoped pricing scheme management with
 * comprehensive security, audit trails, and error handling.
 * 
 * Features:
 * - Service data isolation (pricing schemes are always service-scoped)
 * - RBAC integration with partner context validation through services
 * - Comprehensive audit logging
 * - Type-safe operations with branded identifiers
 * - Performance-optimized queries with proper indexing
 */

import { createDb, type D1Database } from '@treksistem/db';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import {
  pricingSchemes,
  services,
  type PricingScheme,
  type NewPricingScheme,
  type Service,
} from '@treksistem/db';
import {
  generatePricingSchemeId,
  type PricingSchemeId,
  type ServiceId,
  type PartnerId,
  type UserId,
} from '@treksistem/utils';
import {
  type PricingSchemeDTO,
  type CreateOrUpdatePricingSchemeDTO,
  type UserSession,
  type PricingSchemeParams,
} from '@treksistem/types';
import { and, eq } from 'drizzle-orm';
import type { MonitoringService } from './monitoring.service';

// Pricing scheme error types for consistent error handling
export class PricingSchemeError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'PricingSchemeError';
  }
}

export class PricingSchemePermissionError extends PricingSchemeError {
  constructor(message: string = 'Insufficient permissions for this operation') {
    super(message, 'insufficient_permissions', 403);
  }
}

export class PricingSchemeNotFoundError extends PricingSchemeError {
  constructor(serviceId: string) {
    super(`Pricing scheme for service '${serviceId}' not found`, 'pricing_scheme_not_found', 404);
  }
}

export class PricingSchemeExistsError extends PricingSchemeError {
  constructor(serviceId: string) {
    super(`Pricing scheme for service '${serviceId}' already exists`, 'pricing_scheme_exists', 409);
  }
}

export class ServiceNotFoundError extends PricingSchemeError {
  constructor(serviceId: string) {
    super(`Service with ID '${serviceId}' not found`, 'service_not_found', 404);
  }
}

export class PartnerContextError extends PricingSchemeError {
  constructor(message: string = 'Partner context validation failed') {
    super(message, 'partner_context_error', 403);
  }
}

/**
 * Pricing scheme management service interface
 */
export interface PricingSchemeService {
  createPricingScheme(serviceId: ServiceId, data: CreateOrUpdatePricingSchemeDTO, user: UserSession): Promise<PricingSchemeDTO>;
  updatePricingScheme(serviceId: ServiceId, data: CreateOrUpdatePricingSchemeDTO, user: UserSession): Promise<PricingSchemeDTO>;
  getPricingSchemeByServiceId(serviceId: ServiceId, user?: UserSession): Promise<PricingSchemeDTO>;
  deletePricingScheme(serviceId: ServiceId, user: UserSession): Promise<void>;
}

/**
 * Creates a pricing scheme management service instance
 */
export function createPricingSchemeService(
  d1DatabaseOrDb: D1Database | DrizzleD1Database,
  monitoring: MonitoringService
): PricingSchemeService {
  // Support both D1Database and direct drizzle instance for testing
  const db = 'select' in d1DatabaseOrDb && typeof d1DatabaseOrDb.select === 'function' 
    ? d1DatabaseOrDb
    : createDb(d1DatabaseOrDb as D1Database);

  // Helper function to get user's partner context
  const getUserPartnerContext = (user: UserSession): PartnerId | null => {
    const partnerRole = user.roles.find(role => role.contextId);
    return partnerRole?.contextId as PartnerId || null;
  };

  // Helper function to check if user is master admin
  const isMasterAdmin = (user: UserSession): boolean => {
    return user.roles.some(role => role.role === 'MASTER_ADMIN');
  };

  // Helper function to get service and validate access
  const validateServiceAccess = async (
    serviceId: ServiceId,
    user: UserSession,
    operation: string
  ): Promise<Service> => {
    const service = await db
      .select()
      .from(services)
      .where(eq(services.publicId, serviceId))
      .limit(1);

    if (!service[0]) {
      throw new ServiceNotFoundError(serviceId);
    }

    const isMaster = isMasterAdmin(user);
    const userPartnerId = getUserPartnerContext(user);

    // Master admins can access everything
    if (isMaster) return service[0];

    // For non-master admins, ensure they only access their own partner's services
    if (service[0].partnerId !== userPartnerId) {
      throw new PartnerContextError(
        `Cannot ${operation} pricing scheme for service '${serviceId}'. Access denied.`
      );
    }

    return service[0];
  };

  // Helper function to record audit events
  const recordAuditEvent = async (
    operation: string,
    user: UserSession,
    serviceId: string,
    partnerId: PartnerId,
    changes?: Record<string, unknown>
  ) => {
    await monitoring.recordSecurityEvent({
      type: 'auth_success',
      userId: user.sub,
      email: user.email,
      details: {
        action: `pricing_scheme_${operation}`,
        serviceId,
        partnerId,
        changes: changes ? JSON.stringify(changes) : undefined,
        operation,
      },
      timestamp: Date.now(),
      severity: 'info',
    });
  };

  // Removed unused function - transformDbPricingSchemeWithService is used instead

  // Enhanced transformation helper that includes service publicId
  const transformDbPricingSchemeWithService = async (
    dbRecord: PricingScheme
  ): Promise<PricingSchemeDTO> => {
    const service = await db
      .select({ publicId: services.publicId })
      .from(services)
      .where(eq(services.id, dbRecord.serviceId))
      .limit(1);

    if (!service[0]) {
      throw new ServiceNotFoundError(`service-id-${dbRecord.serviceId}`);
    }

    return {
      pricingSchemeId: dbRecord.publicId as PricingSchemeId,
      serviceId: service[0].publicId as ServiceId,
      type: dbRecord.type,
      params: JSON.parse(dbRecord.params) as PricingSchemeParams,
      isActive: dbRecord.isActive,
      createdAt: dbRecord.createdAt.toISOString(),
      updatedAt: dbRecord.updatedAt.toISOString(),
      createdBy: dbRecord.createdBy as UserId,
      updatedBy: dbRecord.updatedBy as UserId,
    };
  };

  // Service implementation
  const createPricingScheme = async (
    serviceId: ServiceId,
    data: CreateOrUpdatePricingSchemeDTO,
    user: UserSession
  ): Promise<PricingSchemeDTO> => {
    // Validate service exists and user has access
    const service = await validateServiceAccess(serviceId, user, 'create pricing scheme for');

    // Check if pricing scheme already exists for this service
    const existing = await db
      .select()
      .from(pricingSchemes)
      .where(eq(pricingSchemes.serviceId, service.id))
      .limit(1);

    if (existing[0]) {
      throw new PricingSchemeExistsError(serviceId);
    }

    const publicId = generatePricingSchemeId();
    const now = new Date();
    
    const newRecord: NewPricingScheme = {
      publicId,
      serviceId: service.id,
      type: data.type,
      params: JSON.stringify(data.params),
      isActive: data.is_active,
      createdAt: now,
      updatedAt: now,
      createdBy: user.sub as UserId,
      updatedBy: user.sub as UserId,
    };

    await db.insert(pricingSchemes).values(newRecord);

    await recordAuditEvent(
      'create',
      user,
      serviceId,
      service.partnerId as PartnerId,
      { type: data.type, params: data.params, isActive: data.is_active } as Record<string, unknown>
    );

    return await getPricingSchemeByServiceId(serviceId, user);
  };

  const updatePricingScheme = async (
    serviceId: ServiceId,
    data: CreateOrUpdatePricingSchemeDTO,
    user: UserSession
  ): Promise<PricingSchemeDTO> => {
    // Validate service exists and user has access
    const service = await validateServiceAccess(serviceId, user, 'update pricing scheme for');

    // Get existing pricing scheme
    const existing = await db
      .select()
      .from(pricingSchemes)
      .where(eq(pricingSchemes.serviceId, service.id))
      .limit(1);

    if (!existing[0]) {
      throw new PricingSchemeNotFoundError(serviceId);
    }

    const updateData: Partial<PricingScheme> = {
      type: data.type,
      params: JSON.stringify(data.params),
      isActive: data.is_active,
      updatedAt: new Date(),
      updatedBy: user.sub as UserId,
    };

    await db
      .update(pricingSchemes)
      .set(updateData)
      .where(eq(pricingSchemes.serviceId, service.id));

    await recordAuditEvent(
      'update',
      user,
      serviceId,
      service.partnerId as PartnerId,
      data as Record<string, unknown>
    );

    // Refetch the updated record directly to ensure the latest state is returned,
    // especially after status changes (e.g., isActive: false).
    const updatedRecord = await db
      .select()
      .from(pricingSchemes)
      .where(eq(pricingSchemes.serviceId, service.id))
      .limit(1);

    if (!updatedRecord[0]) {
      // This should not happen if the update was successful, but as a safeguard:
      throw new PricingSchemeNotFoundError(serviceId);
    }

    return await transformDbPricingSchemeWithService(updatedRecord[0]);
  };

  const getPricingSchemeByServiceId = async (
    serviceId: ServiceId,
    user?: UserSession
  ): Promise<PricingSchemeDTO> => {
    // For public access or when user is provided, validate access
    if (user) {
      await validateServiceAccess(serviceId, user, 'access pricing scheme for');
    }

    // Get service ID first
    const service = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.publicId, serviceId))
      .limit(1);

    if (!service[0]) {
      throw new ServiceNotFoundError(serviceId);
    }

    const record = await db
      .select()
      .from(pricingSchemes)
      .where(
        and(
          eq(pricingSchemes.serviceId, service[0].id),
          eq(pricingSchemes.isActive, true)
        )
      )
      .limit(1);

    if (!record[0]) {
      throw new PricingSchemeNotFoundError(serviceId);
    }

    return await transformDbPricingSchemeWithService(record[0]);
  };

  const deletePricingScheme = async (
    serviceId: ServiceId,
    user: UserSession
  ): Promise<void> => {
    // Validate service exists and user has access
    const service = await validateServiceAccess(serviceId, user, 'delete pricing scheme for');

    // Check if pricing scheme exists
    const existing = await db
      .select()
      .from(pricingSchemes)
      .where(eq(pricingSchemes.serviceId, service.id))
      .limit(1);

    if (!existing[0]) {
      throw new PricingSchemeNotFoundError(serviceId);
    }

    // Soft delete
    await db
      .update(pricingSchemes)
      .set({
        isActive: false,
        updatedAt: new Date(),
        updatedBy: user.sub as UserId,
      })
      .where(eq(pricingSchemes.serviceId, service.id));

    await recordAuditEvent(
      'delete',
      user,
      serviceId,
      service.partnerId as PartnerId
    );
  };

  // Return service interface with all implementations
  return {
    createPricingScheme,
    updatePricingScheme,
    getPricingSchemeByServiceId,
    deletePricingScheme,
  };
}