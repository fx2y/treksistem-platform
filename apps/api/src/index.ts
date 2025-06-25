import { Hono } from 'hono';

const app = new Hono().basePath('/api/v1');

app.get('/ping', c => {
  return c.json({ pong: true });
});

export default app;
