import { SignJWT, jwtVerify } from 'jose';

// --- 安全的密码哈希辅助函数 ---
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

// --- 数据获取与权限填充 ---
const getSiteData = async (env) => {
    let data = await env.NAVI_DATA.get('data', { type: 'json' });

    if (!data || !data.users || !data.categories) {
        const adminSalt = generateSalt();
        const adminPasswordHash = await hashPassword('admin123', adminSalt);
        const defaultCatId = `cat-${Date.now()}`;
        const publicCatId = `cat-${Date.now() + 1}`;
        
        data = {
            users: {
                'admin': {
                    username: 'admin',
                    passwordHash: adminPasswordHash,
                    salt: adminSalt,
                    roles: ['admin'],
                    permissions: { visibleCategories: [defaultCatId, publicCatId] }
                },
                'public': {
                    username: 'public',
                    roles: ['viewer'],
                    permissions: { visibleCategories: [publicCatId] }
                }
            },
            categories: [
                { id: defaultCatId, name: '默认分类' },
                { id: publicCatId, name: '公共分类' }
            ],
            bookmarks: []
        };
    }

    if (!data.users.public) {
        const publicCatId = data.categories[0]?.id || `cat-${Date.now()}`;
        data.users.public = {
            username: 'public',
            roles: ['viewer'],
            permissions: { visibleCategories: [publicCatId] }
        };
    }

    for (const username in data.users) {
        const user = data.users[username];
        if (!user.permissions) user.permissions = {};
        if (!user.roles) user.roles = ['viewer'];

        const isEditor = user.roles.includes('editor');
        const isAdmin = user.roles.includes('admin');

        user.permissions = {
            canEditBookmarks: isEditor || isAdmin,
            canEditCategories: isEditor || isAdmin,
            canEditUsers: isAdmin,
            visibleCategories: user.permissions.visibleCategories || []
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

const authenticateRequest = async (request, env) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return { error: '认证失败：缺少 Token', status: 401 };
    const token = authHeader.substring(7);
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET());
        if (!payload || !payload.sub) throw new Error("无效的 payload");
        const data = await getSiteData(env);
        const user = data.users[payload.sub];
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

// --- 主入口 onRequest ---
export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (!path.startsWith('/api/')) return next();
    
    globalThis.JWT_SECRET_STRING = env.JWT_SECRET;
    const apiPath = path.substring(5);

    // --- 路由逻辑 ---

    // 登录 (无需认证)
    if (apiPath === 'login' && request.method === 'POST') {
        const { username, password } = await request.json();
        const data = await getSiteData(env);
        const user = data.users[username];
        if (!user || !user.salt) return jsonResponse({ error: '用户名或密码错误' }, 401);
        const passwordHash = await hashPassword(password, user.salt);
        if (user.passwordHash !== passwordHash) return jsonResponse({ error: '用户名或密码错误' }, 401);
        
        const { passwordHash: removed, salt: removedSalt, ...safeUser } = user;
        const token = await new SignJWT({ sub: safeUser.username, roles: safeUser.roles })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('1d')
            .sign(await JWT_SECRET());
            
        return jsonResponse({ token, user: safeUser });
    }

    // 获取数据 - 可能是公共的或需认证的
    if (apiPath === 'data' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization');
        
        if (env.PUBLIC_MODE_ENABLED === 'true' && !authHeader) {
            const data = await getSiteData(env);
            const publicUser = data.users.public;
            const publicCategories = data.categories.filter(cat => publicUser.permissions.visibleCategories.includes(cat.id));
            const publicCategoryIds = publicCategories.map(cat => cat.id);
            const publicBookmarks = data.bookmarks.filter(bm => publicCategoryIds.includes(bm.categoryId));
            return jsonResponse({
                isPublic: true,
                categories: publicCategories,
                bookmarks: publicBookmarks,
                users: []
            });
        }
        
        const authResult = await authenticateRequest(request, env);
        if (authResult.error) return jsonResponse(authResult, authResult.status);
        const currentUser = authResult.user;

        const data = await getSiteData(env);
        if (currentUser.roles.includes('admin')) {
             const usersForAdmin = Object.values(data.users).filter(u => u.username !== 'public').map(({ passwordHash, salt, ...u }) => u);
             return jsonResponse({...data, users: usersForAdmin});
        }
        const visibleCategories = data.categories.filter(cat => currentUser.permissions.visibleCategories.includes(cat.id));
        const visibleCategoryIds = visibleCategories.map(cat => cat.id);
        const visibleBookmarks = data.bookmarks.filter(bm => visibleCategoryIds.includes(bm.categoryId));
        const { passwordHash, salt, ...safeUser } = currentUser;
        return jsonResponse({ categories: visibleCategories, bookmarks: visibleBookmarks, users: [safeUser] });
    }

    // --- 所有其他写操作API都需要认证 ---
    const authResult = await authenticateRequest(request, env);
    if (authResult.error) return jsonResponse(authResult, authResult.status);
    const currentUser = authResult.user;

// (新增) PUT /api/data - 用于保存排序等批量更新
    if (apiPath === 'data' && request.method === 'PUT') {
        if (!currentUser.permissions.canEditBookmarks && !currentUser.permissions.canEditCategories) {
            return jsonResponse({ error: '权限不足' }, 403);
        }
        
        const dataToUpdate = await request.json();
        const data = await getSiteData(env);

        // Only update arrays that were sent
        if (dataToUpdate.categories) {
            data.categories = dataToUpdate.categories;
        }
        if (dataToUpdate.bookmarks) {
            data.bookmarks = dataToUpdate.bookmarks;
        }

        await saveSiteData(env, data);
        return jsonResponse({ success: true });
    }

    
    // 书签 CRUD
    if (apiPath.startsWith('bookmarks')) {
        const data = await getSiteData(env);
        const id = apiPath.split('/').pop();

        if (request.method === 'POST') {
            if (!currentUser.permissions.canEditBookmarks) return jsonResponse({ error: '权限不足' }, 403);
            const bookmark = await request.json();
            if (!currentUser.permissions.visibleCategories.includes(bookmark.categoryId)) return jsonResponse({ error: '无权在此分类下添加书签' }, 403);
            bookmark.id = `bm-${Date.now()}`;
            data.bookmarks.push(bookmark);
            await saveSiteData(env, data);
            return jsonResponse(bookmark, 201);
        }

        const bookmarkIndex = data.bookmarks.findIndex(bm => bm.id === id);
        if (bookmarkIndex === -1) return jsonResponse({ error: '书签未找到' }, 404);
        const bookmarkToAccess = data.bookmarks[bookmarkIndex];
        if (!currentUser.roles.includes('admin') && !currentUser.permissions.visibleCategories.includes(bookmarkToAccess.categoryId)) {
            return jsonResponse({ error: '权限不足' }, 403);
        }

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
    
    // 分类 CRUD
    if (apiPath.startsWith('categories')) {
        if (!currentUser.permissions.canEditCategories) return jsonResponse({ error: '权限不足' }, 403);
        const data = await getSiteData(env);
        const id = apiPath.split('/').pop();

        if (request.method === 'DELETE' && apiPath === 'categories') {
            const { ids } = await request.json();
            if (!ids || !Array.isArray(ids)) return jsonResponse({ error: '无效的请求' }, 400);

            data.bookmarks = data.bookmarks.filter(bm => !ids.includes(bm.categoryId));
            data.categories = data.categories.filter(c => !ids.includes(c.id));
            Object.values(data.users).forEach(user => {
                user.permissions.visibleCategories = user.permissions.visibleCategories.filter(catId => !ids.includes(catId));
            });

            await saveSiteData(env, data);
            return jsonResponse(null);
        }

        if (request.method === 'PUT' && id) {
            const { name } = await request.json();
            if (!name || name.trim() === '') return jsonResponse({ error: '分类名称不能为空' }, 400);
            if (data.categories.some(c => c.name === name && c.id !== id)) return jsonResponse({ error: '该分类名称已存在' }, 400);
            const categoryToUpdate = data.categories.find(c => c.id === id);
            if (!categoryToUpdate) return jsonResponse({ error: '分类未找到' }, 404);
            categoryToUpdate.name = name.trim();
            await saveSiteData(env, data);
            return jsonResponse(categoryToUpdate);
        }

        if (request.method === 'POST') {
            const { name } = await request.json();
            if (!name || data.categories.find(c => c.name === name)) return jsonResponse({ error: '分类名称无效或已存在' }, 400);
            const newCategory = { id: `cat-${Date.now()}`, name };
            data.categories.push(newCategory);
            Object.values(data.users).forEach(user => {
                if (user.roles.includes('admin') || user.username === currentUser.username) {
                    if (!user.permissions.visibleCategories.includes(newCategory.id)) {
                        user.permissions.visibleCategories.push(newCategory.id);
                    }
                }
            });
            await saveSiteData(env, data);
            return jsonResponse(newCategory, 201);
        }
    }

    // 用户管理
    if (apiPath.startsWith('users')) {
        if (!currentUser.permissions.canEditUsers) return jsonResponse({ error: '权限不足' }, 403);
        const data = await getSiteData(env);
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
            if (username === currentUser.username) return jsonResponse({ error: '无法删除自己' }, 403);
            if (userToManage.roles.includes('admin')) {
                const adminCount = Object.values(data.users).filter(u => u.roles.includes('admin')).length;
                if (adminCount <= 1) {
                    return jsonResponse({ error: '无法删除最后一个管理员账户' }, 403);
                }
            }
            delete data.users[username];
            await saveSiteData(env, data);
            return jsonResponse(null);
        }
    }

    return jsonResponse({ error: 'API endpoint not found' }, 404);
}
