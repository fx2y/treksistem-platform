/**
 * Master Data Service
 * 
 * Implements business logic for partner-scoped master data management with
 * comprehensive security, audit trails, and error handling.
 * 
 * Features:
 * - Partner data isolation with global fallback
 * - RBAC integration with context validation
 * - Comprehensive audit logging
 * - Type-safe operations with branded identifiers
 * - Performance-optimized queries with proper indexing
 */

import { createDb, type D1Database } from '@treksistem/db';
import {
  masterVehicleTypes,
  masterPayloadTypes,
  masterFacilities,
  type MasterVehicleType,
  type MasterPayloadType,
  type MasterFacility,
  type NewMasterVehicleType,
  type NewMasterPayloadType,
  type NewMasterFacility,
} from '@treksistem/db';
import {
  generateVehicleTypeId,
  generatePayloadTypeId,
  generateFacilityId,
  type VehicleTypeId,
  type PayloadTypeId,
  type FacilityId,
  type PartnerId,
  type UserId,
} from '@treksistem/utils';
import {
  type VehicleType,
  type PayloadType,
  type Facility,
  type MasterDataResponse,
  type CreateVehicleTypeRequest,
  type UpdateVehicleTypeRequest,
  type CreatePayloadTypeRequest,
  type UpdatePayloadTypeRequest,
  type CreateFacilityRequest,
  type UpdateFacilityRequest,
  type UserSession,
} from '@treksistem/types';
import { and, eq, or, isNull, sql, desc } from 'drizzle-orm';
import type { MonitoringService } from './monitoring.service';

// Service error types for consistent error handling
export class MasterDataError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'MasterDataError';
  }
}

export class PermissionError extends MasterDataError {
  constructor(message: string = 'Insufficient permissions for this operation') {
    super(message, 'insufficient_permissions', 403);
  }
}

export class NotFoundError extends MasterDataError {
  constructor(resource: string, id: string) {
    super(`${resource} with ID '${id}' not found`, 'resource_not_found', 404);
  }
}

export class PartnerContextError extends MasterDataError {
  constructor(message: string = 'Partner context validation failed') {
    super(message, 'partner_context_error', 403);
  }
}

/**
 * Master data service interface
 */
export interface MasterDataService {
  // Vehicle Types
  getVehicleTypes(partnerId?: PartnerId): Promise<VehicleType[]>;
  getVehicleTypeById(id: VehicleTypeId, partnerId?: PartnerId): Promise<VehicleType>;
  createVehicleType(data: CreateVehicleTypeRequest, user: UserSession): Promise<VehicleType>;
  updateVehicleType(id: VehicleTypeId, data: UpdateVehicleTypeRequest, user: UserSession): Promise<VehicleType>;
  deleteVehicleType(id: VehicleTypeId, user: UserSession): Promise<void>;

  // Payload Types
  getPayloadTypes(partnerId?: PartnerId): Promise<PayloadType[]>;
  getPayloadTypeById(id: PayloadTypeId, partnerId?: PartnerId): Promise<PayloadType>;
  createPayloadType(data: CreatePayloadTypeRequest, user: UserSession): Promise<PayloadType>;
  updatePayloadType(id: PayloadTypeId, data: UpdatePayloadTypeRequest, user: UserSession): Promise<PayloadType>;
  deletePayloadType(id: PayloadTypeId, user: UserSession): Promise<void>;

  // Facilities
  getFacilities(partnerId?: PartnerId): Promise<Facility[]>;
  getFacilityById(id: FacilityId, partnerId?: PartnerId): Promise<Facility>;
  createFacility(data: CreateFacilityRequest, user: UserSession): Promise<Facility>;
  updateFacility(id: FacilityId, data: UpdateFacilityRequest, user: UserSession): Promise<Facility>;
  deleteFacility(id: FacilityId, user: UserSession): Promise<void>;

  // Combined operations
  getAllMasterData(partnerId?: PartnerId): Promise<MasterDataResponse>;
}

/**
 * Creates a master data service instance
 */
export function createMasterDataService(
  d1Database: D1Database,
  monitoring: MonitoringService
): MasterDataService {
  const db = createDb(d1Database);

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
    targetPartnerId: PartnerId | null,
    operation: string
  ): void => {
    const isMaster = isMasterAdmin(user);
    const userPartnerId = getUserPartnerContext(user);

    // Master admins can access everything
    if (isMaster) return;

    // For non-master admins, ensure they only access their own partner data or global data
    if (targetPartnerId && targetPartnerId !== userPartnerId) {
      throw new PartnerContextError(
        `Cannot ${operation} data for partner '${targetPartnerId}'. Access denied.`
      );
    }
  };

  // Helper function to record audit events
  const recordAuditEvent = async (
    operation: string,
    user: UserSession,
    table: string,
    recordId: string,
    partnerId?: PartnerId | null,
    changes?: Record<string, any>
  ) => {
    await monitoring.recordSecurityEvent({
      type: 'auth_success',
      userId: user.sub,
      email: user.email,
      details: {
        action: `master_data_${operation}`,
        table,
        recordId,
        partnerId: partnerId || 'global',
        changes: changes ? JSON.stringify(changes) : undefined,
        operation,
      },
      timestamp: Date.now(),
      severity: 'info',
    });
  };

  // Database transformation helpers
  const transformDbVehicleType = (dbRecord: MasterVehicleType): VehicleType => ({
    id: dbRecord.publicId as VehicleTypeId,
    publicId: dbRecord.publicId,
    name: dbRecord.name,
    description: dbRecord.description || undefined,
    iconUrl: dbRecord.iconUrl,
    isActive: dbRecord.isActive,
    partnerId: dbRecord.partnerId as PartnerId || undefined,
    displayOrder: dbRecord.displayOrder,
    capabilities: dbRecord.capabilities ? JSON.parse(dbRecord.capabilities) : [],
    createdAt: new Date(dbRecord.createdAt),
    updatedAt: new Date(dbRecord.updatedAt),
    createdBy: dbRecord.createdBy as UserId,
    updatedBy: dbRecord.updatedBy as UserId,
  });

  const transformDbPayloadType = (dbRecord: MasterPayloadType): PayloadType => ({
    id: dbRecord.publicId as PayloadTypeId,
    publicId: dbRecord.publicId,
    name: dbRecord.name,
    description: dbRecord.description || undefined,
    iconUrl: dbRecord.iconUrl,
    isActive: dbRecord.isActive,
    partnerId: dbRecord.partnerId as PartnerId || undefined,
    displayOrder: dbRecord.displayOrder,
    requirements: dbRecord.requirements ? JSON.parse(dbRecord.requirements) : [],
    createdAt: new Date(dbRecord.createdAt),
    updatedAt: new Date(dbRecord.updatedAt),
    createdBy: dbRecord.createdBy as UserId,
    updatedBy: dbRecord.updatedBy as UserId,
  });

  const transformDbFacility = (dbRecord: MasterFacility): Facility => ({
    id: dbRecord.publicId as FacilityId,
    publicId: dbRecord.publicId,
    name: dbRecord.name,
    description: dbRecord.description || undefined,
    iconUrl: dbRecord.iconUrl,
    isActive: dbRecord.isActive,
    partnerId: dbRecord.partnerId as PartnerId || undefined,
    displayOrder: dbRecord.displayOrder,
    category: dbRecord.category,
    createdAt: new Date(dbRecord.createdAt),
    updatedAt: new Date(dbRecord.updatedAt),
    createdBy: dbRecord.createdBy as UserId,
    updatedBy: dbRecord.updatedBy as UserId,
  });

  // Vehicle Types implementation
  const getVehicleTypes = async (partnerId?: PartnerId): Promise<VehicleType[]> => {
    const records = await db
      .select()
      .from(masterVehicleTypes)
      .where(
        and(
          eq(masterVehicleTypes.isActive, true),
          or(
            isNull(masterVehicleTypes.partnerId), // Global data
            partnerId ? eq(masterVehicleTypes.partnerId, partnerId) : sql`0=1`
          )
        )
      )
      .orderBy(masterVehicleTypes.displayOrder, masterVehicleTypes.name);

    return records.map(transformDbVehicleType);
  };

  const getVehicleTypeById = async (
    id: VehicleTypeId,
    partnerId?: PartnerId
  ): Promise<VehicleType> => {
    const record = await db
      .select()
      .from(masterVehicleTypes)
      .where(
        and(
          eq(masterVehicleTypes.publicId, id),
          eq(masterVehicleTypes.isActive, true),
          or(
            isNull(masterVehicleTypes.partnerId),
            partnerId ? eq(masterVehicleTypes.partnerId, partnerId) : sql`0=1`
          )
        )
      )
      .limit(1);

    if (!record[0]) {
      throw new NotFoundError('Vehicle type', id);
    }

    return transformDbVehicleType(record[0]);
  };

  const createVehicleType = async (
    data: CreateVehicleTypeRequest,
    user: UserSession
  ): Promise<VehicleType> => {
    const userPartnerId = getUserPartnerContext(user);
    const publicId = generateVehicleTypeId();

    // Partner admins can only create data for their own partner
    if (!isMasterAdmin(user) && !userPartnerId) {
      throw new PermissionError('Partner context required for creating vehicle types');
    }

    const now = new Date();
    const newRecord: NewMasterVehicleType = {
      publicId,
      name: data.name,
      description: data.description,
      iconUrl: data.iconUrl,
      isActive: true,
      partnerId: isMasterAdmin(user) ? null : userPartnerId,
      displayOrder: data.displayOrder || 0,
      capabilities: JSON.stringify(data.capabilities || []),
      createdAt: now,
      updatedAt: now,
      createdBy: user.sub as UserId,
      updatedBy: user.sub as UserId,
    };

    await db.insert(masterVehicleTypes).values(newRecord);

    await recordAuditEvent(
      'create',
      user,
      'master_vehicle_types',
      publicId,
      newRecord.partnerId,
      { name: data.name, capabilities: data.capabilities }
    );

    return await getVehicleTypeById(publicId);
  };

  const updateVehicleType = async (
    id: VehicleTypeId,
    data: UpdateVehicleTypeRequest,
    user: UserSession
  ): Promise<VehicleType> => {
    // First, get the existing record to validate ownership
    const existing = await getVehicleTypeById(id);
    
    // Validate partner access
    validatePartnerAccess(user, existing.partnerId || null, 'update');

    const updateData: Partial<MasterVehicleType> = {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.iconUrl && { iconUrl: data.iconUrl }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
      ...(data.capabilities && { capabilities: JSON.stringify(data.capabilities) }),
      updatedAt: new Date(),
      updatedBy: user.sub as UserId,
    };

    await db
      .update(masterVehicleTypes)
      .set(updateData)
      .where(eq(masterVehicleTypes.publicId, id));

    await recordAuditEvent(
      'update',
      user,
      'master_vehicle_types',
      id,
      existing.partnerId || null,
      data
    );

    return await getVehicleTypeById(id);
  };

  const deleteVehicleType = async (id: VehicleTypeId, user: UserSession): Promise<void> => {
    const existing = await getVehicleTypeById(id);
    
    // Validate partner access
    validatePartnerAccess(user, existing.partnerId || null, 'delete');

    // Soft delete
    await db
      .update(masterVehicleTypes)
      .set({
        isActive: false,
        updatedAt: new Date(),
        updatedBy: user.sub as UserId,
      })
      .where(eq(masterVehicleTypes.publicId, id));

    await recordAuditEvent(
      'delete',
      user,
      'master_vehicle_types',
      id,
      existing.partnerId || null
    );
  };

  // Payload Types operations
  const getPayloadTypes = async (partnerId?: PartnerId): Promise<PayloadType[]> => {
    const records = await db
      .select()
      .from(masterPayloadTypes)
      .where(
        and(
          eq(masterPayloadTypes.isActive, true),
          or(
            isNull(masterPayloadTypes.partnerId),
            partnerId ? eq(masterPayloadTypes.partnerId, partnerId) : sql`0=1`
          )
        )
      )
      .orderBy(masterPayloadTypes.displayOrder, masterPayloadTypes.name);

    return records.map(transformDbPayloadType);
  };

  // Payload Types CRUD operations
  const getPayloadTypeById = async (
    id: PayloadTypeId,
    partnerId?: PartnerId
  ): Promise<PayloadType> => {
    const record = await db
      .select()
      .from(masterPayloadTypes)
      .where(
        and(
          eq(masterPayloadTypes.publicId, id),
          eq(masterPayloadTypes.isActive, true),
          or(
            isNull(masterPayloadTypes.partnerId),
            partnerId ? eq(masterPayloadTypes.partnerId, partnerId) : sql`0=1`
          )
        )
      )
      .limit(1);

    if (!record[0]) {
      throw new NotFoundError('Payload type', id);
    }

    return transformDbPayloadType(record[0]);
  };

  const createPayloadType = async (
    data: CreatePayloadTypeRequest,
    user: UserSession
  ): Promise<PayloadType> => {
    const userPartnerId = getUserPartnerContext(user);
    const publicId = generatePayloadTypeId();

    // Partner admins can only create data for their own partner
    if (!isMasterAdmin(user) && !userPartnerId) {
      throw new PermissionError('Partner context required for creating payload types');
    }

    const now = new Date();
    const newRecord: NewMasterPayloadType = {
      publicId,
      name: data.name,
      description: data.description,
      iconUrl: data.iconUrl,
      isActive: true,
      partnerId: isMasterAdmin(user) ? null : userPartnerId,
      displayOrder: data.displayOrder || 0,
      requirements: JSON.stringify(data.requirements || []),
      createdAt: now,
      updatedAt: now,
      createdBy: user.sub as UserId,
      updatedBy: user.sub as UserId,
    };

    await db.insert(masterPayloadTypes).values(newRecord);

    await recordAuditEvent(
      'create',
      user,
      'master_payload_types',
      publicId,
      newRecord.partnerId,
      { name: data.name, requirements: data.requirements }
    );

    return await getPayloadTypeById(publicId);
  };

  const updatePayloadType = async (
    id: PayloadTypeId,
    data: UpdatePayloadTypeRequest,
    user: UserSession
  ): Promise<PayloadType> => {
    // First, get the existing record to validate ownership
    const existing = await getPayloadTypeById(id);
    
    // Validate partner access
    validatePartnerAccess(user, existing.partnerId || null, 'update');

    const updateData: Partial<MasterPayloadType> = {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.iconUrl && { iconUrl: data.iconUrl }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
      ...(data.requirements && { requirements: JSON.stringify(data.requirements) }),
      updatedAt: new Date(),
      updatedBy: user.sub as UserId,
    };

    await db
      .update(masterPayloadTypes)
      .set(updateData)
      .where(eq(masterPayloadTypes.publicId, id));

    await recordAuditEvent(
      'update',
      user,
      'master_payload_types',
      id,
      existing.partnerId || null,
      data
    );

    return await getPayloadTypeById(id);
  };

  const deletePayloadType = async (id: PayloadTypeId, user: UserSession): Promise<void> => {
    const existing = await getPayloadTypeById(id);
    
    // Validate partner access
    validatePartnerAccess(user, existing.partnerId || null, 'delete');

    // Soft delete
    await db
      .update(masterPayloadTypes)
      .set({
        isActive: false,
        updatedAt: new Date(),
        updatedBy: user.sub as UserId,
      })
      .where(eq(masterPayloadTypes.publicId, id));

    await recordAuditEvent(
      'delete',
      user,
      'master_payload_types',
      id,
      existing.partnerId || null
    );
  };

  // Facilities operations  
  const getFacilities = async (partnerId?: PartnerId): Promise<Facility[]> => {
    const records = await db
      .select()
      .from(masterFacilities)
      .where(
        and(
          eq(masterFacilities.isActive, true),
          or(
            isNull(masterFacilities.partnerId),
            partnerId ? eq(masterFacilities.partnerId, partnerId) : sql`0=1`
          )
        )
      )
      .orderBy(masterFacilities.displayOrder, masterFacilities.name);

    return records.map(transformDbFacility);
  };

  // Facilities CRUD operations
  const getFacilityById = async (
    id: FacilityId,
    partnerId?: PartnerId
  ): Promise<Facility> => {
    const record = await db
      .select()
      .from(masterFacilities)
      .where(
        and(
          eq(masterFacilities.publicId, id),
          eq(masterFacilities.isActive, true),
          or(
            isNull(masterFacilities.partnerId),
            partnerId ? eq(masterFacilities.partnerId, partnerId) : sql`0=1`
          )
        )
      )
      .limit(1);

    if (!record[0]) {
      throw new NotFoundError('Facility', id);
    }

    return transformDbFacility(record[0]);
  };

  const createFacility = async (
    data: CreateFacilityRequest,
    user: UserSession
  ): Promise<Facility> => {
    const userPartnerId = getUserPartnerContext(user);
    const publicId = generateFacilityId();

    // Partner admins can only create data for their own partner
    if (!isMasterAdmin(user) && !userPartnerId) {
      throw new PermissionError('Partner context required for creating facilities');
    }

    const now = new Date();
    const newRecord: NewMasterFacility = {
      publicId,
      name: data.name,
      description: data.description,
      iconUrl: data.iconUrl,
      isActive: true,
      partnerId: isMasterAdmin(user) ? null : userPartnerId,
      displayOrder: data.displayOrder || 0,
      category: data.category,
      createdAt: now,
      updatedAt: now,
      createdBy: user.sub as UserId,
      updatedBy: user.sub as UserId,
    };

    await db.insert(masterFacilities).values(newRecord);

    await recordAuditEvent(
      'create',
      user,
      'master_facilities',
      publicId,
      newRecord.partnerId,
      { name: data.name, category: data.category }
    );

    return await getFacilityById(publicId);
  };

  const updateFacility = async (
    id: FacilityId,
    data: UpdateFacilityRequest,
    user: UserSession
  ): Promise<Facility> => {
    // First, get the existing record to validate ownership
    const existing = await getFacilityById(id);
    
    // Validate partner access
    validatePartnerAccess(user, existing.partnerId || null, 'update');

    const updateData: Partial<MasterFacility> = {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.iconUrl && { iconUrl: data.iconUrl }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
      ...(data.category && { category: data.category }),
      updatedAt: new Date(),
      updatedBy: user.sub as UserId,
    };

    await db
      .update(masterFacilities)
      .set(updateData)
      .where(eq(masterFacilities.publicId, id));

    await recordAuditEvent(
      'update',
      user,
      'master_facilities',
      id,
      existing.partnerId || null,
      data
    );

    return await getFacilityById(id);
  };

  const deleteFacility = async (id: FacilityId, user: UserSession): Promise<void> => {
    const existing = await getFacilityById(id);
    
    // Validate partner access
    validatePartnerAccess(user, existing.partnerId || null, 'delete');

    // Soft delete
    await db
      .update(masterFacilities)
      .set({
        isActive: false,
        updatedAt: new Date(),
        updatedBy: user.sub as UserId,
      })
      .where(eq(masterFacilities.publicId, id));

    await recordAuditEvent(
      'delete',
      user,
      'master_facilities',
      id,
      existing.partnerId || null
    );
  };

  const getAllMasterData = async (partnerId?: PartnerId): Promise<MasterDataResponse> => {
    const [vehicleTypes, payloadTypes, facilities] = await Promise.all([
      getVehicleTypes(partnerId),
      getPayloadTypes(partnerId),
      getFacilities(partnerId),
    ]);

    return {
      vehicleTypes,
      payloadTypes,
      facilities,
      partnerId,
      globalDataIncluded: true,
    };
  };

  // Return service interface with all implementations
  return {
    getVehicleTypes,
    getVehicleTypeById,
    createVehicleType,
    updateVehicleType,
    deleteVehicleType,
    getPayloadTypes,
    getPayloadTypeById,
    createPayloadType,
    updatePayloadType,
    deletePayloadType,
    getFacilities,
    getFacilityById,
    createFacility,
    updateFacility,
    deleteFacility,
    getAllMasterData,
  };
}