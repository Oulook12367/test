// functions/[[path]].js
import { Hono } from 'hono';
const app = new Hono();

app.get('/test-hono', (c) => {
  return c.json({ ok: true, message: 'Hono with specific Node.js version is working!' });
});

export const onRequest = app.fetch;
