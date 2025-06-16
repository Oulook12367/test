import { SignJWT, jwtVerify } from 'jose';

// --- 安全与工具函数 (保持不变) ---
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
    const defaultHeaders = { 'Content-Type': 'application/json;charset=UTF-8' };
    if (data === null) {
        return new Response(null, { status: 204, headers: { ...defaultHeaders, ...headers } });
    }
    return new Response(JSON.stringify(data), { status, headers: { ...defaultHeaders, ...headers } });
};


// --- 缓存处理函数 ---
async function purgeDataCache(context) {
    try {
        const cache = caches.default;
        const cacheKey = new Request(new URL(context.request.url).origin + '/api/data_cache_key');
        await cache.delete(cacheKey);
        console.log("数据缓存已清除。");
    } catch (e) {
        console.error("清除缓存失败:", e);
    }
}


// --- 数据获取与认证函数 ---
const getSiteData = async (context) => {
    const { request, env } = context;
    const cache = caches.default;
    const cacheKey = new Request(new URL(request.url).origin + '/api/data_cache_key');

    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
        console.log("缓存命中！直接从Cache API返回数据。");
        return cachedResponse.json();
    }

    console.log("缓存未命中。正在从KV获取数据...");
    const [userIndex, categoryIndex, bookmarkIndex, jwtSecret] = await Promise.all([
        env.NAVI_DATA.get('_index:users', 'json').then(res => res || null),
        env.NAVI_DATA.get('_index:categories', 'json').then(res => res || []),
        env.NAVI_DATA.get('_index:bookmarks', 'json').then(res => res || []),
        env.NAVI_DATA.get('jwtSecret')
    ]);

    if (userIndex === null) {
        console.log("首次运行检测到，正在初始化原子数据...");
        // ... (首次运行初始化逻辑不变) ...
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
        jwtSecret: jwtSecret
    };
    
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
    context.waitUntil(cache.put(cacheKey, responseToCache.clone(), { expirationTtl: 3600 }));
    
    return siteData;
};

const authenticateRequest = async (request, siteData) => {
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

// --- onRequest 主函数 ---
export async function onRequest(context) {
    // 【核心修复】为所有API请求添加全局错误处理
    try {
        const { request, env, next } = context;
        const url = new URL(request.url);
        const path = url.pathname;

        if (!path.startsWith('/api/')) {
            return next();
        }

        const publicModeValue = env.PUBLIC_MODE_ENABLED;
        if (publicModeValue !== 'true' && publicModeValue !== 'false') {
            return new Response('<h1>Configuration Error</h1>', { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        let apiPath = path.substring(5);
        if (apiPath.endsWith('/')) apiPath = apiPath.slice(0, -1);

        const siteData = await getSiteData(context);
        globalThis.JWT_SECRET_STRING = env.JWT_SECRET || siteData.jwtSecret;
        if (!globalThis.JWT_SECRET_STRING) {
            return jsonResponse({ error: 'Critical Configuration Error: JWT_SECRET is missing.' }, 500);
        }
        
        if (apiPath === 'scrape-url') {
            const authResultForScrape = await authenticateRequest(request, siteData);
            if (authResultForScrape.error) return jsonResponse(authResultForScrape, authResultForScrape.status);
            const targetUrl = url.searchParams.get('url');
            if (!targetUrl) return jsonResponse({ error: 'URL parameter is missing' }, 400);
            const response = await fetch(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!response.ok) throw new Error(`Fetch failed with status: ${response.status}`);
            let title = '', description = '', icon = '';
            const rewriter = new HTMLRewriter()
                .on('title', { text(text) { title += text.text; }})
                .on('meta[name="description"]', { element(element) { description = element.getAttribute('content'); }})
                .on('link[rel*="icon"]', { element(element) { if (!icon) { let href = element.getAttribute('href'); if (href) icon = new URL(href, targetUrl).toString(); } } });
            await rewriter.transform(response).arrayBuffer();
            if (!icon) { try { const iconUrl = new URL('/favicon.ico', targetUrl); const iconCheck = await fetch(iconUrl.toString(), { method: 'HEAD' }); if(iconCheck.ok) icon = iconUrl.toString(); } catch (e) {} }
            return jsonResponse({ title: cleanTitle(title), description: description || '', icon: icon || '' });
        }

        if (apiPath === 'login' && request.method === 'POST') {
            const { username, password } = await request.json();
            const user = siteData.users[username];
            if (!user || !user.salt) return jsonResponse({ error: '用户名或密码错误' }, 401);
            const passwordHash = await hashPassword(password, user.salt);
            if (user.passwordHash !== passwordHash) return jsonResponse({ error: '用户名或密码错误' }, 401);
            const { passwordHash: removed, salt: removedSalt, ...safeUser } = user;
            const token = await new SignJWT({ sub: safeUser.username, roles: safeUser.roles }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1d').sign(await JWT_SECRET());
            return jsonResponse({ token, user: safeUser });
        }

        if (apiPath === 'data' && request.method === 'GET') {
            const authHeader = request.headers.get('Authorization');
            siteData.publicModeEnabled = env.PUBLIC_MODE_ENABLED === 'true';
            if (siteData.publicModeEnabled && !authHeader) {
                const publicUser = siteData.users.public || { permissions: { visibleCategories: [] }};
                const publicCategories = siteData.categories.filter(cat => publicUser.permissions.visibleCategories.includes(cat.id));
                const publicCategoryIds = publicCategories.map(cat => cat.id);
                const publicBookmarks = siteData.bookmarks.filter(bm => publicCategoryIds.includes(bm.categoryId));
                return jsonResponse({ isPublic: true, categories: publicCategories, bookmarks: publicBookmarks, users: [], publicModeEnabled: true, defaultCategoryId: publicUser.defaultCategoryId });
            }
            const authResultForData = await authenticateRequest(request, siteData);
            if (authResultForData.error) return jsonResponse(authResultForData, authResultForData.status);
            const currentUserForData = authResultForData.user;
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

        const authResult = await authenticateRequest(request, siteData);
        if (authResult.error) return jsonResponse(authResult, authResult.status);
        const currentUser = authResult.user;

        if (apiPath === 'bookmarks' && request.method === 'POST') {
            if (!currentUser.permissions.canEditBookmarks) return jsonResponse({ error: '权限不足' }, 403);
            const bookmark = await request.json();
            bookmark.id = `bm-${Date.now()}`;
            const bookmarksInCategory = siteData.bookmarks.filter(b => b.categoryId === bookmark.categoryId);
            const maxOrder = bookmarksInCategory.length > 0 ? Math.max(...bookmarksInCategory.map(b => b.sortOrder || 0)) : -1;
            bookmark.sortOrder = maxOrder + 1;
            await env.NAVI_DATA.put(`bookmark:${bookmark.id}`, JSON.stringify(bookmark));
            const latestBookmarkIndex = await env.NAVI_DATA.get('_index:bookmarks', 'json') || [];
            if (!latestBookmarkIndex.includes(bookmark.id)) {
                latestBookmarkIndex.push(bookmark.id);
                await env.NAVI_DATA.put('_index:bookmarks', JSON.stringify(latestBookmarkIndex));
            }
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
                await env.NAVI_DATA.delete(`bookmark:${id}`);
                const newIndex = siteData.bookmarks.filter(b => b.id !== id).map(b => b.id);
                await env.NAVI_DATA.put('_index:bookmarks', JSON.stringify(newIndex));
                await purgeDataCache(context);
                return jsonResponse(null);
            }
        }

        // ... 其他API接口 ...

        return jsonResponse({ error: 'API endpoint not found' }, 404);

    } catch (error) {
        // 全局错误捕获
        console.error("Unhandled API Exception:", error);
        return jsonResponse({
            error: "服务器发生了一个意外错误。",
            details: error.message,
            stack: error.stack // 在开发中返回堆栈信息以便调试
        }, 500);
    }
}
