import { z } from 'zod';

// Pricing scheme type enumeration
export const PricingSchemeTypeSchema = z.enum(['DISTANCE', 'PER_ITEM', 'ZONAL']);
export type PricingSchemeType = z.infer<typeof PricingSchemeTypeSchema>;

// Distance-based pricing parameters
export const DistancePricingParamsSchema = z.object({
  type: z.literal('DISTANCE'),
  base_fee: z.number().int().positive().describe('The flat fee for any delivery, in the smallest currency unit (e.g., cents, rupiah).'),
  per_km_fee: z.number().int().positive().describe('The fee per kilometer, in the smallest currency unit.'),
  min_fee: z.number().int().positive().optional().describe('An optional minimum total fee for any delivery.')
});

// Per-item pricing parameters
export const PerItemPricingParamsSchema = z.object({
  type: z.literal('PER_ITEM'),
  per_piece_fee: z.number().int().positive().describe('The fee per item/piece/head, in the smallest currency unit.'),
  rounding_up_to: z.number().int().positive().optional().describe('Optional: round the total number of items up to the nearest multiple of this value before calculating the fee.')
});

// Zonal pricing parameters
export const ZonalPricingParamsSchema = z.object({
  type: z.literal('ZONAL'),
  zones: z.array(z.object({
    name: z.string().min(1),
    polygon: z.string().min(1).describe('A string representation of the zone polygon, e.g., WKT or GeoJSON.'),
    fee: z.number().int().positive()
  })),
  default_fee: z.number().int().positive().describe('The fee for deliveries outside of any defined zone.')
});

// Discriminated union for type-safe pricing parameters
export const PricingSchemeParamsSchema = z.discriminatedUnion('type', [
  DistancePricingParamsSchema,
  PerItemPricingParamsSchema,
  ZonalPricingParamsSchema
]);

export type PricingSchemeParams = z.infer<typeof PricingSchemeParamsSchema>;

// Create or update pricing scheme request schema
export const CreateOrUpdatePricingSchemeDTOSchema = z.object({
  type: PricingSchemeTypeSchema,
  params: PricingSchemeParamsSchema,
  is_active: z.boolean().default(true)
}).refine(data => data.type === data.params.type, {
  message: "The 'type' field must match the type of the 'params' object.",
  path: ['params']
});

export type CreateOrUpdatePricingSchemeDTO = z.infer<typeof CreateOrUpdatePricingSchemeDTOSchema>;

// Pricing scheme DTO for API responses  
export interface PricingSchemeDTO {
  pricingSchemeId: string; // PricingSchemeId (branded type)
  serviceId: string; // ServiceId (branded type)
  type: PricingSchemeType;
  params: PricingSchemeParams;
  isActive: boolean;
  createdAt: string; // ISO8601Timestamp
  updatedAt: string; // ISO8601Timestamp
  createdBy: string; // UserId
  updatedBy: string; // UserId
}

// Validation schemas for API parameters - simplified without branded type refinement
export const ServiceIdParamSchema = z.object({
  serviceId: z.string().min(1, 'Service ID is required')
});

export const PricingSchemeIdParamSchema = z.object({
  pricingSchemeId: z.string().min(1, 'Pricing scheme ID is required')
});

// Export parameter schema types
export type ServiceIdParamType = z.infer<typeof ServiceIdParamSchema>;
export type PricingSchemeIdParamType = z.infer<typeof PricingSchemeIdParamSchema>;

// Type guards for pricing scheme types
export function isPricingSchemeType(value: string): value is PricingSchemeType {
  return ['DISTANCE', 'PER_ITEM', 'ZONAL'].includes(value as PricingSchemeType);
}

// Utility function to validate pricing scheme params
export function validatePricingSchemeParams(
  type: PricingSchemeType, 
  params: unknown
): params is PricingSchemeParams {
  try {
    PricingSchemeParamsSchema.parse({ type, ...(params as Record<string, unknown>) });
    return true;
  } catch {
    return false;
  }
}

// Error types for pricing scheme operations
export interface PricingSchemeError {
  code: 'PRICING_SCHEME_NOT_FOUND' | 'PRICING_SCHEME_EXISTS' | 'VALIDATION_ERROR' | 'SERVICE_NOT_FOUND';
  message: string;
  details?: Record<string, unknown>;
}

// Pricing calculation request types (for future implementation)
export interface PricingCalculationRequest {
  serviceId: string; // ServiceId
  distanceKm?: number; // For DISTANCE pricing
  itemCount?: number; // For PER_ITEM pricing
  pickupZone?: string; // For ZONAL pricing
  deliveryZone?: string; // For ZONAL pricing
}

export interface PricingCalculationResult {
  totalFee: number; // In smallest currency unit
  breakdown: {
    baseFee?: number;
    distanceFee?: number;
    itemFee?: number;
    zonalFee?: number;
    minimumFee?: number;
  };
  currency: string;
  estimatedAt: string; // ISO8601Timestamp
}