import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema.js';

export const createDb = (d1: D1Database) => drizzle(d1, { schema });

// Re-export everything from schema
export * from './schema.js';
export { schema };
export type { D1Database };

// Export seeding functions
export { seedMasterData } from './seeds/master-data.js';
