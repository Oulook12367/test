// functions/api/[[path]].js

import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt'; //
// 注意：这里不再需要 'hono/bearer-auth'

const app = new Hono();

// ====================================================================
//                 ↓↓↓ 这是本次最关键的修正部分 ↓↓↓
// ====================================================================

// --- 新的、已修正的认证中间件 ---
// 我们不再使用有问题的 bearerAuth，而是编写自己的验证逻辑
const authMiddleware = (role) => {
  return async (c, next) => {
    // 1. 从请求头获取 token
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: '认证失败：缺少 Token' }, 401);
    }
    const token = authHeader.substring(7); // 移除 "Bearer " 前缀

    // 2. 验证 token
    try {
      const decodedPayload = await verify(token, c.env.JWT_SECRET);
      if (!decodedPayload) {
        throw new Error("无效的 payload");
      }
      
      // 3. 如果需要特定角色，则检查角色权限
      if (role && !decodedPayload.roles?.includes(role)) {
        return c.json({ error: '权限不足' }, 403); // 403 Forbidden
      }

      // 4. 将用户信息存入上下文，供后续路由使用
      c.set('jwtPayload', decodedPayload);
      await next(); // 一切正常，继续处理请求
    } catch (e) {
      // 捕获 verify 函数抛出的错误 (例如 token 过期或签名无效)
      return c.json({ error: '认证失败：无效或已过期的 Token' }, 401);
    }
  };
};

// ====================================================================
//                 ↑↑↑ 修正部分结束 ↑↑↑
// ====================================================================


// --- 辅助函数 ---

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
            users: {
                'admin': {
                    username: 'admin',
                    passwordHash: adminPasswordHash,
                    roles: ['admin'],
                    permissions: { canSetNoExpiry: true }
                }
            },
            categories: [],
            bookmarks: []
        };
    }
    return data;
};

const saveSiteData = async (c, data) => {
    const currentData = await c.env.NAVI_DATA.get('data');
    if (currentData) {
        const timestamp = new Date().toISOString();
        await c.env.NAVI_BACKUPS.put(`backup-${timestamp}`, currentData);
        const backups = await c.env.NAVI_BACKUPS.list({ prefix: "backup-" });
        if (backups.keys.length > 10) {
            const sortedKeys = backups.keys.sort((a, b) => a.name.localeCompare(b.name));
            for (let i = 0; i < sortedKeys.length - 10; i++) {
                await c.env.NAVI_BACKUPS.delete(sortedKeys[i].name);
            }
        }
    }
    await c.env.NAVI_DATA.put('data', JSON.stringify(data));
};

// --- API 路由 (这部分无需改动) ---

app.post('/api/login', async (c) => {
    const { username, password, noExpiry } = await c.req.json();
    const data = await getSiteData(c);
    const user = data.users[username];
    const passwordHash = await hashPassword(password);
    if (!user || user.passwordHash !== passwordHash) {
        return c.json({ error: '用户名或密码错误' }, 401);
    }
    const payload = {
        sub: user.username,
        roles: user.roles,
        ...(noExpiry && user.permissions?.canSetNoExpiry ? {} : { exp: Math.floor(Date.now() / 1000) + 15 * 60 })
    };
    const token = await sign(payload, c.env.JWT_SECRET);
    return c.json({ token, user: { username: user.username, roles: user.roles, permissions: user.permissions } });
});

app.get('/api/data', authMiddleware(), async (c) => {
    const payload = c.get('jwtPayload');
    const data = await getSiteData(c);
    if (payload.roles.includes('admin')) {
        return c.json(data);
    }
    const user = data.users[payload.sub];
    const visibleCategories = data.categories.filter(cat => user.permissions.visibleCategories.includes(cat.id));
    const visibleCategoryIds = visibleCategories.map(cat => cat.id);
    const visibleBookmarks = data.bookmarks.filter(bm => visibleCategoryIds.includes(bm.categoryId));
    return c.json({ categories: visibleCategories, bookmarks: visibleBookmarks });
});

app.post('/api/bookmarks', authMiddleware('admin'), async (c) => {
    const bookmark = await c.req.json();
    const data = await getSiteData(c);
    bookmark.id = `bm-${Date.now()}`;
    data.bookmarks.push(bookmark);
    await saveSiteData(c, data);
    return c.json(bookmark, 201);
});

app.put('/api/bookmarks/:id', authMiddleware('admin'), async (c) => {
    const { id } = c.req.param();
    const updatedBookmark = await c.req.json();
    const data = await getSiteData(c);
    const index = data.bookmarks.findIndex(bm => bm.id === id);
    if (index === -1) return c.json({ error: 'Not Found' }, 404);
    data.bookmarks[index] = { ...data.bookmarks[index], ...updatedBookmark };
    await saveSiteData(c, data);
    return c.json(data.bookmarks[index]);
});

export const onRequest = app.fetch;
