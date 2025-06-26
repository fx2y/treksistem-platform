import { Hono } from 'hono';
import { createDb, type D1Database } from '@treksistem/db';
import { sql } from 'drizzle-orm';

type Env = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Env }>();
const v1 = app.basePath('/api/v1');

v1.get('/ping', c => {
  return c.json({ pong: true });
});

v1.get('/db-health', async c => {
  const db = createDb(c.env.DB);
  const result = await db.run(
    sql`SELECT name FROM sqlite_master WHERE type='table';`
  );
  return c.json({ success: true, tables: result.results });
});

export default app;
