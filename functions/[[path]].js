// functions/[[path]].js

// 关键改动: 导入新的类和函数
import { SignJWT, jwtVerify } from 'jose';

// --- 辅助函数 ---
const JWT_SECRET = () => new TextEncoder().encode(globalThis.JWT_SECRET_STRING);

const hashPassword = async (password) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const getSiteData = async (env) => {
    let data = await env.NAVI_DATA.get('data', { type: 'json' });
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

const saveSiteData = async (env, data) => {
    const currentData = await env.NAVI_DATA.get('data');
    if (currentData) {
        const timestamp = new Date().toISOString();
        await env.NAVI_BACKUPS.put(`backup-${timestamp}`, currentData);
        const backups = await env.NAVI_BACKUPS.list({ prefix: "backup-" });
        if (backups.keys.length > 10) {
            const sortedKeys = backups.keys.sort((a, b) => a.name.localeCompare(b.name));
            for (let i = 0; i < sortedKeys.length - 10; i++) {
                await env.NAVI_BACKUPS.delete(sortedKeys[i].name);
            }
        }
    }
    await env.NAVI_DATA.put('data', JSON.stringify(data));
};

// --- 原生认证函数 ---
const authenticateRequest = async (request, env, requiredRole) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: '认证失败：缺少 Token', status: 401 };
    }
    const token = authHeader.substring(7);
    try {
        // 关键改动: 使用 jwtVerify
        const { payload } = await jwtVerify(token, await JWT_SECRET());
        if (!payload) {
            throw new Error("无效的 payload");
        }
        if (requiredRole && !payload.roles?.includes(requiredRole)) {
            return { error: '权限不足', status: 403 };
        }
        return { payload }; // 认证成功
    } catch (e) {
        return { error: '认证失败：无效或已过期的 Token', status: 401 };
    }
};

// --- JSON 响应的辅助函数 ---
const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' }
    });
};


// --- 主入口函数：原生路由逻辑 ---
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    globalThis.JWT_SECRET_STRING = env.JWT_SECRET;

    // --- 路由匹配 ---

    // 登录
    if (url.pathname === '/login' && request.method === 'POST') {
        const { username, password, noExpiry } = await request.json();
        const data = await getSiteData(env);
        const user = data.users[username];

        if (!user) return jsonResponse({ error: '用户名或密码错误' }, 401);

        const passwordHash = await hashPassword(password);
        if (user.passwordHash !== passwordHash) {
            return jsonResponse({ error: '用户名或密码错误' }, 401);
        }

        const payload = { sub: user.username, roles: user.roles };
        const expirationTime = noExpiry && user.permissions?.canSetNoExpiry ? '20y' : '15m';
        
        // 关键改动: 使用 SignJWT
        const token = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime(expirationTime)
            .sign(await JWT_SECRET());

        return jsonResponse({ token, user: { username: user.username, roles: user.roles, permissions: user.permissions } });
    }

    // 获取数据
    if (url.pathname === '/data' && request.method === 'GET') {
        const authResult = await authenticateRequest(request, env);
        if (authResult.error) return jsonResponse({ error: authResult.error }, authResult.status);
        
        const { payload } = authResult;
        const data = await getSiteData(env);

        if (payload.roles.includes('admin')) {
            return jsonResponse(data);
        }
        
        const user = data.users[payload.sub];
        if (!user.permissions?.visibleCategories) {
             return jsonResponse({ categories: [], bookmarks: [] });
        }
        const visibleCategories = data.categories.filter(cat => user.permissions.visibleCategories.includes(cat.id));
        const visibleCategoryIds = visibleCategories.map(cat => cat.id);
        const visibleBookmarks = data.bookmarks.filter(bm => visibleCategoryIds.includes(bm.categoryId));
        return jsonResponse({ categories: visibleCategories, bookmarks: visibleBookmarks });
    }

    // 添加书签
    if (url.pathname === '/bookmarks' && request.method === 'POST') {
        const authResult = await authenticateRequest(request, env, 'admin');
        if (authResult.error) return jsonResponse({ error: authResult.error }, authResult.status);

        const bookmark = await request.json();
        const data = await getSiteData(env);
        bookmark.id = `bm-${Date.now()}`;
        data.bookmarks.push(bookmark);
        await saveSiteData(env, data);
        return jsonResponse(bookmark, 201);
    }
    
    // 如果没有匹配的路由，返回 404
    return new Response('Not Found', { status: 404 });
}
