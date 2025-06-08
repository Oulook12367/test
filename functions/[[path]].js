import { SignJWT, jwtVerify } from 'jose';

// --- Security & Hashing Helpers ---
const JWT_SECRET = () => new TextEncoder().encode(globalThis.JWT_SECRET_STRING);

const generateSalt = (length = 16) => {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
};

const hashPassword = async (password, salt) => {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
    const hash = new Uint8Array(bits);
    return Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
};

// --- Data Fetching & Permission Hydration ---
const getSiteData = async (env) => {
    let data = await env.NAVI_DATA.get('data', { type: 'json' });

    // 【重要修正】仅当数据完全不存在时，才创建初始数据
    if (!data) {
        const adminSalt = generateSalt();
        const adminPasswordHash = await hashPassword('admin123', adminSalt);
        const parentCatId = `cat-${Date.now()}`;
        const publicCatId = `cat-${Date.now() + 2}`;
        
        data = {
            users: {
                'admin': {
                    username: 'admin',
                    passwordHash: adminPasswordHash,
                    salt: adminSalt,
                    roles: ['admin'],
                    permissions: { visibleCategories: [parentCatId, publicCatId] }
                },
                'public': {
                    username: 'public',
                    roles: ['viewer'],
                    permissions: { visibleCategories: [publicCatId] }
                }
            },
            categories: [
                { id: parentCatId, name: '默认分类', parentId: null, sortOrder: 0 },
                { id: publicCatId, name: '公共分类', parentId: null, sortOrder: 1 }
            ],
            bookmarks: []
        };
        // 首次创建后立即保存
        await env.NAVI_DATA.put('data', JSON.stringify(data));
    }

    // Ensure all categories have a sortOrder
    if (data.categories) {
        data.categories.forEach((cat, index) => {
            if (typeof cat.sortOrder !== 'number') {
                cat.sortOrder = index;
            }
        });
    }

    // Hydrate permissions for all users
    if (data.users) {
        for (const username in data.users) {
            const user = data.users[username];
            if (!user.permissions) user.permissions = {};
            if (!user.roles) user.roles = ['viewer'];

            const isEditor = user.roles.includes('editor');
            const isAdmin = user.roles.includes('admin');

            Object.assign(user.permissions, {
                canEditBookmarks: isEditor || isAdmin,
                canEditCategories: isEditor || isAdmin,
                canEditUsers: isAdmin,
            });

            if (!user.permissions.visibleCategories) {
                user.permissions.visibleCategories = [];
            }
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
        if (backups.keys.length > 100) {
            const sortedKeys = backups.keys.sort((a, b) => a.name.localeCompare(b.name));
            for (let i = 0; i < sortedKeys.length - 100; i++) {
                await env.NAVI_BACKUPS.delete(sortedKeys[i].name);
            }
        }
    }
    await env.NAVI_DATA.put('data', JSON.stringify(data));
};

const authenticateRequest = async (request, env, siteData) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return { error: '认证失败：缺少 Token', status: 401 };
    const token = authHeader.substring(7);
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET());
        if (!payload || !payload.sub) throw new Error("无效的 payload");
        
        const user = siteData.users[payload.sub];
        if (!user) return { error: '用户不存在', status: 401 };
        return { user };
    } catch (e) {
        return { error: '认证失败：无效或已过期的 Token', status: 401 };
    }
};

const jsonResponse = (data, status = 200, headers = {}) => {
    const defaultHeaders = { 'Content-Type': 'application/json;charset=UTF-8' };
    if (data === null) {
        return new Response(null, { status: 204, headers: { ...defaultHeaders, ...headers } });
    }
    return new Response(JSON.stringify(data), { status, headers: { ...defaultHeaders, ...headers } });
};

// --- Main onRequest Entrypoint ---
export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (!path.startsWith('/api/')) return next();
    
    globalThis.JWT_SECRET_STRING = env.JWT_SECRET;
    const apiPath = path.substring(5);

    if (apiPath === 'login' && request.method === 'POST') {
        const { username, password } = await request.json();
        if (username.toLowerCase() === 'public') return jsonResponse({ error: '此为保留账户，禁止登录。' }, 403);
        const data = await getSiteData(env);
        const user = data.users[username];
        if (!user || !user.salt) return jsonResponse({ error: '用户名或密码错误' }, 401);
        const passwordHash = await hashPassword(password, user.salt);
        if (user.passwordHash !== passwordHash) return jsonResponse({ error: '用户名或密码错误' }, 401);
        const { passwordHash: removed, salt: removedSalt, ...safeUser } = user;
        const token = await new SignJWT({ sub: safeUser.username, roles: safeUser.roles }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1d').sign(await JWT_SECRET());
        return jsonResponse({ token, user: safeUser });
    }

    if (apiPath === 'data' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization');
        const data = await getSiteData(env);
        data.publicModeEnabled = env.PUBLIC_MODE_ENABLED === 'true';
        if (data.publicModeEnabled && !authHeader) {
            const publicUser = data.users.public || { permissions: { visibleCategories: [] }};
            const publicCategories = data.categories.filter(cat => publicUser.permissions.visibleCategories.includes(cat.id));
            const publicCategoryIds = publicCategories.map(cat => cat.id);
            const publicBookmarks = data.bookmarks.filter(bm => publicCategoryIds.includes(bm.categoryId));
            return jsonResponse({ isPublic: true, categories: publicCategories, bookmarks: publicBookmarks, users: [], publicModeEnabled: true });
        }
        const authResult = await authenticateRequest(request, env, data);
        if (authResult.error) return jsonResponse(authResult, authResult.status);
        const currentUser = authResult.user;
        if (currentUser.roles.includes('admin')) {
             const usersForAdmin = Object.values(data.users).map(({ passwordHash, salt, ...u }) => u);
             return jsonResponse({...data, users: usersForAdmin});
        }
        const visibleCategories = data.categories.filter(cat => currentUser.permissions.visibleCategories.includes(cat.id));
        const visibleCategoryIds = visibleCategories.map(cat => cat.id);
        const visibleBookmarks = data.bookmarks.filter(bm => visibleCategoryIds.includes(bm.categoryId));
        const { passwordHash, salt, ...safeUser } = currentUser;
        return jsonResponse({ categories: visibleCategories, bookmarks: visibleBookmarks, users: [safeUser], publicModeEnabled: data.publicModeEnabled });
    }
    
    const data = await getSiteData(env);
    const authResult = await authenticateRequest(request, env, data);
    if (authResult.error) return jsonResponse(authResult, authResult.status);
    const currentUser = authResult.user;

    if (apiPath === 'data' && request.method === 'PUT') {
        if (!currentUser.permissions.canEditCategories) return jsonResponse({ error: '权限不足' }, 403);
        const dataToUpdate = await request.json();
        if (dataToUpdate.categories) data.categories = dataToUpdate.categories;
        if (dataToUpdate.bookmarks) data.bookmarks = dataToUpdate.bookmarks;
        await saveSiteData(env, data);
        return jsonResponse({ success: true });
    }
    
    if (apiPath.startsWith('bookmarks')) {
        const id = apiPath.split('/').pop();
        if (request.method === 'POST') {
            if (!currentUser.permissions.canEditBookmarks) return jsonResponse({ error: '权限不足' }, 403);
            const bookmark = await request.json();
            if (!currentUser.roles.includes('admin') && !currentUser.permissions.visibleCategories.includes(bookmark.categoryId)) return jsonResponse({ error: '无权在此分类下添加书签' }, 403);
            bookmark.id = `bm-${Date.now()}`;
            if(typeof bookmark.sortOrder === 'undefined') {
                 const maxOrder = data.bookmarks.length > 0 ? Math.max(...data.bookmarks.map(b => b.sortOrder || 0)) : -1;
                 bookmark.sortOrder = maxOrder + 10;
            }
            data.bookmarks.push(bookmark);
            await saveSiteData(env, data);
            return jsonResponse(bookmark, 201);
        }
        const bookmarkIndex = data.bookmarks.findIndex(bm => bm.id === id);
        if (bookmarkIndex === -1) return jsonResponse({ error: '书签未找到' }, 404);
        const bookmarkToAccess = data.bookmarks[bookmarkIndex];
        if (!currentUser.roles.includes('admin') && !currentUser.permissions.visibleCategories.includes(bookmarkToAccess.categoryId)) return jsonResponse({ error: '权限不足' }, 403);
        if (request.method === 'PUT') {
            if (!currentUser.permissions.canEditBookmarks) return jsonResponse({ error: '权限不足' }, 403);
            const updatedBookmark = await request.json();
            data.bookmarks[bookmarkIndex] = { ...bookmarkToAccess, ...updatedBookmark };
            await saveSiteData(env, data);
            return jsonResponse(data.bookmarks[bookmarkIndex]);
        }
        if (request.method === 'DELETE') {
            if (!currentUser.permissions.canEditBookmarks) return jsonResponse({ error: '权限不足' }, 403);
            data.bookmarks.splice(bookmarkIndex, 1);
            await saveSiteData(env, data);
            return jsonResponse(null);
        }
    }
    
    if (apiPath.startsWith('users')) {
        if (!currentUser.permissions.canEditUsers) return jsonResponse({ error: '权限不足' }, 403);
        const username = apiPath.split('/').pop();
        if (request.method === 'POST') {
            const { username, password, roles, permissions } = await request.json();
            if (!username || !password || data.users[username]) return jsonResponse({ error: '用户名无效或已存在' }, 400);
            const salt = generateSalt();
            const passwordHash = await hashPassword(password, salt);
            data.users[username] = { username, passwordHash, salt, roles, permissions };
            await saveSiteData(env, data);
            const { passwordHash: p, salt: s, ...newUser } = data.users[username];
            return jsonResponse(newUser, 201);
        }
        const userToManage = data.users[username];
        if (!userToManage) return jsonResponse({ error: '用户未找到' }, 404);
        if (request.method === 'PUT') {
            const { roles, permissions, password } = await request.json();
            if (roles) userToManage.roles = roles;
            if (permissions) userToManage.permissions.visibleCategories = permissions.visibleCategories;
            if (password) {
                userToManage.salt = generateSalt();
                userToManage.passwordHash = await hashPassword(password, userToManage.salt);
            }
            await saveSiteData(env, data);
            const { passwordHash, salt, ...updatedUser } = userToManage;
            return jsonResponse(updatedUser);
        }
        if (request.method === 'DELETE') {
            if (username === 'admin') return jsonResponse({ error: '无法删除默认管理员' }, 403);
            if (username === currentUser.username) return jsonResponse({ error: '无法删除自己' }, 403);
            if (userToManage.roles.includes('admin')) {
                const adminCount = Object.values(data.users).filter(u => u.roles.includes('admin')).length;
                if (adminCount <= 1) return jsonResponse({ error: '无法删除最后一个管理员账户' }, 403);
            }
            delete data.users[username];
            await saveSiteData(env, data);
            return jsonResponse(null);
        }
    }

    return jsonResponse({ error: 'API endpoint not found' }, 404);
}
