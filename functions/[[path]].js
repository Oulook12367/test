import { SignJWT, jwtVerify } from 'jose';

// --- 安全的密码哈希辅助函数 (不变) ---
const JWT_SECRET = () => new TextEncoder().encode(globalThis.JWT_SECRET_STRING);
const generateSalt = (length = 16) => { /* ... */ };
const hashPassword = async (password, salt) => { /* ... */ };

// --- 数据获取与权限填充 (不变) ---
const getSiteData = async (env) => { /* ... */ };
const saveSiteData = async (env, data) => { /* ... */ };
const authenticateRequest = async (request, env) => { /* ... */ };
const jsonResponse = (data, status = 200, headers = {}) => { /* ... */ };

// --- 主入口 onRequest ---
export async function onRequest(context) {
    // ... (前面部分不变)
    
    // --- (重构) 所有需要认证的路由 ---
    const authResult = await authenticateRequest(request, env);
    if (authResult.error) return jsonResponse(authResult, authResult.status);
    const currentUser = authResult.user;

    // ... (获取数据 /data 和 书签CRUD /bookmarks 不变)

    // 分类 CRUD
    if (apiPath.startsWith('categories')) {
        if (!currentUser.permissions.canEditCategories) return jsonResponse({ error: '权限不足' }, 403);
        const data = await getSiteData(env);

        // 新增：批量删除
        if (request.method === 'DELETE' && apiPath === 'categories') {
            const { ids } = await request.json();
            if (!ids || !Array.isArray(ids)) return jsonResponse({ error: '无效的请求' }, 400);

            const errors = [];
            const deletableIds = [];
            
            ids.forEach(id => {
                if (data.bookmarks.some(bm => bm.categoryId === id)) {
                    const cat = data.categories.find(c => c.id === id);
                    errors.push(`分类 "${cat ? cat.name : id}" 下仍有书签，无法删除。`);
                } else {
                    deletableIds.push(id);
                }
            });

            if (errors.length > 0) return jsonResponse({ error: errors.join(' ') }, 400);

            data.categories = data.categories.filter(c => !deletableIds.includes(c.id));
            // 从所有用户的权限中移除被删除的分类
            Object.values(data.users).forEach(user => {
                user.permissions.visibleCategories = user.permissions.visibleCategories.filter(catId => !deletableIds.includes(catId));
            });

            await saveSiteData(env, data);
            return jsonResponse(null);
        }

        const id = apiPath.split('/').pop();

        if (request.method === 'POST') { /* ... (POST逻辑不变) */ }
        
        // (旧的单个删除逻辑已合并到上面的批量删除中，可以移除或保留作为备用)
    }

    // 用户管理
    if (apiPath.startsWith('users')) {
        if (!currentUser.permissions.canEditUsers) return jsonResponse({ error: '权限不足' }, 403);
        const data = await getSiteData(env);
        const username = apiPath.split('/').pop();

        if (request.method === 'POST') { /* ... (POST逻辑不变) */ }

        const userToManage = data.users[username];
        if (!userToManage) return jsonResponse({ error: '用户未找到' }, 404);

        if (request.method === 'PUT') { /* ... (PUT逻辑不变) */ }

        if (request.method === 'DELETE') {
            if (username === currentUser.username) return jsonResponse({ error: '无法删除自己' }, 403);

            // 新增：更安全的管理员删除逻辑
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
