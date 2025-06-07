// functions/[[path]].js

import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';

// 关键改动: 移除了 .basePath('/api')
const app = new Hono();

// --- 认证中间件 (无改动) ---
const authMiddleware = (role) => {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: '认证失败：缺少 Token' }, 401);
    }
    const token = authHeader.substring(7);
    try {
      const decodedPayload = await verify(token, c.env.JWT_SECRET);
      if (!decodedPayload) { throw new Error("无效的 payload"); }
      if (role && !decodedPayload.roles?.includes(role)) {
        return c.json({ error: '权限不足' }, 403);
      }
      c.set('jwtPayload', decodedPayload);
      await next();
    } catch (e) {
      return c.json({ error: '认证失败：无效或已过期的 Token' }, 401);
    }
  };
};

// --- 辅助函数 (无改动) ---
const hashPassword = async (password) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const getSiteData = async (c) => {
    let data = await c.env.NAVI_DATA.get('data', { type: 'json' });
    if (!data) {
        const adminPasswordHash = await hashPassword('admin123');
        return {
            users: {'admin': {username: 'admin', passwordHash: adminPasswordHash, roles: ['admin'], permissions: { canSetNoExpiry: true }}},
            categories: [],
            bookmarks: []
        };
    }
    return data;
};

const saveSiteData = async (c, data) => { /* ...代码不变... */ };

// --- API 路由 (无改动, 路径已经是 /login, /data 等) ---
app.post('/login', async (c) => {
    const { username, password, noExpiry } = await c.req.json();
    const data = await getSiteData(c);
    const user = data.users[username];
    if (!user) return c.json({ error: '用户名或密码错误' }, 401);
    const passwordHash = await hashPassword(password);
    if (user.passwordHash !== passwordHash) {
        return c.json({ error: '用户名或密码错误' }, 401);
    }
    const payload = { sub: user.username, roles: user.roles, ...(noExpiry && user.permissions?.canSetNoExpiry ? {} : { exp: Math.floor(Date.now() / 1000) + 15 * 60 }) };
    const token = await sign(payload, c.env.JWT_SECRET);
    return c.json({ token, user: { username: user.username, roles: user.roles, permissions: user.permissions } });
});

app.get('/data', authMiddleware(), async (c) => {
    const payload = c.get('jwtPayload');
    const data = await getSiteData(c);
    if (payload.roles.includes('admin')) return c.json(data);
    const user = data.users[payload.sub];
    const visibleCategories = data.categories.filter(cat => user.permissions.visibleCategories.includes(cat.id));
    const visibleCategoryIds = visibleCategories.map(cat => cat.id);
    const visibleBookmarks = data.bookmarks.filter(bm => visibleCategoryIds.includes(bm.categoryId));
    return c.json({ categories: visibleCategories, bookmarks: visibleBookmarks });
});

app.post('/bookmarks', authMiddleware('admin'), async (c) => { /* ...代码不变... */ });
app.put('/bookmarks/:id', authMiddleware('admin'), async (c) => { /* ...代码不变... */ });

export const onRequest = app.fetch;
