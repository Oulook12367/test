
// admin-system.js

// --- 渲染函数 ---
function renderSystemSettingsTab(container) {
    container.innerHTML = `
        <div class="system-setting-item">
            <h3><i class="fas fa-file-import"></i> 导入书签</h3>
            <p style="margin-bottom: 1.5rem;">从浏览器导出的HTML文件导入书签。导入操作会合并现有书签，不会清空原有数据。</p>
            <div style="display: flex; align-items: center; gap: 1rem;">
                <button id="import-bookmarks-btn-admin" class="button">选择HTML文件</button>
                <input type="file" id="import-file-input-admin" accept=".html,.htm" style="display: none;">
            </div>
        </div>`;
}

// --- 导入逻辑 ---
async function parseAndImport(htmlContent) {
    // ... 此函数逻辑不变 ...
    // 在最后成功调用 apiRequest 后，也需要调用 invalidateCache();
    // 例如：
    // await apiRequest('data', 'PUT', { categories: finalCategories, bookmarks: finalBookmarks });
    // showToast("书签导入成功！");
    // invalidateCache();
    // await initializePage('tab-system');
}

// --- 事件处理 ---
document.addEventListener('click', event => {
    if (document.getElementById('tab-system')?.classList.contains('active')) {
        if (event.target.closest('#import-bookmarks-btn-admin')) {
            document.getElementById('import-file-input-admin')?.click();
        }
    }
});

document.addEventListener('change', event => {
    if (document.getElementById('tab-system')?.classList.contains('active')) {
        if (event.target.id === 'import-file-input-admin') {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    await parseAndImport(e.target.result);
                } catch (error) { 
                    showToast(`导入失败: ${error.message}`, true); 
                }
            };
            reader.readAsText(file);
            event.target.value = ''; // 清空选择，以便再次选择同名文件
        }
    }
});
