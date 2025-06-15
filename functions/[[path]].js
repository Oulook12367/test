import { SignJWT, jwtVerify } from 'jose';

// --- Security & Hashing Helpers ---
const JWT_SECRET = () => new TextEncoder().encode(globalThis.JWT_SECRET_STRING || 'default-secret-for-local-dev');

const generateSalt = (length = 16) => {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
};

const hashPassword = async (password, salt) => {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// --- Data Management ---
const getSiteData = async (env) => {
    let data = await env.NAVI_DATA.get('data', { type: 'json' });
    if (!data) {
        console.log("First run detected. Initializing site data...");
        const adminSalt = generateSalt();
        const adminPasswordHash = await hashPassword('admin123', adminSalt);
        const parentCatId = `cat-${Date.now()}`;
        const publicCatId = `cat-${Date.now() + 1}`;
        data = {
            version: new Date().toISOString(),
            users: {
                'admin': { username: 'admin', passwordHash: adminPasswordHash, salt: adminSalt, roles: ['admin'], permissions: { visibleCategories: [parentCatId, publicCatId] }, defaultCategoryId: 'all' },
                'public': { username: 'public', roles: ['viewer'], permissions: { visibleCategories: [publicCatId] }, defaultCategoryId: publicCatId }
            },
            categories: [
                { id: parentCatId, name: '默认分类', parentId: null, sortOrder: 0 },
                { id: publicCatId, name: '公共分类', parentId: null, sortOrder: 1 }
            ],
            bookmarks: []
        };
        await env.NAVI_DATA.put('data', JSON.stringify(data));
    }
    return data;
};

const saveSiteData = async (env, data) => {
    data.version = new Date().toISOString();
    await env.NAVI_DATA.put('data', JSON.stringify(data));
    return data.version;
};

// --- Auth & Response Helpers ---
const authenticateRequest = async (request, siteData) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return { error: '认证失败：缺少 Token', status: 401 };
    const token = authHeader.substring(7);
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET());
        const user = siteData.users[payload.sub];
        if (!user) throw new Error("用户不存在");
        // Add full permissions object for backend use
        user.permissions = {
             canEditUsers: user.roles.includes('admin'),
             ...user.permissions
        };
        return { user };
    } catch (e) {
        return { error: '认证失败：无效或已过期的 Token', status: 401 };
    }
};

const jsonResponse = (data, status = 200, headers = {}) => {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json;charset=UTF-8', ...headers }
    });
};

const errorResponse = (message, status = 400) => {
    return jsonResponse({ error: message }, status);
};


// --- Main Request Handler ---
export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith('/api/')) return next();

    globalThis.JWT_SECRET_STRING = env.JWT_SECRET || 'default-secret-for-local-dev';
    const apiPath = path.substring(5).replace(/\/$/, "");

    // --- Public Routes ---
    if (apiPath === 'login' && request.method === 'POST') {
        const siteData = await getSiteData(env);
        const { username, password } = await request.json();
        const user = siteData.users[username];
        if (!user || !user.salt || user.passwordHash !== await hashPassword(password, user.salt)) {
            return errorResponse('用户名或密码错误', 401);
        }
        const { passwordHash, salt, ...safeUser } = user;
        const token = await new SignJWT({ sub: safeUser.username, roles: safeUser.roles }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1d').sign(await JWT_SECRET());
        return jsonResponse({ token, user: safeUser });
    }

    // --- Authenticated Routes ---
    const siteData = await getSiteData(env);
    const authResult = await authenticateRequest(request, siteData);
    if (authResult.error) return errorResponse(authResult.error, authResult.status);
    const currentUser = authResult.user;

    // --- GET /api/data ---
    if (apiPath === 'data' && request.method === 'GET') {
        if (!currentUser.roles.includes('admin')) return errorResponse('权限不足', 403);
        const usersForAdmin = Object.values(siteData.users).map(({ passwordHash, salt, ...u }) => u);
        return jsonResponse({ ...siteData, users: usersForAdmin }, 200, { 'ETag': siteData.version });
    }

    // --- PATCH /api/data ---
    if (apiPath === 'data' && request.method === 'PATCH') {
        if (!currentUser.roles.includes('admin')) return errorResponse('权限不足', 403);
        
        const clientVersion = request.headers.get('if-match');
        if (clientVersion && clientVersion !== siteData.version) {
            return errorResponse('数据版本冲突，请刷新页面后重试。', 412);
        }

        const dataToUpdate = await request.json();
        
        // --- ID Generation & Relation Fix Logic ---
        if (dataToUpdate.categories) {
            const idMap = new Map();
            dataToUpdate.categories.forEach(cat => {
                if (cat.id && cat.id.startsWith('new-')) {
                    const oldId = cat.id;
                    const newId = `cat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                    cat.id = newId;
                    idMap.set(oldId, newId);
                }
            });
            if (idMap.size > 0) {
                dataToUpdate.categories.forEach(cat => {
                    if (cat.parentId && idMap.has(cat.parentId)) {
                        cat.parentId = idMap.get(cat.parentId);
                    }
                });
                // Also update any bookmarks that might be pointing to a new category
                const bookmarksToUpdate = dataToUpdate.bookmarks || siteData.bookmarks;
                bookmarksToUpdate.forEach(bm => {
                    if (bm.categoryId && idMap.has(bm.categoryId)) {
                        bm.categoryId = idMap.get(bm.categoryId);
                    }
                });
                 if(dataToUpdate.bookmarks) dataToUpdate.bookmarks = bookmarksToUpdate;
                 else siteData.bookmarks = bookmarksToUpdate;
            }
            siteData.categories = dataToUpdate.categories;
        }

        if (dataToUpdate.bookmarks) {
            dataToUpdate.bookmarks.forEach(bm => {
                 if (!bm.id || bm.id.startsWith('new-')) {
                    bm.id = `bm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                }
            });
            siteData.bookmarks = dataToUpdate.bookmarks;
        }
        
        const newVersion = await saveSiteData(env, siteData);
        // Return the complete, updated data
        return jsonResponse({ ...siteData, version: newVersion }, 200, { 'ETag': newVersion });
    }
    
     // --- User Management ---
    const userPathMatch = apiPath.match(/^users\/(.+)$/);
    if (userPathMatch) {
        if (!currentUser.permissions.canEditUsers) return errorResponse('权限不足', 403);
        const username = decodeURIComponent(userPathMatch[1]);
        const userToManage = siteData.users[username];
        if (!userToManage) return errorResponse(`用户 '${username}' 未找到`, 404);

        if (request.method === 'PUT') {
            const { roles, permissions, password, defaultCategoryId } = await request.json();
            if (roles) userToManage.roles = roles;
            if (permissions) userToManage.permissions.visibleCategories = permissions.visibleCategories;
            if (typeof defaultCategoryId !== 'undefined') userToManage.defaultCategoryId = defaultCategoryId;
            if (password) {
                userToManage.salt = generateSalt();
                userToManage.passwordHash = await hashPassword(password, userToManage.salt);
            }
            const newVersion = await saveSiteData(env, siteData);
            const { passwordHash, salt, ...updatedUser } = userToManage;
            return jsonResponse({ user: updatedUser, version: newVersion }, 200, { 'ETag': newVersion });
        }
    }

    return errorResponse('API端点未找到或方法不允许', 404);
}
