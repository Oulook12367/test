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

const cleanTitle = (fullTitle) => {
    if (!fullTitle) return '';
    const cleaned = fullTitle.split(/ \| | - /)[0].trim();
    return cleaned || fullTitle;
};

// --- Data Fetching & Permission Hydration ---
const getSiteData = async (env) => {
    let data = await env.NAVI_DATA.get('data', { type: 'json' });

    if (!data) {
        console.log("First run detected. Initializing site data...");
        const adminSalt = generateSalt();
        const adminPasswordHash = await hashPassword('admin123', adminSalt);
        const parentCatId = `cat-${Date.now()}`;
        const publicCatId = `cat-${Date.now() + 2}`;
        
        data = {
            version: new Date().toISOString(),
            users: {
                'admin': {
                    username: 'admin',
                    passwordHash: adminPasswordHash,
                    salt: adminSalt,
                    roles: ['admin'],
                    permissions: { visibleCategories: [parentCatId, publicCatId] },
                    defaultCategoryId: 'all'
                },
                'public': {
                    username: 'public',
                    roles: ['viewer'],
                    permissions: { visibleCategories: [publicCatId] },
                    defaultCategoryId: publicCatId
                }
            },
            categories: [
                { id: parentCatId, name: '默认分类', parentId: null, sortOrder: 0 },
                { id: publicCatId, name: '公共分类', parentId: null, sortOrder: 1 }
            ],
            bookmarks: []
        };
        
        if (!env.JWT_SECRET) {
            console.log("JWT_SECRET not found in environment. Generating and saving a new one.");
            data.jwtSecret = crypto.randomUUID() + '-' + crypto.randomUUID();
        }

        await env.NAVI_DATA.put('data', JSON.stringify(data));
    } else if (!data.version) {
        data.version = new Date().toISOString();
        await env.NAVI_DATA.put('data', JSON.stringify(data));
    }

    if (data.users) {
        for (const username in data.users) {
            const user = data.users[username];
            if (!user.permissions) user.permissions = {};
            if (!user.roles) user.roles = ['viewer'];
            if (!user.defaultCategoryId) user.defaultCategoryId = 'all';
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
    const currentDataStr = await env.NAVI_DATA.get('data');
    if (currentDataStr) {
        const timestamp = new Date().toISOString();
        await env.NAVI_BACKUPS.put(`backup-${timestamp}`, currentDataStr);
        const backups = await env.NAVI_BACKUPS.list({ prefix: "backup-" });
        if (backups.keys.length > 100) {
            const sortedKeys = backups.keys.sort((a, b) => a.name.localeCompare(b.name));
            for (let i = 0; i < sortedKeys.length - 100; i++) {
                await env.NAVI_BACKUPS.delete(sortedKeys[i].name);
            }
        }
    }
    data.version = new Date().toISOString();
    await env.NAVI_DATA.put('data', JSON.stringify(data));
    return data.version;
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
    
    const publicModeValue = env.PUBLIC_MODE_ENABLED;
    if (publicModeValue !== 'true' && publicModeValue !== 'false') {
        return new Response('<h1>Configuration Error</h1><p>The <code>PUBLIC_MODE_ENABLED</code> environment variable must be set to <code>"true"</code> or <code>"false"</code>.</p>', { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    if (!path.startsWith('/api/')) {
        return next();
    }
    
    let apiPath = path.substring(5);
    if (apiPath.endsWith('/')) {
        apiPath = apiPath.slice(0, -1);
    }
    
    if (apiPath === 'login' && request.method === 'POST') {
        const siteData = await getSiteData(env);
        globalThis.JWT_SECRET_STRING = env.JWT_SECRET || siteData.jwtSecret;
        if (!globalThis.JWT_SECRET_STRING) return jsonResponse({ error: 'Critical Configuration Error: JWT_SECRET is missing.' }, 500);
        
        const { username, password } = await request.json();
        if (username.toLowerCase() === 'public') return jsonResponse({ error: '此为保留账户，禁止登录。' }, 403);
        const user = siteData.users[username];
        if (!user || !user.salt) return jsonResponse({ error: '用户名或密码错误' }, 401);
        const passwordHash = await hashPassword(password, user.salt);
        if (user.passwordHash !== passwordHash) return jsonResponse({ error: '用户名或密码错误' }, 401);
        
        const { passwordHash: removed, salt: removedSalt, ...safeUser } = user;
        const token = await new SignJWT({ sub: safeUser.username, roles: safeUser.roles }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1d').sign(await JWT_SECRET());
        return jsonResponse({ token, user: safeUser });
    }

    if (apiPath === 'data' && request.method === 'GET' && !request.headers.has('Authorization') && env.PUBLIC_MODE_ENABLED === 'true') {
        const siteData = await getSiteData(env);
        const publicUser = siteData.users.public || { permissions: { visibleCategories: [] }};
        const publicCategories = siteData.categories.filter(cat => publicUser.permissions.visibleCategories.includes(cat.id));
        const publicCategoryIds = publicCategories.map(cat => cat.id);
        const publicBookmarks = siteData.bookmarks.filter(bm => publicCategoryIds.includes(bm.categoryId));
        return jsonResponse({ isPublic: true, categories: publicCategories, bookmarks: publicBookmarks, users: [], publicModeEnabled: true, defaultCategoryId: publicUser.defaultCategoryId });
    }
    
    const siteDataForAuth = await getSiteData(env);
    globalThis.JWT_SECRET_STRING = env.JWT_SECRET || siteDataForAuth.jwtSecret;
    if (!globalThis.JWT_SECRET_STRING) return jsonResponse({ error: 'Critical Configuration Error: JWT_SECRET is missing.' }, 500);

    const authResult = await authenticateRequest(request, siteDataForAuth);
    if (authResult.error) return jsonResponse(authResult, authResult.status);
    const currentUser = authResult.user;

    if (request.method === 'GET') {
        const siteData = await getSiteData(env);
        siteData.publicModeEnabled = env.PUBLIC_MODE_ENABLED === 'true';
        const headers = { 'ETag': siteData.version };
        
        if (apiPath === 'data') {
            if (currentUser.roles.includes('admin')) {
                const usersForAdmin = Object.values(siteData.users).map(({ passwordHash, salt, ...u }) => u);
                return jsonResponse({...siteData, users: usersForAdmin}, 200, headers);
            }
            const visibleCategories = siteData.categories.filter(cat => currentUser.permissions.visibleCategories.includes(cat.id));
            const visibleCategoryIds = visibleCategories.map(cat => cat.id);
            const visibleBookmarks = siteData.bookmarks.filter(bm => visibleCategoryIds.includes(bm.categoryId));
            const { passwordHash, salt, ...safeUser } = currentUser;
            return jsonResponse({ categories: visibleCategories, bookmarks: visibleBookmarks, users: [safeUser], publicModeEnabled: siteData.publicModeEnabled, version: siteData.version }, 200, headers);
        }

        if (apiPath === 'scrape-url') {
            const targetUrl = url.searchParams.get('url');
            if (!targetUrl) return jsonResponse({ error: 'URL parameter is missing' }, 400);
            try {
                const response = await fetch(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (!response.ok) throw new Error(`Fetch failed with status: ${response.status}`);
                let title = '', description = '', icon = '';
                const rewriter = new HTMLRewriter()
                    .on('title', { text(text) { title += text.text; }})
                    .on('meta[name="description"]', { element(element) { description = element.getAttribute('content'); }})
                    .on('link[rel*="icon"]', {
                        element(element) {
                            if (!icon) {
                               let href = element.getAttribute('href');
                               if (href) icon = new URL(href, targetUrl).toString();
                            }
                        },
                    });
                await rewriter.transform(response).arrayBuffer();
                if (!icon) {
                     try {
                        const iconUrl = new URL('/favicon.ico', targetUrl);
                        const iconCheck = await fetch(iconUrl.toString(), { method: 'HEAD' });
                        if(iconCheck.ok) icon = iconUrl.toString();
                     } catch (e) { /* ignore */ }
                }
                return jsonResponse({ title: cleanTitle(title), description: description || '', icon: icon || '' });
            } catch (error) {
                console.error(`Scraping failed for ${targetUrl}:`, error);
                return jsonResponse({ error: `Could not fetch or parse URL: ${error.message}` }, 500);
            }
        }
    }

    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
        
        const dataToModify = await env.NAVI_DATA.get('data', { type: 'json' });
        if (!dataToModify) return jsonResponse({ error: "Data store not initialized, cannot save." }, 500);

        const clientVersion = request.headers.get('if-match');
        if (clientVersion && clientVersion !== dataToModify.version) {
            return jsonResponse({ error: '数据版本冲突，请刷新页面后重试。' }, 412);
        }

        if (apiPath === 'data' && request.method === 'PATCH') {
            if (!currentUser.permissions.canEditCategories && !currentUser.permissions.canEditBookmarks) {
                return jsonResponse({ error: '权限不足' }, 403);
            }
            const dataToUpdate = await request.json();
            if (dataToUpdate.categories) dataToModify.categories = dataToUpdate.categories;
            if (dataToUpdate.bookmarks) dataToModify.bookmarks = dataToUpdate.bookmarks;
            const newVersion = await saveSiteData(env, dataToModify);
            return jsonResponse({ success: true, version: newVersion }, 200, { 'ETag': newVersion });
        }
        
        if (apiPath === 'bookmarks' && request.method === 'POST') {
            if (!currentUser.permissions.canEditBookmarks) return jsonResponse({ error: '权限不足' }, 403);
            const bookmark = await request.json();
            if (!currentUser.roles.includes('admin') && !currentUser.permissions.visibleCategories.includes(bookmark.categoryId)) return jsonResponse({ error: '无权在此分类下添加书签' }, 403);
            bookmark.id = `bm-${Date.now()}`;
            if (typeof bookmark.sortOrder === 'undefined' || bookmark.sortOrder === null) {
                const bookmarksInCategory = dataToModify.bookmarks.filter(b => b.categoryId === bookmark.categoryId);
                const maxOrder = bookmarksInCategory.length > 0 ? Math.max(...bookmarksInCategory.map(b => b.sortOrder || 0)) : -1;
                bookmark.sortOrder = maxOrder + 1;
            }
            dataToModify.bookmarks.push(bookmark);
            const newVersion = await saveSiteData(env, dataToModify);
            return jsonResponse(bookmark, 201, { 'ETag': newVersion });
        }

        if (apiPath.startsWith('bookmarks/')) {
            const id = apiPath.split('/')[1];
            const bookmarkIndex = dataToModify.bookmarks.findIndex(bm => bm.id === id);
            if (bookmarkIndex === -1) return jsonResponse({ error: '书签未找到' }, 404);
            if (!currentUser.roles.includes('admin') && !currentUser.permissions.visibleCategories.includes(dataToModify.bookmarks[bookmarkIndex].categoryId)) return jsonResponse({ error: '权限不足' }, 403);
            
            if (request.method === 'PUT') {
                if (!currentUser.permissions.canEditBookmarks) return jsonResponse({ error: '权限不足' }, 403);
                const updatedBookmarkData = await request.json();
                dataToModify.bookmarks[bookmarkIndex] = { ...dataToModify.bookmarks[bookmarkIndex], ...updatedBookmarkData };
                const newVersion = await saveSiteData(env, dataToModify);
                return jsonResponse(dataToModify.bookmarks[bookmarkIndex], 200, { 'ETag': newVersion });
            }
            if (request.method === 'DELETE') {
                if (!currentUser.permissions.canEditBookmarks) return jsonResponse({ error: '权限不足' }, 403);
                dataToModify.bookmarks.splice(bookmarkIndex, 1);
                const newVersion = await saveSiteData(env, dataToModify);
                return jsonResponse(null, 204, { 'ETag': newVersion });
            }
        }

        // --- [核心修复] 补全用户管理的所有逻辑 ---
         if (apiPath === 'users/self' && request.method === 'PUT') {
            const { defaultCategoryId } = await request.json();
            if (typeof defaultCategoryId === 'undefined') return jsonResponse({ error: '未提供更新数据' }, 400);
            const userToUpdate = dataToModify.users[currentUser.username];
            if (userToUpdate) {
                userToUpdate.defaultCategoryId = defaultCategoryId;
                const newVersion = await saveSiteData(env, dataToModify);
                const { passwordHash, salt, ...safeUser } = userToUpdate;
              // --- 修改 START ---
              // 确保返回格式一致
                return jsonResponse({ user: safeUser, version: newVersion }, 200, { 'ETag': newVersion });
              // --- 修改 END ---
            }
            return jsonResponse({ error: '用户未找到'}, 404);
        }
        
        if (apiPath.startsWith('users')) {
            if (!currentUser.permissions.canEditUsers) return jsonResponse({ error: '权限不足' }, 403);
            
            if (request.method === 'POST' && apiPath === 'users') {
                const { username: newUsername, password, roles, permissions, defaultCategoryId } = await request.json();
                if (!newUsername || !password || dataToModify.users[newUsername]) return jsonResponse({ error: '用户名无效或已存在' }, 400);
                const salt = generateSalt();
                const passwordHash = await hashPassword(password, salt);
                dataToModify.users[newUsername] = { username: newUsername, passwordHash, salt, roles, permissions, defaultCategoryId: defaultCategoryId || 'all' };
                const newVersion = await saveSiteData(env, dataToModify);

                const { passwordHash: p, salt: s, ...newUser } = dataToModify.users[newUsername];
                const responsePayload = { user: newUser, version: newVersion };
                return jsonResponse(responsePayload, 201, { 'ETag': newVersion });
            }

            const userPathMatch = apiPath.match(/^users\/(.+)$/);
            if (userPathMatch) {
                const username = decodeURIComponent(userPathMatch[1]);
                if (username !== 'self') {
                    const userToManage = dataToModify.users[username];
                    if (!userToManage) return jsonResponse({ error: `用户 '${username}' 未找到` }, 404);

                    if (request.method === 'PUT') {
                        const { roles, permissions, password, defaultCategoryId } = await request.json();
                        if (username === 'public') {
                            if (permissions && typeof permissions.visibleCategories !== 'undefined') userToManage.permissions.visibleCategories = permissions.visibleCategories;
                            userToManage.roles = ['viewer'];
                        } else {
                            if (roles) userToManage.roles = roles;
                            if (permissions) userToManage.permissions.visibleCategories = permissions.visibleCategories;
                            if (typeof defaultCategoryId !== 'undefined') userToManage.defaultCategoryId = defaultCategoryId;
                            if (password) {
                                userToManage.salt = generateSalt();
                                userToManage.passwordHash = await hashPassword(password, userToManage.salt);
                            }
                        }
                        const newVersion = await saveSiteData(env, dataToModify);
                        const { passwordHash, salt, ...updatedUser } = userToManage;
                      // 修正此处返回格式，使其与前端预期一致
                        return jsonResponse({ user: updatedUser, version: newVersion }, 200, { 'ETag': newVersion });
                        // --- 修改 END ---
                    }

                    if (request.method === 'DELETE') {
                        if (username === 'public') return jsonResponse({ error: '公共账户为系统保留账户，禁止删除。' }, 403);
                        if (username === currentUser.username) return jsonResponse({ error: '无法删除自己' }, 403);
                        if (userToManage.roles.includes('admin')) {
                            const adminCount = Object.values(dataToModify.users).filter(u => u.roles.includes('admin')).length;
                            if (adminCount <= 1) return jsonResponse({ error: '无法删除最后一个管理员账户' }, 403);
                        }
                        delete dataToModify.users[username];
                        const newVersion = await saveSiteData(env, dataToModify);
                        return jsonResponse(null, 204, { 'ETag': newVersion });
                    }
                }
            }
        }
    }

    return jsonResponse({ error: 'API endpoint not found or method not allowed' }, 404);
}
