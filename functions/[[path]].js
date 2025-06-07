// functions/[[path]].js
import { Hono } from 'hono';
const app = new Hono();

app.get('/test', (c) => {
  return c.json({ ok: true, message: 'Hono is working!' });
});

export const onRequest = app.fetch;
