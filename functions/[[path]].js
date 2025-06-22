/**
 * NaviCenter Backend for Cloudflare Workers
 * FINAL, COMPLETE AND UNABBREVIATED VERSION
 *
 * This version uses an explicit, manually triggered setup endpoint (/api/system/initialize)
 * guided by the frontend. This approach eliminates all race conditions and ensures a
 * reliable setup process while maintaining a good user experience.
 * It combines the robustness of a professional architecture with the convenience of a guided setup.
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
async function getSiteData(context) {
    const { request, env } = context;
    const cache = caches.default;
    const cacheKey = new Request(CACHE_KEY_STRING);
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) { return cachedResponse.json(); }

    let [userIndex, categoryIndex, bookmarkIndex, jwtSecret, publicModeSetting] = await Promise.all([
        env.NAVI_DATA.get('_index:users', 'json'),
        env.NAVI_DATA.get('_index:categories', 'json'),
        env.NAVI_DATA.get('_index:bookmarks', 'json'),
        env.NAVI_DATA.get('jwtSecret'),
        env.NAVI_DATA.get('setting:publicModeEnabled')
    ]);

    if (publicModeSetting === 'true' && userIndex && !userIndex.includes('public')) {
        console.log("自我修复：公共模式开启但 'public' 用户缺失，正在自动重建...");
        const allCategoryKeys = (categoryIndex || []).map(id => `category:${id}`);
        const allCategories = allCategoryKeys.length > 0 ? await Promise.all(allCategoryKeys.map(key => env.NAVI_DATA.get(key, 'json'))) : [];
        let publicCat = allCategories.find(c => c && c.name === '公共分类');
        if (!publicCat) {
            publicCat = { id: `cat-${Date.now() + 2}`, name: '公共分类', parentId: null, sortOrder: 999, bookmarks: [] };
            if (!categoryIndex) categoryIndex = [];
            categoryIndex.push(publicCat.id);
            await env.NAVI_DATA.put(`category:${publicCat.id}`, JSON.stringify(publicCat));
            await env.NAVI_DATA.put('_index:categories', JSON.stringify(categoryIndex));
        }
        const publicUser = { username: 'public', roles: ['viewer'], permissions: { visibleCategories: [publicCat.id] }, defaultCategoryId: publicCat.id };
        userIndex.push('public');
        await env.NAVI_DATA.put('user:public', JSON.stringify(publicUser));
        await env.NAVI_DATA.put('_index:users', JSON.stringify(userIndex));
        await purgeDataCache(context);
    }

    const userKeys = (userIndex || []).map(username => `user:${username}`);
    const categoryKeys = (categoryIndex || []).map(id => `category:${id}`);
    const bookmarkKeys = (bookmarkIndex || []).map(id => `bookmark:${id}`);

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
    
    if (siteData.users) { for (const username in siteData.users) { const user = siteData.users[username]; if (!user) continue; if (!user.permissions) user.permissions = {}; if (!user.roles) user.roles = ['viewer']; Object.assign(user.permissions, { canEditBookmarks: user.roles.includes('editor') || user.roles.includes('admin'), canEditCategories: user.roles.includes('editor') || user.roles.includes('admin'), canEditUsers: user.roles.includes('admin'), }); if (!user.permissions.visibleCategories) user.permissions.visibleCategories = []; } }
    const responseToCache = new Response(JSON.stringify(siteData), { headers: { 'Content-Type': 'application/json' } });
    context.waitUntil(cache.put(cacheKey, responseToCache.clone(), { expirationTtl: 86400 }));
    return siteData;
};

async function authenticateAndFetchUser(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) { return { error: '认证失败：缺少 Token', status: 401 }; }
    const token = authHeader.substring(7);
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET());
        if (!payload || !payload.sub) throw new Error("无效的 payload");
        const user = await env.NAVI_DATA.get(`user:${payload.sub}`, 'json');
        if (!user) { return { error: '用户不存在', status: 401 }; }
        if (!user.permissions) user.permissions = {};
        if (!user.roles) user.roles = ['viewer'];
        Object.assign(user.permissions, { canEditBookmarks: user.roles.includes('editor') || user.roles.includes('admin'), canEditCategories: user.roles.includes('editor') || user.roles.includes('admin'), canEditUsers: user.roles.includes('admin'), });
        return { user };
    } catch (e) {
        return { error: '认证失败：无效或已过期的 Token', status: 401 };
    }
}

/**
 * 主处理函数 (最终版 - 结合了前端引导的初始化流程)
 */
export async function onRequest(context) {
    try {
        const { request, env, next } = context;
        const url = new URL(request.url);
        const path = url.pathname;
        if (!path.startsWith('/api/')) return next();
        let apiPath = path.substring(5);
        if (apiPath.endsWith('/')) apiPath = apiPath.slice(0, -1);

        const isInitialized = await env.NAVI_DATA.get('_index:users');

        if (apiPath === 'system/initialize' && request.method === 'POST') {
            if (isInitialized) {
                return jsonResponse({ error: '系统已经初始化，请勿重复操作。' }, 409);
            }
            console.log("收到初始化请求，正在创建默认数据...");
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
            return jsonResponse({ success: true, message: '系统初始化成功！请使用默认账户 admin/admin123 登录。' });
        }

        if (!isInitialized) {
            if (apiPath === 'data' && request.method === 'GET') {
                 return jsonResponse({ not_initialized: true, users: [], categories: [], bookmarks: [], publicModeEnabled: false });
            }
            return jsonResponse({ error: '系统未初始化，无法处理请求。', code: 'NOT_INITIALIZED' }, 409);
        }
        
        globalThis.JWT_SECRET_STRING = env.JWT_SECRET || await env.NAVI_DATA.get('jwtSecret');
        if(!globalThis.JWT_SECRET_STRING) {
             return jsonResponse({ error: '严重错误：系统已初始化但JWT_SECRET丢失！' }, 500);
        }

        const useFullDataLoad = request.method === 'GET' || apiPath === 'login' || apiPath === 'cleanup-orphan-bookmarks' || apiPath === 'import-data' || (apiPath.startsWith('categories/') && request.method === 'DELETE');

        if (useFullDataLoad) {
            const siteData = await getSiteData(context);
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
            if (apiPath === 'data' && request.method === 'GET') {
                const authHeader = request.headers.get('Authorization');
                if (siteData.publicModeEnabled && !authHeader) {
                    const publicUser = siteData.users.public || { permissions: { visibleCategories: [] } };
                    const publicCategories = siteData.categories.filter(cat => publicUser.permissions.visibleCategories.includes(cat.id));
                    const publicCategoryIds = publicCategories.map(cat => cat.id);
                    const publicBookmarks = siteData.bookmarks.filter(bm => publicCategoryIds.includes(bm.categoryId));
                    return jsonResponse({ isPublic: true, categories: publicCategories, bookmarks: publicBookmarks, users: [], publicModeEnabled: true, defaultCategoryId: publicUser.defaultCategoryId });
                }
                const authResult = await authenticateAndFetchUser(request, env);
                if (authResult.error) return jsonResponse(authResult, authResult.status);
                const currentUserForData = authResult.user;
                if (currentUserForData.roles.includes('admin')) {
                    const usersForAdmin = Object.values(siteData.users).map(({ passwordHash, salt, ...u }) => u);
                    return jsonResponse({ ...siteData, users: usersForAdmin });
                }
                const visibleCategories = siteData.categories.filter(cat => currentUserForData.permissions.visibleCategories.includes(cat.id));
                const visibleCategoryIds = visibleCategories.map(cat => cat.id);
                const visibleBookmarks = siteData.bookmarks.filter(bm => visibleCategoryIds.includes(bm.categoryId));
                const { passwordHash, salt, ...safeUser } = currentUserForData;
                return jsonResponse({ categories: visibleCategories, bookmarks: visibleBookmarks, users: [safeUser], publicModeEnabled: siteData.publicModeEnabled });
            }
            const authResult = await authenticateAndFetchUser(request, env);
            if (authResult.error) return jsonResponse(authResult, authResult.status);
            const currentUser = authResult.user;
            if (apiPath === 'scrape-url' && request.method === 'GET') {
                const targetUrl = url.searchParams.get('url');
                if (!targetUrl) return jsonResponse({ error: 'URL parameter is missing' }, 400);
                const response = await fetch(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (!response.ok) throw new Error(`Fetch failed with status: ${response.status}`);
                let title = '', description = '', icon = '';
                const rewriter = new HTMLRewriter().on('title', { text(text) { title += text.text; } }).on('meta[name="description"]', { element(element) { description = element.getAttribute('content'); } }).on('link[rel*="icon"]', { element(element) { if (!icon) { let href = element.getAttribute('href'); if (href) icon = new URL(href, targetUrl).toString(); } } });
                await rewriter.transform(response).arrayBuffer();
                if (!icon) { try { const iconUrl = new URL('/favicon.ico', targetUrl); const iconCheck = await fetch(iconUrl.toString(), { method: 'HEAD' }); if(iconCheck.ok) icon = iconUrl.toString(); } catch (e) {} }
                return jsonResponse({ title: cleanTitle(title), description: description || '', icon: icon || '' });
            }
            if (apiPath === 'export-data' && request.method === 'GET') {
                let categoriesToExport = []; let bookmarksToExport = [];
                if (currentUser.roles.includes('admin')) { categoriesToExport = siteData.categories; bookmarksToExport = siteData.bookmarks;
                } else {
                    const visibleCategoryIds = new Set(currentUser.permissions.visibleCategories || []);
                    const queue = [...visibleCategoryIds];
                     while (queue.length > 0) { const parentId = queue.shift(); const children = siteData.categories.filter(c => c.parentId === parentId); for (const child of children) { if (!visibleCategoryIds.has(child.id)) { visibleCategoryIds.add(child.id); queue.push(child.id); } } }
                    categoriesToExport = siteData.categories.filter(c => visibleCategoryIds.has(c.id));
                    bookmarksToExport = siteData.bookmarks.filter(b => visibleCategoryIds.has(b.categoryId));
                }
                const buildHtml = (categories, bookmarks) => { const categoryMap = new Map(categories.map(c => c && c.id ? [c.id, {...c, children: []}] : null).filter(Boolean)); const tree = []; categories.forEach(c => { if (!c || !c.id) return; const node = categoryMap.get(c.id); if (node && c.parentId && categoryMap.has(c.parentId)) { const parent = categoryMap.get(c.parentId); if (parent) parent.children.push(node); } else if (node) { tree.push(node); } }); const buildDl = (nodes, visited) => { if (!nodes || nodes.length === 0) return ''; let html = '<DL><p>\n'; nodes.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(node => { if (visited.has(node.id)) return; visited.add(node.id); html += `    <DT><H3>${escapeHTMLExport(node.name)}</H3>\n`; const childrenBookmarks = bookmarks.filter(b => b && b.categoryId === node.id).sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)); const childrenCategories = node.children; if(childrenBookmarks.length > 0 || (childrenCategories && childrenCategories.length > 0)) { html += buildDl(childrenCategories, visited); childrenBookmarks.forEach(bm => { html += `    <DT><A HREF="${escapeHTMLExport(bm.url)}" ICON="${escapeHTMLExport(bm.icon || '')}">${escapeHTMLExport(bm.name)}</A>\n`; }); } }); html += '</DL><p>\n'; return html; }; return buildDl(tree, new Set()); };
                let htmlContent = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n${buildHtml(categoriesToExport, bookmarksToExport)}`;
                return new Response(htmlContent, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="navicenter_bookmarks_${new Date().toISOString().split('T')[0]}.html"` } });
            }
            if (apiPath === 'cleanup-orphan-bookmarks' && request.method === 'POST') {
                if (!currentUser.permissions.canEditUsers) return jsonResponse({ error: '权限不足' }, 403);
                const categoryIds = new Set(siteData.categories.map(c => c.id));
                const orphanBookmarks = siteData.bookmarks.filter(bm => !bm.categoryId || !categoryIds.has(bm.categoryId));
                if (orphanBookmarks.length === 0) return jsonResponse({ message: '没有找到需要修复的书签。', fixedCount: 0 });
                let uncategorizedCat = siteData.categories.find(c => c.name === '未分类书签' && c.parentId === null);
                if (!uncategorizedCat) {
                    uncategorizedCat = { id: `cat-${Date.now()}`, name: '未分类书签', parentId: null, sortOrder: (siteData.categories.length > 0 ? Math.max(...siteData.categories.map(c => c.sortOrder || 0)) : -1) + 1, bookmarks: [] };
                    await env.NAVI_DATA.put(`category:${uncategorizedCat.id}`, JSON.stringify(uncategorizedCat));
                    const categoryIndex = siteData.categories.map(c => c.id); categoryIndex.push(uncategorizedCat.id);
                    await env.NAVI_DATA.put('_index:categories', JSON.stringify(categoryIndex));
                }
                const fixPromises = orphanBookmarks.map(bm => { bm.categoryId = uncategorizedCat.id; return env.NAVI_DATA.put(`bookmark:${bm.id}`, JSON.stringify(bm)); });
                await Promise.all(fixPromises);
                await purgeDataCache(context);
                return jsonResponse({ message: `成功修复了 ${orphanBookmarks.length} 个书签。`, fixedCount: orphanBookmarks.length });
            }
            if (apiPath.startsWith('categories/') && request.method === 'DELETE') {
                if (!currentUser.permissions.canEditCategories) return jsonResponse({ error: '权限不足' }, 403);
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
            if (apiPath === 'import-data' && request.method === 'POST') {
                if (!currentUser.permissions.canEditCategories || !currentUser.permissions.canEditBookmarks) return jsonResponse({ error: '权限不足' }, 403);
                const { newCategories, newBookmarks } = await request.json();
                if (newCategories && newCategories.length > 0) {
                    const categoriesToPut = newCategories.map(c => { c.bookmarks = c.bookmarks || []; return env.NAVI_DATA.put(`category:${c.id}`, JSON.stringify(c)); });
                    await Promise.all(categoriesToPut);
                    const latestCategoryIndex = siteData.categories.map(c => c.id);
                    const newCategoryIds = newCategories.map(c => c.id).filter(id => !latestCategoryIndex.includes(id));
                    await env.NAVI_DATA.put('_index:categories', JSON.stringify([...latestCategoryIndex, ...newCategoryIds]));
                }
                if (newBookmarks && newBookmarks.length > 0) {
                    const bookmarkPuts = newBookmarks.map(b => env.NAVI_DATA.put(`bookmark:${b.id}`, JSON.stringify(b)));
                    await Promise.all(bookmarkPuts);
                    const latestBookmarkIndex = siteData.bookmarks.map(b => b.id);
                    const newBookmarkIds = newBookmarks.map(b => b.id).filter(id => !latestBookmarkIndex.includes(id));
                    await env.NAVI_DATA.put('_index:bookmarks', JSON.stringify([...latestBookmarkIndex, ...newBookmarkIds]));
                }
                await purgeDataCache(context);
                return jsonResponse({ success: true, importedCategories: newCategories.length, importedBookmarks: newBookmarks.length });
            }
            return jsonResponse({ error: 'API endpoint not found in read path.' }, 404);
        } else {
            const authResult = await authenticateAndFetchUser(request, env);
            if (authResult.error) return jsonResponse(authResult, authResult.status);
            const currentUser = authResult.user;
            if (apiPath === 'system-settings' && request.method === 'PUT') {
                if (!currentUser.roles.includes('admin')) return jsonResponse({ error: '权限不足' }, 403);
                const { publicModeEnabled } = await request.json();
                await env.NAVI_DATA.put('setting:publicModeEnabled', String(publicModeEnabled));
                await purgeDataCache(context);
                return jsonResponse({ success: true, publicModeEnabled });
            }
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
                await Promise.all([ env.NAVI_DATA.put(`bookmark:${bookmark.id}`, JSON.stringify(bookmark)), env.NAVI_DATA.put(`category:${bookmark.categoryId}`, JSON.stringify(category)), env.NAVI_DATA.put('_index:bookmarks', JSON.stringify(bookmarkIndex)) ]);
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
                    const promises = [ env.NAVI_DATA.delete(`bookmark:${id}`), env.NAVI_DATA.put('_index:bookmarks', JSON.stringify(newIndex)) ];
                    if (bookmarkToDelete && bookmarkToDelete.categoryId) {
                        const category = await env.NAVI_DATA.get(`category:${bookmarkToDelete.categoryId}`, 'json');
                        if (category) { category.bookmarks = (category.bookmarks || []).filter(bId => bId !== id); promises.push(env.NAVI_DATA.put(`category:${bookmarkToDelete.categoryId}`, JSON.stringify(category))); }
                    }
                    await Promise.all(promises);
                    await purgeDataCache(context);
                    return jsonResponse(null);
                }
            }
            if (apiPath === 'categories' && request.method === 'POST') {
                if (!currentUser.permissions.canEditCategories) return jsonResponse({ error: '权限不足' }, 403);
                const { name, parentId, sortOrder } = await request.json();
                const newCategory = { id: `cat-${Date.now()}`, name, parentId, sortOrder, bookmarks: [] };
                const categoryIndex = await env.NAVI_DATA.get('_index:categories', 'json') || [];
                categoryIndex.push(newCategory.id);
                await Promise.all([ env.NAVI_DATA.put(`category:${newCategory.id}`, JSON.stringify(newCategory)), env.NAVI_DATA.put('_index:categories', JSON.stringify(categoryIndex)) ]);
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
            if (apiPath.startsWith('users')) {
                if (!currentUser.permissions.canEditUsers && apiPath !== `users/${currentUser.username}` && apiPath !== 'users/self') { return jsonResponse({ error: '权限不足' }, 403); }
                if (apiPath === 'users' && request.method === 'POST') {
                    if (!currentUser.permissions.canEditUsers) return jsonResponse({ error: '权限不足' }, 403);
                    const { username, password, roles, permissions, defaultCategoryId } = await request.json();
                    if (username === 'public') { return jsonResponse({ error: '用户名 "public" 是系统保留名称，无法创建。' }, 400); }
                    const usernameError = validateUsername(username); if (usernameError) return jsonResponse({ error: usernameError }, 400);
                    const passwordError = validatePassword(password); if (passwordError) return jsonResponse({ error: passwordError }, 400);
                    const existingUser = await env.NAVI_DATA.get(`user:${username}`);
                    if (existingUser) return jsonResponse({ error: '用户名已存在' }, 400);
                    const salt = generateSalt();
                    const passwordHash = await hashPassword(password, salt);
                    const newUser = { username, passwordHash, salt, roles, permissions, defaultCategoryId: defaultCategoryId || 'all' };
                    const userIndex = await env.NAVI_DATA.get('_index:users', 'json') || [];
                    userIndex.push(username);
                    await Promise.all([ env.NAVI_DATA.put(`user:${username}`, JSON.stringify(newUser)), env.NAVI_DATA.put('_index:users', JSON.stringify(userIndex)) ]);
                    await purgeDataCache(context);
                    const { passwordHash: p, salt: s, ...safeUser } = newUser;
                    return jsonResponse(safeUser, 201);
                }
                if (apiPath.startsWith('users/')) {
                    let username = decodeURIComponent(apiPath.substring('users/'.length));
                    const isSelf = username === 'self';
                    if (isSelf) { username = currentUser.username; }
                    if(request.method === 'PUT') {
                        const userToManage = await env.NAVI_DATA.get(`user:${username}`, 'json');
                        if (!userToManage) return jsonResponse({ error: '用户未找到' }, 404);
                        if (isSelf) {
                             const { defaultCategoryId } = await request.json();
                             if (defaultCategoryId !== undefined) userToManage.defaultCategoryId = defaultCategoryId;
                        } else {
                            if (!currentUser.permissions.canEditUsers) return jsonResponse({ error: '权限不足' }, 403);
                            const { roles, permissions, password, defaultCategoryId } = await request.json();
                            if (password) { const passwordError = validatePassword(password); if (passwordError) return jsonResponse({ error: passwordError }, 400); userToManage.salt = generateSalt(); userToManage.passwordHash = await hashPassword(password, userToManage.salt); }
                            if (roles) userToManage.roles = roles;
                            if (permissions && permissions.visibleCategories !== undefined) userToManage.permissions.visibleCategories = permissions.visibleCategories;
                            if (defaultCategoryId !== undefined) userToManage.defaultCategoryId = defaultCategoryId;
                        }
                        await env.NAVI_DATA.put(`user:${username}`, JSON.stringify(userToManage));
                        await purgeDataCache(context);
                        const { passwordHash: p, salt: s, ...safeUser } = userToManage;
                        return jsonResponse(safeUser);
                    }
                    if (request.method === 'DELETE') {
                        if (!currentUser.permissions.canEditUsers) return jsonResponse({ error: '权限不足' }, 403);
                        if (username === currentUser.username) return jsonResponse({ error: '无法删除自己' }, 403);
                        if (username === 'public') {
                            const publicMode = await env.NAVI_DATA.get('setting:publicModeEnabled');
                            if (publicMode === 'true') { return jsonResponse({ error: '公共模式已开启，无法删除 public 用户。请先在系统设置中关闭公共模式。' }, 403); }
                        }
                        const userIndex = await env.NAVI_DATA.get('_index:users', 'json') || [];
                        const userToDelete = await env.NAVI_DATA.get(`user:${username}`, 'json');
                        if (!userToDelete) return jsonResponse({ error: '用户未找到' }, 404);
                        if (userToDelete.roles.includes('admin')) {
                            const allUsersData = await Promise.all(userIndex.map(u => env.NAVI_DATA.get(`user:${u}`, 'json')));
                            const adminCount = allUsersData.filter(u => u && u.roles.includes('admin')).length;
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
        }
        return jsonResponse({ error: 'API endpoint not found.' }, 404);

    } catch (error) {
        console.error("Unhandled API Exception:", error);
        return jsonResponse({ error: "服务器发生了一个意外错误。", details: error.message }, 500);
    }
}
