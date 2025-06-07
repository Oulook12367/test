// functions/api/[[path]].js



import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { sign, verify } from 'hono/jwt'; // <== 确保这里和 package.json 里的名字一致


const app = new Hono();

// --- JWT 验证中间件 ---
// 'user' 和 'admin' 是权限角色
const authMiddleware = (role) => bearerAuth({
  verify: async (token, c) => {
    try {
      const decodedPayload = await verify(token, c.env.JWT_SECRET);
      if (!decodedPayload || (role && !decodedPayload.roles?.includes(role))) {
        return false;
      }
      c.set('jwtPayload', decodedPayload); // 将解码后的用户信息传递给后续处理函数
      return true;
    } catch (e) {
      return false;
    }
  }
});

// --- 辅助函数 ---

// 密码哈希（在真实项目中，应使用更强的哈希算法如 Argon2 或 bcrypt）
// Cloudflare Workers 不支持 bcrypt，但支持 Web Crypto API
const hashPassword = async (password) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// 获取和初始化数据
const getSiteData = async (c) => {
    let data = await c.env.NAVI_DATA.get('data', { type: 'json' });
    if (!data) {
        // 如果数据不存在，创建一个初始管理员账户
        const adminPasswordHash = await hashPassword('admin123'); // 默认密码
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

// 保存数据并创建备份
const saveSiteData = async (c, data) => {
    const currentData = await c.env.NAVI_DATA.get('data');
    if (currentData) {
        const timestamp = new Date().toISOString();
        await c.env.NAVI_BACKUPS.put(`backup-${timestamp}`, currentData);

        // 保留最近10次备份
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


// --- API 路由 ---

// 用户登录
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
        // 如果用户有权限且选择了不过期，则不设置 exp
        ...(noExpiry && user.permissions?.canSetNoExpiry ? {} : { exp: Math.floor(Date.now() / 1000) + 15 * 60 }) // 默认15分钟
    };

    const token = await sign(payload, c.env.JWT_SECRET);
    return c.json({ token, user: { username: user.username, roles: user.roles, permissions: user.permissions } });
});

// 获取对当前用户可见的数据
app.get('/api/data', authMiddleware(), async (c) => {
    const payload = c.get('jwtPayload');
    const data = await getSiteData(c);

    // 管理员可以看到所有内容
    if (payload.roles.includes('admin')) {
        return c.json(data);
    }

    // 普通用户只能看到授权的分类和其中的书签
    const user = data.users[payload.sub];
    const visibleCategories = data.categories.filter(cat => user.permissions.visibleCategories.includes(cat.id));
    const visibleCategoryIds = visibleCategories.map(cat => cat.id);
    const visibleBookmarks = data.bookmarks.filter(bm => visibleCategoryIds.includes(bm.categoryId));

    return c.json({
        categories: visibleCategories,
        bookmarks: visibleBookmarks,
    });
});

// 添加书签 (仅限管理员)
app.post('/api/bookmarks', authMiddleware('admin'), async (c) => {
    const bookmark = await c.req.json();
    const data = await getSiteData(c);
    bookmark.id = `bm-${Date.now()}`;
    data.bookmarks.push(bookmark);
    await saveSiteData(c, data);
    return c.json(bookmark, 201);
});

// 更新书签 (仅限管理员)
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

// ... 在这里可以继续添加删除书签、管理用户、管理分类等 API ...
// ... 例如: app.delete('/api/bookmarks/:id', ...), app.post('/api/users', ...), etc.


// 捕获所有路由
export const onRequest = app.fetch;
