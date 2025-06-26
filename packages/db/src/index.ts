import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';

export const createDb = (d1: D1Database) => drizzle(d1, { schema });

export { schema };
export type { D1Database };
