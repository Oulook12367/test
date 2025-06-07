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
        const parentCatId = `cat-${Date.now()}`;
        const childCatId = `cat-${Date.now() + 1}`;
        const publicCatId = `cat-${Date.now() + 2}`;
        
        data = {
            users: {
                'admin': {
                    username: 'admin',
                    passwordHash: adminPasswordHash,
                    salt: adminSalt,
                    roles: ['admin'],
                    permissions: { visibleCategories: [parentCatId, childCatId, publicCatId] }
                },
                'public': {
                    username: 'public',
                    roles: ['viewer'],
                    permissions: { visibleCategories: [publicCatId] }
                }
            },
            categories: [
                { id: parentCatId, name: '默认父分类', parentId: null },
                { id: childCatId, name: '默认子分类', parentId: parentCatId },
                { id: publicCatId, name: '公共分类', parentId: null }
            ],
            bookmarks: []
        };
    }

    if (!data.users.public) {
        const publicCatId = `cat-public-${Date.now()}`;
        data.categories.push({ id: publicCatId, name: '公共分类', parentId: null });
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

        // 【修改】使用 Object.assign 进行非破坏性更新，避免覆盖整个 permissions 对象
        Object.assign(user.permissions, {
            canEditBookmarks: isEditor || isAdmin,
            canEditCategories: isEditor || isAdmin,
            canEditUsers: isAdmin,
        });

        // 【修改】确保 visibleCategories 数组存在
        if (!user.permissions.visibleCategories) {
            user.permissions.visibleCategories = [];
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
        if (backups.keys.length > 30) {
            const sortedKeys = backups.keys.sort((a, b) => a.name.localeCompare(b.name));
            for (let i = 0; i < sortedKeys.length - 30; i++) {
                await env.NAVI_BACKUPS.delete(sortedKeys[i].name);
            }
        }
    }
    await env.NAVI_DATA.put('data', JSON.stringify(data));
};

// 【修改】authenticateRequest 函数现在接受 siteData 作为参数，以避免重复IO
const authenticateRequest = async (request, env, siteData) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return { error: '认证失败：缺少 Token', status: 401 };
    const token = authHeader.substring(7);
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET());
        if (!payload || !payload.sub) throw new Error("无效的 payload");
        
        // 【修改】直接使用传入的 siteData 对象
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

// --- 主入口 onRequest ---
export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (!path.startsWith('/api/')) return next();
    
    globalThis.JWT_SECRET_STRING = env.JWT_SECRET;
    const apiPath = path.substring(5);

    if (apiPath === 'login' && request.method === 'POST') {
        const { username, password } = await request.json();
        if (username.toLowerCase() === 'public') {
            return jsonResponse({ error: '此为保留账户，禁止登录。' }, 403);
        }
        
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

    if (apiPath === 'data' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization');
        
        // 【优化】先获取一次数据，后续逻辑中重复使用
        const data = await getSiteData(env);

        if (env.PUBLIC_MODE_ENABLED === 'true' && !authHeader) {
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
        
        // 【优化】将获取到的 data 传递给认证函数
        const authResult = await authenticateRequest(request, env, data);
        if (authResult.error) return jsonResponse(authResult, authResult.status);
        const currentUser = authResult.user;

        // 【优化】不再需要第二次调用 getSiteData

        if (currentUser.roles.includes('admin')) {
             const usersForAdmin = Object.values(data.users).map(({ passwordHash, salt, ...u }) => u);
             return jsonResponse({...data, users: usersForAdmin});
        }
        const visibleCategories = data.categories.filter(cat => currentUser.permissions.visibleCategories.includes(cat.id));
        const visibleCategoryIds = visibleCategories.map(cat => cat.id);
        const visibleBookmarks = data.bookmarks.filter(bm => visibleCategoryIds.includes(bm.categoryId));
        const { passwordHash, salt, ...safeUser } = currentUser;
        return jsonResponse({ categories: visibleCategories, bookmarks: visibleBookmarks, users: [safeUser] });
    }
    
    // 【优化】为所有需要授权的写操作（PUT/POST/DELETE）建立统一的认证墙
    const dataForWriteOps = await getSiteData(env);
    const authResult = await authenticateRequest(request, env, dataForWriteOps);
    if (authResult.error) return jsonResponse(authResult, authResult.status);
    const currentUser = authResult.user; // 这个 currentUser 用于所有后续的写操作
    const data = dataForWriteOps; // 这个 data 也一样

    if (apiPath === 'data' && request.method === 'PUT') {
        if (!currentUser.permissions.canEditBookmarks && !currentUser.permissions.canEditCategories) {
            return jsonResponse({ error: '权限不足' }, 403);
        }
        const dataToUpdate = await request.json();
        // const data = await getSiteData(env); // 已被上面的统一逻辑取代
        if (dataToUpdate.categories) data.categories = dataToUpdate.categories;
        if (dataToUpdate.bookmarks) data.bookmarks = dataToUpdate.bookmarks;
        await saveSiteData(env, data);
        return jsonResponse({ success: true });
    }
    
    if (apiPath.startsWith('bookmarks')) {
        // const data = await getSiteData(env); // 已被上面的统一逻辑取代
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
    
    if (apiPath.startsWith('categories')) {
        if (!currentUser.permissions.canEditCategories) return jsonResponse({ error: '权限不足' }, 403);
        // const data = await getSiteData(env); // 已被上面的统一逻辑取代
        const id = apiPath.split('/').pop();
if (request.method === 'DELETE' && apiPath === 'categories') {
    const { ids } = await request.json();
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return jsonResponse({ error: '无效的请求' }, 400);
    }

    // --- 【新增】递归查找所有需要删除的分类ID ---
    const allCategoryIdsToDelete = new Set(ids);
    const queue = [...ids]; // 使用队列来进行广度优先搜索

    while (queue.length > 0) {
        const parentId = queue.shift(); // 取出队列中的一个父分类ID
        // 查找其所有直接子分类
        const children = data.categories.filter(c => c.parentId === parentId);
        for (const child of children) {
            if (!allCategoryIdsToDelete.has(child.id)) {
                allCategoryIdsToDelete.add(child.id);
                queue.push(child.id); // 将新的子分类ID加入队列，继续查找其后代
            }
        }
    }

    const finalIdsToDelete = Array.from(allCategoryIdsToDelete);

    // --- 【修改】使用完整的ID列表进行过滤删除 ---
    // 1. 删除所有相关分类下的书签
    data.bookmarks = data.bookmarks.filter(bm => !finalIdsToDelete.includes(bm.categoryId));
    // 2. 删除所有相关分类自身
    data.categories = data.categories.filter(c => !finalIdsToDelete.includes(c.id));
    // 3. 从所有用户的权限中移除这些分类的访问权
    Object.values(data.users).forEach(user => {
        user.permissions.visibleCategories = user.permissions.visibleCategories.filter(catId => !finalIdsToDelete.includes(catId));
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
            const newCategory = { id: `cat-${Date.now()}`, name, parentId: null }; // 确保新分类是顶级分类
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

    if (apiPath.startsWith('users')) {
        if (!currentUser.permissions.canEditUsers) return jsonResponse({ error: '权限不足' }, 403);
        // const data = await getSiteData(env); // 已被上面的统一逻辑取代
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
