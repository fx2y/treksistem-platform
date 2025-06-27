/**
 * Service Management Service
 * 
 * Implements business logic for partner-scoped service management with
 * comprehensive security, audit trails, and error handling.
 * 
 * Features:
 * - Partner data isolation (services are always partner-scoped)
 * - RBAC integration with context validation
 * - Comprehensive audit logging
 * - Type-safe operations with branded identifiers
 * - Performance-optimized queries with proper indexing
 */

import { createDb, type D1Database } from '@treksistem/db';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import {
  services,
  type Service,
  type NewService,
} from '@treksistem/db';
import {
  generateServiceId,
  type ServiceId,
  type PartnerId,
  type UserId,
} from '@treksistem/utils';
import {
  type ServiceDTO,
  type CreateServiceRequest,
  type UpdateServiceRequest,
  type UserSession,
  type ServiceConfig,
} from '@treksistem/types';
import { and, eq, desc } from 'drizzle-orm';
import type { MonitoringService } from './monitoring.service';

// Service error types for consistent error handling
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class ServicePermissionError extends ServiceError {
  constructor(message: string = 'Insufficient permissions for this operation') {
    super(message, 'insufficient_permissions', 403);
  }
}

export class ServiceNotFoundError extends ServiceError {
  constructor(id: string) {
    super(`Service with ID '${id}' not found`, 'service_not_found', 404);
  }
}

export class PartnerContextError extends ServiceError {
  constructor(message: string = 'Partner context validation failed') {
    super(message, 'partner_context_error', 403);
  }
}

/**
 * Service management service interface
 */
export interface ServiceService {
  createService(data: CreateServiceRequest, user: UserSession): Promise<ServiceDTO>;
  updateService(serviceId: ServiceId, data: UpdateServiceRequest, user: UserSession): Promise<ServiceDTO>;
  getServiceByPublicId(serviceId: ServiceId, partnerId?: PartnerId): Promise<ServiceDTO>;
  getServicesByPartnerId(partnerId: PartnerId): Promise<ServiceDTO[]>;
  deleteService(serviceId: ServiceId, user: UserSession): Promise<void>;
}

/**
 * Creates a service management service instance
 */
export function createServiceService(
  d1DatabaseOrDb: D1Database | any,
  monitoring: MonitoringService
): ServiceService {
  // Support both D1Database and direct drizzle instance for testing
  const db = typeof d1DatabaseOrDb.select === 'function' 
    ? d1DatabaseOrDb 
    : createDb(d1DatabaseOrDb);

  // Helper function to get user's partner context
  const getUserPartnerContext = (user: UserSession): PartnerId | null => {
    const partnerRole = user.roles.find(role => role.contextId);
    return partnerRole?.contextId as PartnerId || null;
  };

  // Helper function to check if user is master admin
  const isMasterAdmin = (user: UserSession): boolean => {
    return user.roles.some(role => role.role === 'MASTER_ADMIN');
  };

  // Helper function to validate partner access
  const validatePartnerAccess = (
    user: UserSession,
    targetPartnerId: PartnerId,
    operation: string
  ): void => {
    const isMaster = isMasterAdmin(user);
    const userPartnerId = getUserPartnerContext(user);

    // Master admins can access everything
    if (isMaster) return;

    // For non-master admins, ensure they only access their own partner data
    if (targetPartnerId !== userPartnerId) {
      throw new PartnerContextError(
        `Cannot ${operation} service for partner '${targetPartnerId}'. Access denied.`
      );
    }
  };

  // Helper function to record audit events
  const recordAuditEvent = async (
    operation: string,
    user: UserSession,
    serviceId: string,
    partnerId: PartnerId,
    changes?: Record<string, any>
  ) => {
    await monitoring.recordSecurityEvent({
      type: 'auth_success',
      userId: user.sub,
      email: user.email,
      details: {
        action: `service_${operation}`,
        serviceId,
        partnerId,
        changes: changes ? JSON.stringify(changes) : undefined,
        operation,
      },
      timestamp: Date.now(),
      severity: 'info',
    });
  };

  // Database transformation helper
  const transformDbService = (dbRecord: Service): ServiceDTO => ({
    publicId: dbRecord.publicId as ServiceId,
    partnerId: dbRecord.partnerId as PartnerId,
    name: dbRecord.name,
    isActive: dbRecord.isActive,
    config: JSON.parse(dbRecord.config) as ServiceConfig,
    createdAt: dbRecord.createdAt.toISOString(),
    updatedAt: dbRecord.updatedAt.toISOString(),
    createdBy: dbRecord.createdBy as UserId,
    updatedBy: dbRecord.updatedBy as UserId,
  });

  // Service implementation
  const createService = async (
    data: CreateServiceRequest,
    user: UserSession
  ): Promise<ServiceDTO> => {
    const userPartnerId = getUserPartnerContext(user);
    const publicId = generateServiceId();

    // Services are always partner-scoped - partner context required
    if (!userPartnerId && !isMasterAdmin(user)) {
      throw new ServicePermissionError('Partner context required for creating services');
    }

    // For master admins, we need the partner context from somewhere (this might need to be passed differently)
    // For now, we'll require partner context even for master admins when creating services
    if (!userPartnerId) {
      throw new ServicePermissionError('Partner context required for creating services');
    }

    const now = new Date();
    const newRecord: NewService = {
      publicId,
      partnerId: userPartnerId,
      name: data.name,
      config: JSON.stringify(data.config),
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.sub as UserId,
      updatedBy: user.sub as UserId,
    };

    await db.insert(services).values(newRecord);

    await recordAuditEvent(
      'create',
      user,
      publicId,
      userPartnerId,
      { name: data.name, config: data.config }
    );

    return await getServiceByPublicId(publicId, userPartnerId);
  };

  const updateService = async (
    serviceId: ServiceId,
    data: UpdateServiceRequest,
    user: UserSession
  ): Promise<ServiceDTO> => {
    // First, get the existing record to validate ownership
    const existing = await getServiceByPublicId(serviceId);
    
    // Validate partner access
    validatePartnerAccess(user, existing.partnerId, 'update');

    const updateData: Partial<Service> = {
      ...(data.name && { name: data.name }),
      ...(data.config && { config: JSON.stringify(data.config) }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      updatedAt: new Date(),
      updatedBy: user.sub as UserId,
    };

    await db
      .update(services)
      .set(updateData)
      .where(eq(services.publicId, serviceId));

    await recordAuditEvent(
      'update',
      user,
      serviceId,
      existing.partnerId,
      data
    );

    return await getServiceByPublicIdInternal(serviceId, existing.partnerId);
  };

  const getServiceByPublicId = async (
    serviceId: ServiceId,
    partnerId?: PartnerId
  ): Promise<ServiceDTO> => {
    const record = await db
      .select()
      .from(services)
      .where(
        and(
          eq(services.publicId, serviceId),
          eq(services.isActive, true),
          partnerId ? eq(services.partnerId, partnerId) : undefined
        )
      )
      .limit(1);

    if (!record[0]) {
      throw new ServiceNotFoundError(serviceId);
    }

    return transformDbService(record[0]);
  };

  // Internal helper that can fetch services regardless of active status
  const getServiceByPublicIdInternal = async (
    serviceId: ServiceId,
    partnerId?: PartnerId
  ): Promise<ServiceDTO> => {
    const record = await db
      .select()
      .from(services)
      .where(
        and(
          eq(services.publicId, serviceId),
          partnerId ? eq(services.partnerId, partnerId) : undefined
        )
      )
      .limit(1);

    if (!record[0]) {
      throw new ServiceNotFoundError(serviceId);
    }

    return transformDbService(record[0]);
  };

  const getServicesByPartnerId = async (partnerId: PartnerId): Promise<ServiceDTO[]> => {
    const records = await db
      .select()
      .from(services)
      .where(
        and(
          eq(services.partnerId, partnerId),
          eq(services.isActive, true)
        )
      )
      .orderBy(desc(services.createdAt), services.name);

    return records.map(transformDbService);
  };

  const deleteService = async (serviceId: ServiceId, user: UserSession): Promise<void> => {
    const existing = await getServiceByPublicId(serviceId);
    
    // Validate partner access
    validatePartnerAccess(user, existing.partnerId, 'delete');

    // Soft delete
    await db
      .update(services)
      .set({
        isActive: false,
        updatedAt: new Date(),
        updatedBy: user.sub as UserId,
      })
      .where(eq(services.publicId, serviceId));

    await recordAuditEvent(
      'delete',
      user,
      serviceId,
      existing.partnerId
    );
  };

  // Return service interface with all implementations
  return {
    createService,
    updateService,
    getServiceByPublicId,
    getServicesByPartnerId,
    deleteService,
  };
}