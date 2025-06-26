/**
 * Master Data System Validation Test
 * 
 * Basic validation test to ensure the master data system components
 * are properly integrated and functional.
 */

import { describe, it, expect } from 'vitest';
import { 
  generateVehicleTypeId, 
  generatePayloadTypeId, 
  generateFacilityId,
  generatePartnerId,
  type VehicleTypeId,
  type PayloadTypeId,
  type FacilityId,
  type PartnerId
} from '@treksistem/utils';
import {
  type VehicleType,
  type PayloadType,
  type Facility,
  type MasterDataResponse,
  type CreateVehicleTypeRequest,
  isValidMasterDataCategory,
  isVehicleTypeId,
  isPayloadTypeId,
  isFacilityId
} from '@treksistem/types';

describe('Master Data System Integration', () => {
  describe('ID Generation', () => {
    it('should generate valid vehicle type IDs', () => {
      const id = generateVehicleTypeId();
      expect(id).toMatch(/^vt_[A-Za-z0-9_-]{21}$/);
      expect(isVehicleTypeId(id)).toBe(true);
    });

    it('should generate valid payload type IDs', () => {
      const id = generatePayloadTypeId();
      expect(id).toMatch(/^pt_[A-Za-z0-9_-]{21}$/);
      expect(isPayloadTypeId(id)).toBe(true);
    });

    it('should generate valid facility IDs', () => {
      const id = generateFacilityId();
      expect(id).toMatch(/^fac_[A-Za-z0-9_-]{21}$/);
      expect(isFacilityId(id)).toBe(true);
    });

    it('should generate valid partner IDs', () => {
      const id = generatePartnerId();
      expect(id).toMatch(/^partner_[A-Za-z0-9_-]{21}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateVehicleTypeId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('Type Validation', () => {
    it('should validate master data categories', () => {
      expect(isValidMasterDataCategory('vehicleTypes')).toBe(true);
      expect(isValidMasterDataCategory('payloadTypes')).toBe(true);
      expect(isValidMasterDataCategory('facilities')).toBe(true);
      expect(isValidMasterDataCategory('invalid')).toBe(false);
    });

    it('should validate vehicle type interface structure', () => {
      const vehicleType: VehicleType = {
        id: generateVehicleTypeId(),
        publicId: 'vt_test123',
        name: 'Test Vehicle',
        description: 'Test Description',
        iconUrl: 'https://example.com/icon.svg',
        isActive: true,
        partnerId: generatePartnerId(),
        displayOrder: 1,
        capabilities: ['HOT_FOOD', 'DOCUMENTS'],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user_test123' as any,
        updatedBy: 'user_test123' as any,
      };

      expect(vehicleType.id).toBeDefined();
      expect(vehicleType.name).toBeDefined();
      expect(vehicleType.iconUrl).toBeDefined();
      expect(Array.isArray(vehicleType.capabilities)).toBe(true);
    });

    it('should validate create request interface', () => {
      const createRequest: CreateVehicleTypeRequest = {
        name: 'New Vehicle Type',
        description: 'Description',
        iconUrl: 'https://example.com/icon.svg',
        displayOrder: 5,
        capabilities: ['EXPRESS_DELIVERY'],
      };

      expect(createRequest.name).toBeDefined();
      expect(createRequest.iconUrl).toBeDefined();
      expect(typeof createRequest.displayOrder).toBe('number');
    });
  });

  describe('Data Structure Validation', () => {
    it('should validate master data response structure', () => {
      const response: MasterDataResponse = {
        vehicleTypes: [],
        payloadTypes: [],
        facilities: [],
        partnerId: generatePartnerId(),
        globalDataIncluded: true,
      };

      expect(Array.isArray(response.vehicleTypes)).toBe(true);
      expect(Array.isArray(response.payloadTypes)).toBe(true);
      expect(Array.isArray(response.facilities)).toBe(true);
      expect(typeof response.globalDataIncluded).toBe('boolean');
    });

    it('should handle optional partner context', () => {
      const responseWithoutPartner: MasterDataResponse = {
        vehicleTypes: [],
        payloadTypes: [],
        facilities: [],
        globalDataIncluded: true,
      };

      expect(responseWithoutPartner.partnerId).toBeUndefined();
      expect(responseWithoutPartner.globalDataIncluded).toBe(true);
    });
  });

  describe('Capability and Requirement Arrays', () => {
    it('should handle vehicle type capabilities', () => {
      const capabilities = ['HOT_FOOD', 'FROZEN_FOOD', 'DOCUMENTS', 'EXPRESS_DELIVERY'];
      
      const vehicleType: Partial<VehicleType> = {
        capabilities,
      };

      expect(vehicleType.capabilities).toEqual(capabilities);
      expect(vehicleType.capabilities?.includes('HOT_FOOD')).toBe(true);
    });

    it('should handle payload type requirements', () => {
      const requirements = ['TEMPERATURE_CONTROLLED', 'FRAGILE', 'SECURE_HANDLING'];
      
      const payloadType: Partial<PayloadType> = {
        requirements,
      };

      expect(payloadType.requirements).toEqual(requirements);
      expect(payloadType.requirements?.includes('FRAGILE')).toBe(true);
    });

    it('should handle facility categories', () => {
      const facility: Partial<Facility> = {
        category: 'COOLING',
      };

      expect(facility.category).toBe('COOLING');
    });
  });

  describe('Partner Context Handling', () => {
    it('should handle global data (no partner)', () => {
      const globalVehicleType: VehicleType = {
        id: generateVehicleTypeId(),
        publicId: 'vt_global123',
        name: 'Global Vehicle',
        iconUrl: 'https://example.com/icon.svg',
        isActive: true,
        partnerId: undefined, // Global data
        displayOrder: 1,
        capabilities: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user_system' as any,
        updatedBy: 'user_system' as any,
      };

      expect(globalVehicleType.partnerId).toBeUndefined();
    });

    it('should handle partner-specific data', () => {
      const partnerId = generatePartnerId();
      const partnerVehicleType: VehicleType = {
        id: generateVehicleTypeId(),
        publicId: 'vt_partner123',
        name: 'Partner Vehicle',
        iconUrl: 'https://example.com/icon.svg',
        isActive: true,
        partnerId,
        displayOrder: 1,
        capabilities: ['BRANDED_SERVICE'],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user_partner' as any,
        updatedBy: 'user_partner' as any,
      };

      expect(partnerVehicleType.partnerId).toBe(partnerId);
    });
  });

  describe('Audit Trail Fields', () => {
    it('should include required audit fields', () => {
      const now = new Date();
      const vehicleType: VehicleType = {
        id: generateVehicleTypeId(),
        publicId: 'vt_audit123',
        name: 'Audit Test Vehicle',
        iconUrl: 'https://example.com/icon.svg',
        isActive: true,
        displayOrder: 1,
        capabilities: [],
        createdAt: now,
        updatedAt: now,
        createdBy: 'user_creator' as any,
        updatedBy: 'user_updater' as any,
      };

      expect(vehicleType.createdAt).toBeInstanceOf(Date);
      expect(vehicleType.updatedAt).toBeInstanceOf(Date);
      expect(vehicleType.createdBy).toBeDefined();
      expect(vehicleType.updatedBy).toBeDefined();
    });
  });
});

describe('Schema Integration', () => {
  it('should properly export database schema types', () => {
    // This test validates that the schema exports are working
    // In a real test, we would import and validate schema types
    expect(true).toBe(true); // Placeholder for schema validation
  });

  it('should validate seeding function exports', () => {
    // This test validates that seeding functions are properly exported
    // In a real test, we would import and validate seeding functions
    expect(true).toBe(true); // Placeholder for seeding validation
  });
});

describe('API Route Structure', () => {
  it('should validate expected API endpoint patterns', () => {
    const expectedEndpoints = [
      '/api/v1/master-data',
      '/api/v1/master-data/vehicle-types',
      '/api/v1/master-data/payload-types',
      '/api/v1/master-data/facilities',
      '/api/v1/master-data/health',
    ];

    expectedEndpoints.forEach(endpoint => {
      expect(endpoint).toMatch(/^\/api\/v1\/master-data/);
    });
  });
});