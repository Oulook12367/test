// functions/[[path]].js

import { SignJWT, jwtVerify } from 'jose';

// --- Helper Functions ---
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
                    permissions: { canSetNoExpiry: true, visibleCategories: ['cat-1'] }
                }
            },
            categories: [{id: 'cat-1', name: '默认分类'}],
            bookmarks: []
        };
    }
    for (const user in data.users) {
        if (!data.users[user].permissions) {
            data.users[user].permissions = { visibleCategories: [] };
        }
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

const authenticateRequest = async (request, env, requiredRole) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: '认证失败：缺少 Token', status: 401 };
    }
    const token = authHeader.substring(7);
    try {
        const { payload } = await jwtVerify(token, await JWT_SECRET());
        if (!payload) { throw new Error("无效的 payload"); }
        if (requiredRole && !payload.roles?.includes(requiredRole)) {
            return { error: '权限不足', status: 403 };
        }
        return { payload };
    } catch (e) {
        return { error: '认证失败：无效或已过期的 Token', status: 401 };
    }
};

const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: { 'Content-Type': 'application/json;charset=UTF-8' }
    });
};

// --- Main Entry Point ---
export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    const apiRoutePatterns = ['/login', '/data', '/bookmarks', '/change-password', '/users', '/categories'];
    const isApiRequest = apiRoutePatterns.some(p => path.startsWith(p));
    
    if (!isApiRequest) {
        return next();
    }
    
    globalThis.JWT_SECRET_STRING = env.JWT_SECRET;

    // --- API Routes ---
    
    // Login, Bookmarks, Users, etc. (Keep all existing route logic here)
    // ...

    // Categories CRUD
    if (path.startsWith('/categories')) {
        const authResult = await authenticateRequest(request, env, 'admin');
        if (authResult.error) return jsonResponse({ error: authResult.error }, authResult.status);
        const data = await getSiteData(env);
        
        // POST /categories
        if (request.method === 'POST' && path === '/categories') {
            const { name } = await request.json();
            if (!name || data.categories.find(c => c.name === name)) {
                return jsonResponse({ error: '分类名称无效或已存在' }, 400);
            }
            const newCategory = { id: `cat-${Date.now()}`, name };
            data.categories.push(newCategory);
            await saveSiteData(env, data);
            return jsonResponse(newCategory, 201);
        }
        
        const id = path.split('/').pop();
        const categoryIndex = data.categories.findIndex(c => c.id === id);
        if (categoryIndex === -1 && path !== '/categories') return jsonResponse({ error: '分类未找到' }, 404);

        // PUT /categories/:id
        if (request.method === 'PUT') {
            const { name } = await request.json();
            if (!name) return jsonResponse({ error: '分类名称不能为空' }, 400);
            data.categories[categoryIndex].name = name;
            await saveSiteData(env, data);
            return jsonResponse(data.categories[categoryIndex]);
        }
        // DELETE /categories/:id
        if (request.method === 'DELETE') {
            if (data.bookmarks.some(bm => bm.categoryId === id)) {
                return jsonResponse({ error: '无法删除：该分类下仍有书签存在' }, 400);
            }
            data.categories.splice(categoryIndex, 1);
            await saveSiteData(env, data);
            return jsonResponse({ success: true });
        }
    }

    return jsonResponse({ error: 'API endpoint not found' }, 404);
}
