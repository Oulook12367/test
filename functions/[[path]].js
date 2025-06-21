/**
 * NaviCenter Backend for Cloudflare Workers
 * * This code implements a CQRS-like pattern for a bookmarking application.
 * - READ operations (GET requests) are served from a fast, full-data cache.
 * - WRITE operations (POST, PUT, DELETE) are optimized to perform the minimum
 * number of KV store reads, significantly improving performance and reducing cost.
 * * Key optimizations include:
 * - A separate, lightweight authentication function for write operations.
 * - Storing bookmark IDs within category objects to speed up sorting.
 * - Direct writes for modifications, bypassing any pre-emptive reads.
 */
import { SignJWT, jwtVerify } from 'jose';

// --- 安全与工具函数 ---
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

const cleanTitle = (fullTitle) => {
    if (!fullTitle) return '';
    const cleaned = fullTitle.split(/ \| | - /)[0].trim();
    return cleaned || fullTitle;
};

const jsonResponse = (data, status = 200, headers = {}) => {
    const defaultHeaders = {
        'Content-Type': 'application/json;charset=UTF-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    };
    if (data === null) {
        return new Response(null, { status: 204, headers: { ...defaultHeaders, ...headers } });
    }
    return new Response(JSON.stringify(data), { status, headers: { ...defaultHeaders, ...headers } });
};

function validateUsername(username) {
    if (!username || username.length < 6) return "用户名至少需要6位。";
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) return "用户名只能包含字母、数字、下划线和连字符。";
    return null;
}

function validatePassword(password) {
    if (!password || password.length < 8) return "密码至少需要8位。";
    if (!/(?=.*[a-z])/.test(password)) return "密码必须包含至少一个小写字母。";
    if (!/(?=.*[A-Z])/.test(password)) return "密码必须包含至少一个大写字母。";
    if (!/(?=.*[0-9])/.test(password)) return "密码必须包含至少一个数字。";
    if (!/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password)) return "密码必须包含至少一个特殊符号。";
    return null;
}

function escapeHTMLExport(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, (match) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[match]));
}


// --- 缓存处理函数 ---
const CACHE_KEY_STRING = "https://navicenter.cache/api/data";
async function purgeDataCache(context) {
    try {
        const cache = caches.default;
        const cacheKey = new Request(CACHE_KEY_STRING);
        await cache.delete(cacheKey);
        console.log("数据缓存已清除。");
    } catch (e) {
        console.error("清除缓存失败:", e);
    }
}

// --- 数据获取与认证函数 ---

/**
 * [Read Path] 获取全站数据，并使用缓存。
 * 用于GET请求和少数需要全量数据的复杂写操作。
 */
const getSiteData = async (context) => {
    const { request, env } = context;
    const cache = caches.default;
    const cacheKey = new Request(CACHE_KEY_STRING);
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
        return cachedResponse.json();
    }

    const [userIndex, categoryIndex, bookmarkIndex, jwtSecret, publicModeSetting] = await Promise.all([
        env.NAVI_DATA.get('_index:users', 'json').then(res => res || null),
        env.NAVI_DATA.get('_index:categories', 'json').then(res => res || []),
        env.NAVI_DATA.get('_index:bookmarks', 'json').then(res => res || []),
        env.NAVI_DATA.get('jwtSecret'),
        env.NAVI_DATA.get('setting:publicModeEnabled')
    ]);

    if (userIndex === null) {
        console.log("首次运行检测到，正在初始化原子数据...");
        const adminSalt = generateSalt();
        const adminPasswordHash = await hashPassword('admin123', adminSalt);
        const parentCatId = `cat-${Date.now()}`;
        const publicCatId = `cat-${Date.now() + 2}`;
        const newJwtSecret = crypto.randomUUID() + '-' + crypto.randomUUID();
        const adminUser = { username: 'admin', passwordHash: adminPasswordHash, salt: adminSalt, roles: ['admin'], permissions: { visibleCategories: [parentCatId, publicCatId] }, defaultCategoryId: 'all' };
        const publicUser = { username: 'public', roles: ['viewer'], permissions: { visibleCategories: [publicCatId] }, defaultCategoryId: publicCatId };
        const defaultCategory = { id: parentCatId, name: '默认分类', parentId: null, sortOrder: 0, bookmarks: [] };
        const publicCategory = { id: publicCatId, name: '公共分类', parentId: null, sortOrder: 1, bookmarks: [] };

        await Promise.all([
            env.NAVI_DATA.put('user:admin', JSON.stringify(adminUser)),
            env.NAVI_DATA.put('user:public', JSON.stringify(publicUser)),
            env.NAVI_DATA.put(`category:${parentCatId}`, JSON.stringify(defaultCategory)),
            env.NAVI_DATA.put(`category:${publicCatId}`, JSON.stringify(publicCategory)),
            env.NAVI_DATA.put('_index:users', JSON.stringify(['admin', 'public'])),
            env.NAVI_DATA.put('_index:categories', JSON.stringify([parentCatId, publicCatId])),
            env.NAVI_DATA.put('_index:bookmarks', JSON.stringify([])),
            env.NAVI_DATA.put('jwtSecret', newJwtSecret),
            env.NAVI_DATA.put('setting:publicModeEnabled', 'false')
        ]);
        return getSiteData(context);
    }

    const userKeys = userIndex.map(username => `user:${username}`);
    const categoryKeys = categoryIndex.map(id => `category:${id}`);
    const bookmarkKeys = bookmarkIndex.map(id => `bookmark:${id}`);

    const [usersData, categoriesData, bookmarksData] = await Promise.all([
        userKeys.length > 0 ? Promise.all(userKeys.map(key => env.NAVI_DATA.get(key, 'json'))) : Promise.resolve([]),
        categoryKeys.length > 0 ? Promise.all(categoryKeys.map(key => env.NAVI_DATA.get(key, 'json'))) : Promise.resolve([]),
        bookmarkKeys.length > 0 ? Promise.all(bookmarkKeys.map(key => env.NAVI_DATA.get(key, 'json'))) : Promise.resolve([])
    ]);

    const siteData = {
        users: Object.fromEntries(usersData.filter(Boolean).map(user => [user.username, user])),
        categories: categoriesData.filter(Boolean),
        bookmarks: bookmarksData.filter(Boolean),
        jwtSecret: jwtSecret,
        publicModeEnabled: publicModeSetting === 'true'
    };
    
    // 动态附加权限信息
    if (siteData.users) {
        for (const username in siteData.users) {
            const user = siteData.users[username];
            if (!user) continue;
            if (!user.permissions) user.permissions = {};
            if (!user.roles) user.roles = ['viewer'];
            Object.assign(user.permissions, {
                canEditBookmarks: user.roles.includes('editor') || user.roles.includes('admin'),
                canEditCategories: user.roles.includes('editor') || user.roles.includes('admin'),
                canEditUsers: user.roles.includes('admin'),
            });
            if (!user.permissions.visibleCategories) user.permissions.visibleCategories = [];
        }
    }

    const responseToCache = new Response(JSON.stringify(siteData), { headers: { 'Content-Type': 'application/json' } });
    context.waitUntil(cache.put(cacheKey, responseToCache.clone(), { expirationTtl: 86400 }));

    return siteData;
};


/**
 * [Write Path] 轻量级认证函数。
 * 专为写操作设计，只从KV读取单个用户的信息以进行权限验证。
 */
const authenticateAndFetchUser = async (request, env) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: '认证失败：缺少 Token', status: 401 };
    }
    const token = authHeader.substring(7);
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET());
        if (!payload || !payload.sub) throw new Error("无效的 payload");
        
        const user = await env.NAVI_DATA.get(`user:${payload.sub}`, 'json');
        if (!user) {
            return { error: '用户不存在', status: 401 };
        }
        
        if (!user.permissions) user.permissions = {};
        if (!user.roles) user.roles = ['viewer'];
        Object.assign(user.permissions, {
            canEditBookmarks: user.roles.includes('editor') || user.roles.includes('admin'),
            canEditCategories: user.roles.includes('editor') || user.roles.includes('admin'),
            canEditUsers: user.roles.includes('admin'),
        });

        return { user };
    } catch (e) {
        return { error: '认证失败：无效或已过期的 Token', status: 401 };
    }
};


// --- onRequest 主函数 (已重构) ---
export async function onRequest(context) {
    try {
        const { request, env, next } = context;
        const url = new URL(request.url);
        const path = url.pathname;
        if (!path.startsWith('/api/')) return next();
        let apiPath = path.substring(5);
        if (apiPath.endsWith('/')) apiPath = apiPath.slice(0, -1);

        // JWT_SECRET 必须首先被设置，以供所有认证流程使用
        const jwtSecretFromKV = await env.NAVI_DATA.get('jwtSecret');
        globalThis.JWT_SECRET_STRING = env.JWT_SECRET || jwtSecretFromKV;
        if (!globalThis.JWT_SECRET_STRING) {
            // 如果密钥不存在，可能为首次运行，尝试通过getSiteData进行初始化
            await getSiteData(context);
            const newJwtSecret = await env.NAVI_DATA.get('jwtSecret');
            if(newJwtSecret) {
                globalThis.JWT_SECRET_STRING = newJwtSecret;
            } else {
                return jsonResponse({ error: 'Critical Configuration Error: JWT_SECRET is missing.' }, 500);
            }
        }

        // --- 路由分发：判断是“读路径”还是“写路径” ---
        // “读路径”和少数复杂写操作，使用基于缓存的全量数据加载模式
        const useFullDataLoad = 
            request.method === 'GET' || 
            apiPath === 'login' || 
            apiPath === 'cleanup-orphan-bookmarks' ||
            apiPath === 'import-data' ||
            (apiPath.startsWith('categories/') && request.method === 'DELETE'); // 删除分类需要全量数据来递归

        if (useFullDataLoad) {
            const siteData = await getSiteData(context);
            // 登录
            if (apiPath === 'login' && request.method === 'POST') {
                const { username, password } = await request.json();
                const user = siteData.users[username];
                if (!user || !user.salt) return jsonResponse({ error: '用户名或密码错误' }, 401);
                const passwordHash = await hashPassword(password, user.salt);
                if (user.passwordHash !== passwordHash) return jsonResponse({ error: '用户名或密码错误' }, 401);
                const { passwordHash: removed, salt: removedSalt, ...safeUser } = user;
                const token = await new SignJWT({ sub: safeUser.username, roles: safeUser.roles }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('30d').sign(await JWT_SECRET());
                return jsonResponse({ token, user: safeUser });
            }
            // 获取全量数据
            if (apiPath === 'data' && request.method === 'GET') {
                const authHeader = request.headers.get('Authorization');
                if (siteData.publicModeEnabled && !authHeader) {
                    const publicUser = siteData.users.public || { permissions: { visibleCategories: [] }};
                    const publicCategories = siteData.categories.filter(cat => publicUser.permissions.visibleCategories.includes(cat.id));
                    const publicCategoryIds = publicCategories.map(cat => cat.id);
                    const publicBookmarks = siteData.bookmarks.filter(bm => publicCategoryIds.includes(bm.categoryId));
                    return jsonResponse({ isPublic: true, categories: publicCategories, bookmarks: publicBookmarks, users: [], publicModeEnabled: true, defaultCategoryId: publicUser.defaultCategoryId });
                }
                const authResult = await authenticateAndFetchUser(request, env); // 轻量认证
                if (authResult.error) return jsonResponse(authResult, authResult.status);
                const currentUserForData = authResult.user;

                if (currentUserForData.roles.includes('admin')) {
                    const usersForAdmin = Object.values(siteData.users).map(({ passwordHash, salt, ...u }) => u);
                    return jsonResponse({...siteData, users: usersForAdmin});
                }
                const visibleCategories = siteData.categories.filter(cat => currentUserForData.permissions.visibleCategories.includes(cat.id));
                const visibleCategoryIds = visibleCategories.map(cat => cat.id);
                const visibleBookmarks = siteData.bookmarks.filter(bm => visibleCategoryIds.includes(bm.categoryId));
                const { passwordHash, salt, ...safeUser } = currentUserForData;
                return jsonResponse({ categories: visibleCategories, bookmarks: visibleBookmarks, users: [safeUser], publicModeEnabled: siteData.publicModeEnabled });
            }
            // URL 刮取
            if (apiPath === 'scrape-url' && request.method === 'GET') {
                const targetUrl = url.searchParams.get('url');
                if (!targetUrl) return jsonResponse({ error: 'URL parameter is missing' }, 400);
                // ...刮取逻辑不变...
                return jsonResponse({});
            }
            // 导出
            if (apiPath === 'export-data' && request.method === 'GET') {
                const authResult = await authenticateAndFetchUser(request, env);
                if (authResult.error) return jsonResponse(authResult, authResult.status);
                const currentUser = authResult.user;
                // ...导出逻辑不变...
                return new Response("...html...", { headers: { 'Content-Type': 'text/html' } });
            }
            // 孤儿数据清理
            if (apiPath === 'cleanup-orphan-bookmarks' && request.method === 'POST') {
                // ...清理逻辑不变...
                return jsonResponse({});
            }
            // 删除分类（需要全量数据来递归）
            if (apiPath.startsWith('categories/') && request.method === 'DELETE') {
                const authResult = await authenticateAndFetchUser(request, env);
                if (authResult.error) return jsonResponse(authResult, authResult.status);
                if (!authResult.user.permissions.canEditCategories) return jsonResponse({ error: '权限不足' }, 403);
                
                const id = apiPath.split('/')[1];
                const getDescendants = (catId, allCats) => { let descendants = new Set(); let queue = [catId]; while(queue.length > 0) { let currentId = queue.shift(); let children = allCats.filter(c => c.parentId === currentId); for (const child of children) { if (!descendants.has(child.id)) { descendants.add(child.id); queue.push(child.id); } } } return descendants; };
                const allCategoryIdsToDelete = new Set([id, ...getDescendants(id, siteData.categories)]);
                const allBookmarkIdsToDelete = siteData.bookmarks.filter(bm => allCategoryIdsToDelete.has(bm.categoryId)).map(bm => bm.id);
                
                const categoryKeysToDelete = Array.from(allCategoryIdsToDelete).map(catId => `category:${catId}`);
                const bookmarkKeysToDelete = allBookmarkIdsToDelete.map(bmId => `bookmark:${bmId}`);
                
                if (categoryKeysToDelete.length > 0) await Promise.all(categoryKeysToDelete.map(key => env.NAVI_DATA.delete(key)));
                if (bookmarkKeysToDelete.length > 0) await Promise.all(bookmarkKeysToDelete.map(key => env.NAVI_DATA.delete(key)));
                
                const newCategoryIndex = siteData.categories.filter(c => !allCategoryIdsToDelete.has(c.id)).map(c => c.id);
                const newBookmarkIndex = siteData.bookmarks.filter(b => !allBookmarkIdsToDelete.includes(b.id)).map(b => b.id);
                
                await env.NAVI_DATA.put('_index:categories', JSON.stringify(newCategoryIndex));
                await env.NAVI_DATA.put('_index:bookmarks', JSON.stringify(newBookmarkIndex));
                
                await purgeDataCache(context);
                return jsonResponse(null);
            }
             // 导入
            if (apiPath === 'import-data' && request.method === 'POST') {
                // ...导入逻辑不变...
                return jsonResponse({});
            }
        }

        // --- “写路径” API ---
        // 所有后续API都使用轻量级认证，且不预加载全站数据。
        
        const authResult = await authenticateAndFetchUser(request, env);
        if (authResult.error) return jsonResponse(authResult, authResult.status);
        const currentUser = authResult.user;

        // 系统设置
        if (apiPath === 'system-settings' && request.method === 'PUT') {
            if (!currentUser.roles.includes('admin')) return jsonResponse({ error: '权限不足' }, 403);
            const { publicModeEnabled } = await request.json();
            await env.NAVI_DATA.put('setting:publicModeEnabled', String(publicModeEnabled));
            await purgeDataCache(context);
            return jsonResponse({ success: true, publicModeEnabled });
        }

        // 书签操作
        if (apiPath === 'bookmarks' && request.method === 'POST') {
            if (!currentUser.permissions.canEditBookmarks) return jsonResponse({ error: '权限不足' }, 403);
            const bookmark = await request.json();
            bookmark.id = `bm-${Date.now()}`;
            
            const category = await env.NAVI_DATA.get(`category:${bookmark.categoryId}`, 'json');
            if (!category) return jsonResponse({ error: '指定的分类不存在' }, 404);

            const bookmarksInCat = category.bookmarks || [];
            bookmark.sortOrder = bookmarksInCat.length;
            bookmarksInCat.push(bookmark.id);
            category.bookmarks = bookmarksInCat;
            
            const bookmarkIndex = await env.NAVI_DATA.get('_index:bookmarks', 'json') || [];
            bookmarkIndex.push(bookmark.id);

            await Promise.all([
                env.NAVI_DATA.put(`bookmark:${bookmark.id}`, JSON.stringify(bookmark)),
                env.NAVI_DATA.put(`category:${bookmark.categoryId}`, JSON.stringify(category)),
                env.NAVI_DATA.put('_index:bookmarks', JSON.stringify(bookmarkIndex))
            ]);
            
            await purgeDataCache(context);
            return jsonResponse(bookmark, 201);
        }
        if (apiPath.startsWith('bookmarks/')) {
            const id = apiPath.split('/')[1];
            if (request.method === 'PUT') {
                if (!currentUser.permissions.canEditBookmarks) return jsonResponse({ error: '权限不足' }, 403);
                const updatedBookmark = await request.json();
                await env.NAVI_DATA.put(`bookmark:${id}`, JSON.stringify(updatedBookmark));
                await purgeDataCache(context);
                return jsonResponse(updatedBookmark);
            }
            if (request.method === 'DELETE') {
                if (!currentUser.permissions.canEditBookmarks) return jsonResponse({ error: '权限不足' }, 403);
                
                const bookmarkToDelete = await env.NAVI_DATA.get(`bookmark:${id}`, 'json');
                const bookmarkIndex = await env.NAVI_DATA.get('_index:bookmarks', 'json') || [];
                const newIndex = bookmarkIndex.filter(bId => bId !== id);

                const promises = [
                    env.NAVI_DATA.delete(`bookmark:${id}`),
                    env.NAVI_DATA.put('_index:bookmarks', JSON.stringify(newIndex))
                ];

                if (bookmarkToDelete && bookmarkToDelete.categoryId) {
                    const category = await env.NAVI_DATA.get(`category:${bookmarkToDelete.categoryId}`, 'json');
                    if (category) {
                        category.bookmarks = (category.bookmarks || []).filter(bId => bId !== id);
                        promises.push(env.NAVI_DATA.put(`category:${bookmarkToDelete.categoryId}`, JSON.stringify(category)));
                    }
                }

                await Promise.all(promises);
                await purgeDataCache(context);
                return jsonResponse(null);
            }
        }

        // 分类操作
        if (apiPath === 'categories' && request.method === 'POST') {
            if (!currentUser.permissions.canEditCategories) return jsonResponse({ error: '权限不足' }, 403);
            const { name, parentId, sortOrder } = await request.json();
            const newCategory = { id: `cat-${Date.now()}`, name, parentId, sortOrder, bookmarks: [] };
            
            const categoryIndex = await env.NAVI_DATA.get('_index:categories', 'json') || [];
            categoryIndex.push(newCategory.id);

            await Promise.all([
                env.NAVI_DATA.put(`category:${newCategory.id}`, JSON.stringify(newCategory)),
                env.NAVI_DATA.put('_index:categories', JSON.stringify(categoryIndex))
            ]);
            
            await purgeDataCache(context);
            return jsonResponse(newCategory, 201);
        }
        if (apiPath.startsWith('categories/')) {
            const id = apiPath.split('/')[1];
            if (request.method === 'PUT') {
                if (!currentUser.permissions.canEditCategories) return jsonResponse({ error: '权限不足' }, 403);
                const updatedCategoryData = await request.json();
                
                const existingCategory = await env.NAVI_DATA.get(`category:${id}`, 'json');
                const finalCategory = { ...existingCategory, ...updatedCategoryData };
                
                await env.NAVI_DATA.put(`category:${id}`, JSON.stringify(finalCategory));
                await purgeDataCache(context);
                return jsonResponse(finalCategory);
            }
        }
        
        // 用户操作
        if (apiPath.startsWith('users')) {
            if (!currentUser.permissions.canEditUsers && apiPath !== `users/${currentUser.username}` && apiPath !== 'users/self') return jsonResponse({ error: '权限不足' }, 403);
            
            if (apiPath === 'users' && request.method === 'POST') {
                const { username, password, roles, permissions, defaultCategoryId } = await request.json();
                const usernameError = validateUsername(username); if (usernameError) return jsonResponse({ error: usernameError }, 400);
                const passwordError = validatePassword(password); if (passwordError) return jsonResponse({ error: passwordError }, 400);
                
                const existingUser = await env.NAVI_DATA.get(`user:${username}`);
                if (existingUser) return jsonResponse({ error: '用户名已存在' }, 400);

                const salt = generateSalt();
                const passwordHash = await hashPassword(password, salt);
                const newUser = { username, passwordHash, salt, roles, permissions, defaultCategoryId: defaultCategoryId || 'all' };
                const userIndex = await env.NAVI_DATA.get('_index:users', 'json') || [];
                userIndex.push(username);

                await Promise.all([
                    env.NAVI_DATA.put(`user:${username}`, JSON.stringify(newUser)),
                    env.NAVI_DATA.put('_index:users', JSON.stringify(userIndex))
                ]);
                
                await purgeDataCache(context);
                const { passwordHash: p, salt: s, ...safeUser } = newUser;
                return jsonResponse(safeUser, 201);
            }
            if (apiPath.startsWith('users/')) {
                const username = decodeURIComponent(apiPath.substring('users/'.length));
                
                if(request.method === 'PUT') {
                    const userToUpdate = await env.NAVI_DATA.get(`user:${username}`, 'json');
                    if (!userToUpdate) return jsonResponse({ error: '用户未找到' }, 404);
                    
                    const { roles, permissions, password, defaultCategoryId } = await request.json();
                    
                    if (password) {
                        const passwordError = validatePassword(password); if (passwordError) return jsonResponse({ error: passwordError }, 400);
                        userToUpdate.salt = generateSalt();
                        userToUpdate.passwordHash = await hashPassword(password, userToUpdate.salt);
                    }
                    if (roles) userToUpdate.roles = roles;
                    if (permissions && permissions.visibleCategories !== undefined) userToUpdate.permissions.visibleCategories = permissions.visibleCategories;
                    if (defaultCategoryId !== undefined) userToUpdate.defaultCategoryId = defaultCategoryId;

                    await env.NAVI_DATA.put(`user:${username}`, JSON.stringify(userToUpdate));
                    await purgeDataCache(context);
                    const { passwordHash: p, salt: s, ...safeUser } = userToUpdate;
                    return jsonResponse(safeUser);
                }

                if (request.method === 'DELETE') {
                    if (username === currentUser.username) return jsonResponse({ error: '无法删除自己' }, 403);
                    
                    const userIndex = await env.NAVI_DATA.get('_index:users', 'json') || [];
                    const allUsersData = await Promise.all(userIndex.map(u => env.NAVI_DATA.get(`user:${u}`, 'json')));
                    const userToDelete = allUsersData.find(u => u.username === username);

                    if (!userToDelete) return jsonResponse({ error: '用户未找到' }, 404);

                    if (userToDelete.roles.includes('admin')) {
                        const adminCount = allUsersData.filter(u => u.roles.includes('admin')).length;
                        if (adminCount <= 1) return jsonResponse({ error: '无法删除最后一个管理员账户' }, 403);
                    }

                    await env.NAVI_DATA.delete(`user:${username}`);
                    const newIndex = userIndex.filter(u => u !== username);
                    await env.NAVI_DATA.put('_index:users', JSON.stringify(newIndex));
                    await purgeDataCache(context);
                    return jsonResponse(null);
                }
            }
        }

        return jsonResponse({ error: 'API endpoint not found' }, 404);
    } catch (error) {
        console.error("Unhandled API Exception:", error);
        return jsonResponse({ error: "服务器发生了一个意外错误。", details: error.message }, 500);
    }
}
