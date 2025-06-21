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
async function purgeDataCache() {
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
        const adminSalt = generateSalt();
        const adminPasswordHash = await hashPassword('admin123', adminSalt);
        const parentCatId = `cat-${Date.now()}`;
        const publicCatId = `cat-${Date.now() + 2}`;
        const newJwtSecret = crypto.randomUUID() + '-' + crypto.randomUUID();
        const adminUser = { username: 'admin', passwordHash: adminPasswordHash, salt: adminSalt, roles: ['admin'], permissions: { visibleCategories: [parentCatId, publicCatId] }, defaultCategoryId: 'all' };
        const publicUser = { username: 'public', roles: ['viewer'], permissions: { visibleCategories: [publicCatId] }, defaultCategoryId: publicCatId };
        const defaultCategory = { id: parentCatId, name: '默认分类', parentId: null, sortOrder: 0 };
        const publicCategory = { id: publicCatId, name: '公共分类', parentId: null, sortOrder: 1 };
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
    try {
        const { request, env, next } = context;
        const url = new URL(request.url);
        const path = url.pathname;
        if (!path.startsWith('/api/')) return next();
        let apiPath = path.substring(5);
        if (apiPath.endsWith('/')) apiPath = apiPath.slice(0, -1);

        const siteData = await getSiteData(context);
        globalThis.JWT_SECRET_STRING = env.JWT_SECRET || siteData.jwtSecret;
        if (!globalThis.JWT_SECRET_STRING) return jsonResponse({ error: 'Critical Configuration Error: JWT_SECRET is missing.' }, 500);
        
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

        // 【修复】导出数据API
        if (apiPath === 'export-data' && request.method === 'GET') {
            let categoriesToExport = []; let bookmarksToExport = [];
            if (currentUser.roles.includes('admin')) {
                categoriesToExport = siteData.categories;
                bookmarksToExport = siteData.bookmarks;
            } else {
                const visibleCategoryIds = new Set(currentUser.permissions.visibleCategories || []);
                const queue = [...visibleCategoryIds];
                 while (queue.length > 0) {
                    const parentId = queue.shift();
                    const children = siteData.categories.filter(c => c.parentId === parentId);
                    for (const child of children) { if (!visibleCategoryIds.has(child.id)) { visibleCategoryIds.add(child.id); queue.push(child.id); } }
                }
                categoriesToExport = siteData.categories.filter(c => visibleCategoryIds.has(c.id));
                bookmarksToExport = siteData.bookmarks.filter(b => visibleCategoryIds.has(b.categoryId));
            }

            const buildHtml = (categories, bookmarks) => {
                const categoryMap = new Map(categories.map(c => c && c.id ? [c.id, {...c, children: []}] : null).filter(Boolean));
                const tree = [];
                categories.forEach(c => { 
                    if (!c || !c.id) return;
                    const node = categoryMap.get(c.id); 
                    if (node && c.parentId && categoryMap.has(c.parentId)) { 
                        const parent = categoryMap.get(c.parentId); 
                        if (parent) parent.children.push(node);
                    } else if (node) { 
                        tree.push(node); 
                    } 
                });
                
                const buildDl = (nodes, visited) => {
                    if (!nodes || nodes.length === 0) return '';
                    let dlContent = '<DL><p>\n';
                    nodes.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(node => {
                        if (visited.has(node.id)) return;
                        visited.add(node.id);
                        dlContent += `    <DT><H3>${escapeHTMLExport(node.name)}</H3>\n`;
                        const childrenBookmarks = bookmarks.filter(b => b && b.categoryId === node.id).sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                        const childrenCategories = node.children;
                        if(childrenBookmarks.length > 0 || (childrenCategories && childrenCategories.length > 0)) {
                            dlContent += '    <DL><p>\n';
                            childrenBookmarks.forEach(bm => { dlContent += `        <DT><A HREF="${escapeHTMLExport(bm.url)}" ICON="${escapeHTMLExport(bm.icon || '')}">${escapeHTMLExport(bm.name)}</A>\n`; });
                            dlContent += buildDl(childrenCategories, visited);
                            dlContent += '    </DL><p>\n';
                        }
                    });
                    dlContent += '</DL><p>\n';
                    return dlContent;
                }
                return buildDl(tree, new Set());
            };
            
            let htmlContent = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n${buildHtml(categoriesToExport, bookmarksToExport)}`;
            return new Response(htmlContent, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="navicenter_bookmarks_${new Date().toISOString().split('T')[0]}.html"` } });
        }
        
        // ... (其他所有API接口逻辑保持不变) ...

        return jsonResponse({ error: 'API endpoint not found' }, 404);
    } catch (error) {
        console.error("Unhandled API Exception:", error);
        return jsonResponse({ error: "服务器发生了一个意外错误。", details: error.message }, 500);
    }
}
