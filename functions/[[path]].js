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
    if (!data || !data.categories || data.categories.length === 0) {
        const adminPasswordHash = await hashPassword('admin123');
        const defaultCatId = `cat-${Date.now()}`;
        return {
            users: {
                'admin': {
                    username: 'admin',
                    passwordHash: adminPasswordHash,
                    roles: ['admin'],
                    permissions: { 
                        canSetNoExpiry: true, 
                        visibleCategories: [defaultCatId],
                        canEditBookmarks: true,
                        canEditCategories: true,
                        canEditUsers: true
                    }
                }
            },
            categories: [{id: defaultCatId, name: '默认分类'}],
            bookmarks: []
        };
    }
    // Ensure all users have a complete permissions object
    for (const username in data.users) {
        const user = data.users[username];
        if (!user.permissions) {
            user.permissions = {};
        }
        user.permissions = {
            canSetNoExpiry: user.permissions.canSetNoExpiry || false,
            visibleCategories: user.permissions.visibleCategories || [],
            canEditBookmarks: user.permissions.canEditBookmarks || false,
            canEditCategories: user.permissions.canEditCategories || false,
            canEditUsers: user.permissions.canEditUsers || false,
        };
        if(user.roles && user.roles.includes('admin')){
            user.permissions.canEditBookmarks = true;
            user.permissions.canEditCategories = true;
            user.permissions.canEditUsers = true;
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

const authenticateRequest = async (request, env, requiredPermission) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return { error: '认证失败：缺少 Token', status: 401 };
    
    const token = authHeader.substring(7);
    try {
        const { payload } = await jwtVerify(token, await JWT_SECRET());
        if (!payload) throw new Error("无效的 payload");
        
        const data = await getSiteData(env);
        const user = data.users[payload.sub];
        if (!user) return { error: '用户不存在', status: 401 };

        if (user.roles.includes('admin')) {
            return { payload: user, status: 200 };
        }

        if (requiredPermission && !user.permissions[requiredPermission]) {
            return { error: '权限不足', status: 403 };
        }
        
        return { payload: user };
    } catch (e) {
        return { error: '认证失败：无效或已过期的 Token', status: 401 };
    }
};

const jsonResponse = (data, status = 200) => {
    if (data === null) {
        return new Response(null, { status: 204 });
    }
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

    // ... 省略了其他路由判断逻辑 ...

    // Login (登录处理逻辑)
    if (path === '/login' && request.method === 'POST') {
        const { username, password, noExpiry } = await request.json();
        const data = await getSiteData(env);
        const user = data.users[username];

        // 检查用户是否存在
        if (!user) {
            return jsonResponse({ error: '用户名或密码错误' }, 401);
        }

        // 验证密码哈希
        const passwordHash = await hashPassword(password);
        if (user.passwordHash !== passwordHash) {
            return jsonResponse({ error: '用户名或密码错误' }, 401);
        }

        // --- 推荐的安全实践修改 ---

        // 1. 创建一个“安全”的用户对象，使用对象解构和剩余属性语法
        //    来排除 passwordHash 这个敏感字段。
        const { passwordHash: removed, ...safeUser } = user;

        // 2. 使用安全的用户信息创建 JWT 的载荷(payload)
        const payload = { sub: safeUser.username, roles: safeUser.roles };
        const expirationTime = noExpiry && safeUser.permissions?.canSetNoExpiry ? '365d' : '15m';

        // 3. 签名并生成 token
        const token = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime(expirationTime)
            .sign(await JWT_SECRET());

        // 4. 在最终的响应中，返回 token 和被清理过的 safeUser 对象
        //    这样可以确保密码哈希永远不会发送到客户端。
        return jsonResponse({ token, user: safeUser });
    }
    
    // Get Data
    if (path === '/data' && request.method === 'GET') {
        const authResult = await authenticateRequest(request, env);
        if (authResult.error) return jsonResponse({ error: authResult.error }, authResult.status);
        const data = await getSiteData(env);
        const currentUser = data.users[authResult.payload.username];
        if (currentUser.roles.includes('admin')) {
            return jsonResponse(data);
        }
        const visibleCategories = data.categories.filter(cat => currentUser.permissions?.visibleCategories?.includes(cat.id));
        const visibleCategoryIds = visibleCategories.map(cat => cat.id);
        const visibleBookmarks = data.bookmarks.filter(bm => visibleCategoryIds.includes(bm.categoryId));
        return jsonResponse({ categories: visibleCategories, bookmarks: visibleBookmarks, users: {} });
    }
    
    // Bookmarks CRUD
    if (path.startsWith('/bookmarks')) {
        const authResult = await authenticateRequest(request, env, 'canEditBookmarks');
        if (authResult.error) return jsonResponse({ error: authResult.error }, authResult.status);
        const data = await getSiteData(env);
        if (request.method === 'POST' && path === '/bookmarks') {
            const bookmark = await request.json();
            bookmark.id = `bm-${Date.now()}`;
            data.bookmarks.push(bookmark);
            await saveSiteData(env, data);
            return jsonResponse(bookmark, 201);
        }
        const id = path.split('/').pop();
        const bookmarkIndex = data.bookmarks.findIndex(bm => bm.id === id);
        if (bookmarkIndex === -1) return jsonResponse({ error: '书签未找到' }, 404);
        if (request.method === 'PUT') {
            const updatedBookmark = await request.json();
            data.bookmarks[bookmarkIndex] = { ...data.bookmarks[bookmarkIndex], ...updatedBookmark };
            await saveSiteData(env, data);
            return jsonResponse(data.bookmarks[bookmarkIndex]);
        }
        if (request.method === 'DELETE') {
            data.bookmarks.splice(bookmarkIndex, 1);
            await saveSiteData(env, data);
            return jsonResponse(null);
        }
    }
    
    // Change Password
    if (path === '/change-password' && request.method === 'POST') {
        const authResult = await authenticateRequest(request, env);
        if (authResult.error) return jsonResponse(authResult, authResult.status);
        const { oldPassword, newPassword } = await request.json();
        if (!oldPassword || !newPassword || newPassword.length < 6) return jsonResponse({ error: '新密码无效或长度不足6位' }, 400);
        const data = await getSiteData(env);
        const username = authResult.payload.username;
        const user = data.users[username];
        const oldPasswordHash = await hashPassword(oldPassword);
        if (user.passwordHash !== oldPasswordHash) return jsonResponse({ error: '旧密码不正确' }, 403);
        user.passwordHash = await hashPassword(newPassword);
        await saveSiteData(env, data);
        return jsonResponse({ success: true, message: '密码已成功更改' });
    }
    
    // User Management
    if (path.startsWith('/users')) {
        const authResult = await authenticateRequest(request, env, 'canEditUsers');
        if (authResult.error) return jsonResponse(authResult, authResult.status);
        const data = await getSiteData(env);
        if (request.method === 'GET' && path === '/users') {
            const safeUsers = Object.values(data.users).map(({ passwordHash, ...user }) => user);
            return jsonResponse(safeUsers);
        }
        if (request.method === 'POST' && path === '/users') {
            const { username, password, permissions } = await request.json();
            if (!username || !password || data.users[username]) return jsonResponse({ error: '用户名无效或已存在' }, 400);
            data.users[username] = { username, passwordHash: await hashPassword(password), roles: ['user'], permissions: permissions || { visibleCategories: [] } };
            await saveSiteData(env, data);
            const { passwordHash, ...newUser } = data.users[username];
            return jsonResponse(newUser, 201);
        }
        const username = path.split('/').pop();
        const userToManage = data.users[username];
        if (!userToManage) return jsonResponse({ error: '用户未找到' }, 404);
        if (request.method === 'PUT') {
            const { roles, permissions, password } = await request.json();
            if (roles) userToManage.roles = roles;
            if (permissions) userToManage.permissions = permissions;
            if (password && password.length > 0) userToManage.passwordHash = await hashPassword(password);
            await saveSiteData(env, data);
            const { passwordHash, ...updatedUser } = userToManage;
            return jsonResponse(updatedUser);
        }
        if (request.method === 'DELETE') {
            if (username === 'admin') return jsonResponse({ error: '无法删除管理员账户' }, 403);
            delete data.users[username];
            await saveSiteData(env, data);
            return jsonResponse(null);
        }
    }
    
    // Categories CRUD
    if (path.startsWith('/categories')) {
        const authResult = await authenticateRequest(request, env, 'canEditCategories');
        if (authResult.error) return jsonResponse({ error: authResult.error }, authResult.status);
        const data = await getSiteData(env);
        if (request.method === 'POST' && path === '/categories') {
            const { name } = await request.json();
            if (!name || data.categories.find(c => c.name === name)) return jsonResponse({ error: '分类名称无效或已存在' }, 400);
            const newCategory = { id: `cat-${Date.now()}`, name };
            data.categories.push(newCategory);
            await saveSiteData(env, data);
            return jsonResponse(newCategory, 201);
        }
        const id = path.split('/').pop();
        const categoryIndex = data.categories.findIndex(c => c.id === id);
        if (categoryIndex === -1 && path !== '/categories') return jsonResponse({ error: '分类未找到' }, 404);
        if (request.method === 'PUT') {
            const { name } = await request.json();
            if (!name) return jsonResponse({ error: '分类名称不能为空' }, 400);
            data.categories[categoryIndex].name = name;
            await saveSiteData(env, data);
            return jsonResponse(data.categories[categoryIndex]);
        }
        if (request.method === 'DELETE') {
            if (data.bookmarks.some(bm => bm.categoryId === id)) return jsonResponse({ error: '无法删除：该分类下仍有书签存在' }, 400);
            data.categories.splice(categoryIndex, 1);
            await saveSiteData(env, data);
            return jsonResponse(null);
        }
    }

    return jsonResponse({ error: 'API endpoint not found' }, 404);
}
