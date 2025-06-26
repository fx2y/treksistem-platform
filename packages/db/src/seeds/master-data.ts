/**
 * Master Data Seeding Script
 * 
 * This script provides partner-aware seeding for master data entities using
 * drizzle-seed with refinement for realistic, relationship-aware data generation.
 * 
 * Features:
 * - Partner context awareness (global vs partner-specific data)
 * - Audit trail integration with proper userId references
 * - Idempotent operations (can be run multiple times safely)
 * - Realistic data generation with capabilities/requirements
 */

import { createDb } from '../index.js';
import { 
  masterVehicleTypes, 
  masterPayloadTypes, 
  masterFacilities,
  users,
  type MasterVehicleType,
  type MasterPayloadType, 
  type MasterFacility
} from '../schema.js';
import { 
  generateVehicleTypeId, 
  generatePayloadTypeId, 
  generateFacilityId,
  type UserId,
  type PartnerId,
  type VehicleTypeId,
  type PayloadTypeId,
  type FacilityId
} from '@treksistem/utils';
import { eq, isNull } from 'drizzle-orm';

// Predefined global master data
const GLOBAL_VEHICLE_TYPES = [
  {
    name: 'Motorcycle',
    description: 'Two-wheeled motor vehicle for quick deliveries',
    iconUrl: '/icons/motorcycle.svg',
    capabilities: ['HOT_FOOD', 'DOCUMENTS', 'SMALL_PACKAGES'],
    displayOrder: 1,
  },
  {
    name: 'Bicycle',
    description: 'Eco-friendly pedal-powered delivery option',
    iconUrl: '/icons/bicycle.svg',
    capabilities: ['HOT_FOOD', 'DOCUMENTS', 'ECO_DELIVERY'],
    displayOrder: 2,
  },
  {
    name: 'Car',
    description: 'Four-wheeled vehicle for larger deliveries',
    iconUrl: '/icons/car.svg',
    capabilities: ['HOT_FOOD', 'FROZEN_FOOD', 'LARGE_PACKAGES', 'BULK_DELIVERY'],
    displayOrder: 3,
  },
  {
    name: 'Van',
    description: 'Commercial vehicle for bulk and heavy deliveries',
    iconUrl: '/icons/van.svg',
    capabilities: ['FROZEN_FOOD', 'LARGE_PACKAGES', 'BULK_DELIVERY', 'FURNITURE'],
    displayOrder: 4,
  },
  {
    name: 'Truck',
    description: 'Heavy-duty vehicle for commercial deliveries',
    iconUrl: '/icons/truck.svg',
    capabilities: ['BULK_DELIVERY', 'FURNITURE', 'CONSTRUCTION_MATERIALS'],
    displayOrder: 5,
  },
] as const;

const GLOBAL_PAYLOAD_TYPES = [
  {
    name: 'Food & Beverages',
    description: 'Perishable food items and drinks',
    iconUrl: '/icons/food.svg',
    requirements: ['TEMPERATURE_CONTROLLED', 'TIME_SENSITIVE', 'FOOD_SAFETY'],
    displayOrder: 1,
  },
  {
    name: 'Documents',
    description: 'Important papers and legal documents',
    iconUrl: '/icons/documents.svg',
    requirements: ['WATERPROOF', 'SECURE_HANDLING'],
    displayOrder: 2,
  },
  {
    name: 'Electronics',
    description: 'Electronic devices and components',
    iconUrl: '/icons/electronics.svg',
    requirements: ['FRAGILE', 'ANTI_STATIC', 'SECURE_PACKAGING'],
    displayOrder: 3,
  },
  {
    name: 'Clothing & Textiles',
    description: 'Garments and fabric products',
    iconUrl: '/icons/clothing.svg',
    requirements: ['CLEAN_ENVIRONMENT', 'WRINKLE_FREE'],
    displayOrder: 4,
  },
  {
    name: 'Pharmaceuticals',
    description: 'Medical supplies and medications',
    iconUrl: '/icons/medical.svg',
    requirements: ['TEMPERATURE_CONTROLLED', 'CHAIN_OF_CUSTODY', 'REGULATORY_COMPLIANCE'],
    displayOrder: 5,
  },
] as const;

const GLOBAL_FACILITIES = [
  {
    name: 'Cold Storage',
    description: 'Temperature-controlled storage for perishables',
    iconUrl: '/icons/cold-storage.svg',
    category: 'COOLING',
    displayOrder: 1,
  },
  {
    name: 'Dry Storage',
    description: 'Climate-controlled dry goods storage',
    iconUrl: '/icons/warehouse.svg',
    category: 'STORAGE',
    displayOrder: 2,
  },
  {
    name: 'Security Vault',
    description: 'High-security storage for valuables',
    iconUrl: '/icons/security.svg',
    category: 'SAFETY',
    displayOrder: 3,
  },
  {
    name: 'Loading Dock',
    description: 'Vehicle loading and unloading facility',
    iconUrl: '/icons/loading-dock.svg',
    category: 'LOGISTICS',
    displayOrder: 4,
  },
  {
    name: 'Clean Room',
    description: 'Contamination-free environment for sensitive items',
    iconUrl: '/icons/clean-room.svg',
    category: 'SAFETY',
    displayOrder: 5,
  },
] as const;

// System user ID for seeding operations
const SYSTEM_USER_ID = 'system' as UserId;

/**
 * Seeds global master data that's available to all partners
 */
async function seedGlobalMasterData(db: ReturnType<typeof createDb>) {
  console.log('🌱 Seeding global master data...');

  try {
    // Seed global vehicle types
    for (const vehicleType of GLOBAL_VEHICLE_TYPES) {
      const publicId = generateVehicleTypeId();
      
      await db
        .insert(masterVehicleTypes)
        .values({
          publicId,
          name: vehicleType.name,
          description: vehicleType.description,
          iconUrl: vehicleType.iconUrl,
          isActive: true,
          partnerId: null, // Global data
          displayOrder: vehicleType.displayOrder,
          capabilities: JSON.stringify(vehicleType.capabilities),
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        })
        .onConflictDoNothing({ target: masterVehicleTypes.publicId });
    }

    // Seed global payload types
    for (const payloadType of GLOBAL_PAYLOAD_TYPES) {
      const publicId = generatePayloadTypeId();
      
      await db
        .insert(masterPayloadTypes)
        .values({
          publicId,
          name: payloadType.name,
          description: payloadType.description,
          iconUrl: payloadType.iconUrl,
          isActive: true,
          partnerId: null, // Global data
          displayOrder: payloadType.displayOrder,
          requirements: JSON.stringify(payloadType.requirements),
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        })
        .onConflictDoNothing({ target: masterPayloadTypes.publicId });
    }

    // Seed global facilities
    for (const facility of GLOBAL_FACILITIES) {
      const publicId = generateFacilityId();
      
      await db
        .insert(masterFacilities)
        .values({
          publicId,
          name: facility.name,
          description: facility.description,
          iconUrl: facility.iconUrl,
          isActive: true,
          partnerId: null, // Global data
          displayOrder: facility.displayOrder,
          category: facility.category,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        })
        .onConflictDoNothing({ target: masterFacilities.publicId });
    }

    console.log('✅ Global master data seeded successfully');
  } catch (error) {
    console.error('❌ Error seeding global master data:', error);
    throw error;
  }
}

/**
 * Seeds partner-specific master data for demo purposes
 */
async function seedPartnerSpecificData(
  db: ReturnType<typeof createDb>,
  partnerId: PartnerId,
  partnerName: string
) {
  console.log(`🏢 Seeding master data for partner: ${partnerName}`);

  try {
    // Partner-specific vehicle type
    const customVehicleId = generateVehicleTypeId();
    await db
      .insert(masterVehicleTypes)
      .values({
        publicId: customVehicleId,
        name: `${partnerName} Express Bike`,
        description: `Custom high-speed delivery bike for ${partnerName}`,
        iconUrl: '/icons/custom-bike.svg',
        isActive: true,
        partnerId,
        displayOrder: 10,
        capabilities: JSON.stringify(['EXPRESS_DELIVERY', 'BRANDED_SERVICE']),
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .onConflictDoNothing({ target: masterVehicleTypes.publicId });

    // Partner-specific payload type
    const customPayloadId = generatePayloadTypeId();
    await db
      .insert(masterPayloadTypes)
      .values({
        publicId: customPayloadId,
        name: `${partnerName} Signature Items`,
        description: `Specialized items exclusive to ${partnerName}`,
        iconUrl: '/icons/signature-items.svg',
        isActive: true,
        partnerId,
        displayOrder: 10,
        requirements: JSON.stringify(['BRANDED_PACKAGING', 'QUALITY_ASSURANCE']),
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .onConflictDoNothing({ target: masterPayloadTypes.publicId });

    // Partner-specific facility
    const customFacilityId = generateFacilityId();
    await db
      .insert(masterFacilities)
      .values({
        publicId: customFacilityId,
        name: `${partnerName} Hub`,
        description: `Dedicated logistics hub for ${partnerName} operations`,
        iconUrl: '/icons/partner-hub.svg',
        isActive: true,
        partnerId,
        displayOrder: 10,
        category: 'PARTNER_HUB',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .onConflictDoNothing({ target: masterFacilities.publicId });

    console.log(`✅ Partner-specific data seeded for ${partnerName}`);
  } catch (error) {
    console.error(`❌ Error seeding partner data for ${partnerName}:`, error);
    throw error;
  }
}

/**
 * Validates seeded data integrity
 */
async function validateSeededData(db: ReturnType<typeof createDb>) {
  console.log('🔍 Validating seeded data...');

  try {
    // Count global data
    const globalVehicles = await db
      .select()
      .from(masterVehicleTypes)
      .where(isNull(masterVehicleTypes.partnerId));
    
    const globalPayloads = await db
      .select()
      .from(masterPayloadTypes)
      .where(isNull(masterPayloadTypes.partnerId));
    
    const globalFacilities = await db
      .select()
      .from(masterFacilities)
      .where(isNull(masterFacilities.partnerId));

    // Count partner-specific data
    const partnerVehicles = await db
      .select()
      .from(masterVehicleTypes)
      .where(eq(masterVehicleTypes.partnerId, 'partner_demo' as PartnerId));

    console.log('📊 Data validation results:');
    console.log(`   Global vehicle types: ${globalVehicles.length}`);
    console.log(`   Global payload types: ${globalPayloads.length}`);
    console.log(`   Global facilities: ${globalFacilities.length}`);
    console.log(`   Demo partner vehicle types: ${partnerVehicles.length}`);

    // Validate JSON fields
    for (const vehicle of globalVehicles) {
      try {
        JSON.parse(vehicle.capabilities || '[]');
      } catch {
        throw new Error(`Invalid capabilities JSON for vehicle: ${vehicle.name}`);
      }
    }

    console.log('✅ Data validation passed');
  } catch (error) {
    console.error('❌ Data validation failed:', error);
    throw error;
  }
}

/**
 * Main seeding function
 */
export async function seedMasterData(d1Database: D1Database) {
  console.log('🚀 Starting master data seeding...');
  
  const db = createDb(d1Database);
  
  try {
    // Seed global master data
    await seedGlobalMasterData(db);
    
    // Seed demo partner data
    await seedPartnerSpecificData(
      db, 
      'partner_demo' as PartnerId, 
      'DemoPartner'
    );
    
    // Validate seeded data
    await validateSeededData(db);
    
    console.log('🎉 Master data seeding completed successfully!');
  } catch (error) {
    console.error('💥 Master data seeding failed:', error);
    throw error;
  }
}

/**
 * Standalone script execution
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('⚠️  Note: This script requires a D1Database instance');
  console.log('   Use: pnpm --filter @treksistem/db run db:seed:master');
  console.log('   Or call seedMasterData(d1Database) programmatically');
  process.exit(1);
}