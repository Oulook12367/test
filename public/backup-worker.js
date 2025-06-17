export default {
    /**
     * scheduled 函数会在Cron Trigger触发时自动执行。
     * @param {object} controller - The controller object.
     * @param {object} env - 包含环境变量和绑定的对象 (NAVI_DATA, NAVI_BACKUPS)。
     * @param {object} ctx - The execution context.
     */
    async scheduled(controller, env, ctx) {
        console.log("开始执行每小时备份任务...");
        try {
            // --- 步骤 1: 读取所有索引 ---
            const [userIndex, categoryIndex, bookmarkIndex] = await Promise.all([
                env.NAVI_DATA.get('_index:users', 'json').then(res => res || []),
                env.NAVI_DATA.get('_index:categories', 'json').then(res => res || []),
                env.NAVI_DATA.get('_index:bookmarks', 'json').then(res => res || [])
            ]);

            // --- 步骤 2: 根据索引读取所有数据 ---
            const userKeys = userIndex.map(username => `user:${username}`);
            const categoryKeys = categoryIndex.map(id => `category:${id}`);
            const bookmarkKeys = bookmarkIndex.map(id => `bookmark:${id}`);

            const [usersData, categoriesData, bookmarksData] = await Promise.all([
                userKeys.length > 0 ? Promise.all(userKeys.map(key => env.NAVI_DATA.get(key, { type: 'json' }))) : Promise.resolve([]),
                categoryKeys.length > 0 ? Promise.all(categoryKeys.map(key => env.NAVI_DATA.get(key, { type: 'json' }))) : Promise.resolve([]),
                bookmarkKeys.length > 0 ? Promise.all(bookmarkKeys.map(key => env.NAVI_DATA.get(key, { type: 'json' }))) : Promise.resolve([])
            ]);

            // --- 步骤 3: 组装成一个完整的备份对象 ---
            const backupData = {
                timestamp: new Date().toISOString(),
                source: 'Scheduled Backup Worker',
                data: {
                    users: usersData.filter(Boolean),
                    categories: categoriesData.filter(Boolean),
                    bookmarks: bookmarksData.filter(Boolean),
                }
            };
            
            // --- 步骤 4: 写入新的备份文件 ---
            const backupKey = `backup-${new Date().toISOString()}`;
            await env.NAVI_BACKUPS.put(backupKey, JSON.stringify(backupData));
            console.log(`成功创建备份: ${backupKey}`);

            // --- 步骤 5: 清理旧的备份 ---
            await pruneOldBackups(env);

        } catch (error) {
            console.error("备份任务执行失败:", error);
            // 在实际生产中，您可以在此处添加错误上报逻辑
        }
    }
};

/**
 * 清理旧的备份，只保留最近的备份。
 * @param {object} env - 包含绑定的对象。
 */
async function pruneOldBackups(env) {
    // 设置要保留的备份数量，例如保留最近3天的每小时备份 (3 * 24 = 72)
    const BACKUPS_TO_KEEP = 72;

    const list = await env.NAVI_BACKUPS.list();
    if (list.keys.length > BACKUPS_TO_KEEP) {
        console.log(`当前备份数量 (${list.keys.length}) 已超过限制 (${BACKUPS_TO_KEEP})，开始清理...`);
        
        // 按名称排序，因为我们的备份键以时间戳开头，所以这相当于按时间排序
        const sortedKeys = list.keys.sort((a, b) => a.name.localeCompare(b.name));
        
        // 计算需要删除的备份数量
        const keysToDeleteCount = sortedKeys.length - BACKUPS_TO_KEEP;
        const keysToDelete = sortedKeys.slice(0, keysToDeleteCount).map(key => key.name);

        // 批量删除
        if (keysToDelete.length > 0) {
            // Cloudflare KV 的批量删除限制为一次最多10000个key
            // 对于我们的场景，这完全足够
            await env.NAVI_BACKUPS.delete(keysToDelete);
            console.log(`成功删除了 ${keysToDelete.length} 个旧备份。`);
        }
    } else {
        console.log(`当前备份数量 (${list.keys.length}) 未超过限制，无需清理。`);
    }
}
