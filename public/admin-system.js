// admin-system.js

/**
 * 渲染“系统工具”标签页的UI结构。
 * @param {HTMLElement} container - 用于承载内容的DOM元素。
 */
function renderSystemSettingsTab(container) {
    container.innerHTML = `
        <div class="system-setting-item">
            <p style="margin-bottom: 1.5rem;">从浏览器导出的HTML文件（Netscape书签格式）导入书签。此操作会合并现有书签，不会清空原有数据。</p>
            <div style="display: flex; align-items: center; gap: 1rem;">
                <h3 style="margin: 0; flex-shrink: 0;"><i class="fas fa-file-import"></i> 导入书签</h3>
                <button id="import-bookmarks-btn-admin" class="button">选择HTML文件</button>
                <input type="file" id="import-file-input-admin" accept=".html,.htm" style="display: none;">
            </div>
        </div>`;
}

/**
 * 解析浏览器导出的HTML书签文件并准备导入数据。
 * @param {string} htmlContent - 从文件读取的HTML字符串内容。
 */
async function parseAndImport(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    let importedCategories = [];
    let importedBookmarks = [];
    
    const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 使用现有数据来计算起始排序值，避免冲突
    const highestCatSortOrder = allCategories.length > 0 ? Math.max(-1, ...allCategories.map(c => c.sortOrder || 0)) : -1;
    let currentCatSort = highestCatSortOrder + 1;

    /**
     * 递归解析DOM节点。
     * @param {HTMLElement} node - 当前要解析的DOM节点 (通常是 <DL> 或 <DT>)。
     * @param {string|null} parentId - 当前节点的父分类ID。
     */
    function parseNode(node, parentId) {
        if (!node || !node.children) return;

        for (const child of node.children) {
            // 标准的Netscape格式是DT包裹着A或H3
            if (child.tagName !== 'DT') continue;
            
            const folderHeader = child.querySelector('h3');
            const link = child.querySelector('a');
            
            // 如果节点是文件夹 (H3)
            if (folderHeader) {
                const newCategoryId = generateId('cat');
                const categoryName = folderHeader.textContent.trim();
                
                // 检查同级下是否已有同名分类，以避免重复创建
                let existingCategory = allCategories.find(c => c.name === categoryName && c.parentId === parentId);
                let categoryToUseId = existingCategory ? existingCategory.id : newCategoryId;
                
                if (!existingCategory) {
                    importedCategories.push({ 
                        id: categoryToUseId, 
                        name: categoryName, 
                        parentId: parentId, 
                        sortOrder: currentCatSort++ 
                    });
                }
                
                // 递归解析子列表
                let subList = child.querySelector('dl');
                if (subList) parseNode(subList, categoryToUseId);

            // 如果节点是书签 (A)
            } else if (link) {
                const highestBmSortOrder = allBookmarks.filter(b => b.categoryId === parentId).length > 0 ? Math.max(-1, ...allBookmarks.filter(b => b.categoryId === parentId).map(bm => bm.sortOrder || 0)) : -1;
                importedBookmarks.push({
                    id: generateId('bm'), 
                    name: link.textContent.trim(), 
                    url: link.href, 
                    categoryId: parentId,
                    description: link.getAttribute('description') || '', 
                    icon: link.getAttribute('icon') || '', 
                    sortOrder: highestBmSortOrder + 1
                });
            }
        }
    }

    const rootDl = doc.querySelector('dl');
    if (!rootDl) throw new Error('无效的书签文件格式，未找到根<DL>元素。');
    
    parseNode(rootDl, null); // 从根节点开始解析

    if (importedCategories.length === 0 && importedBookmarks.length === 0) {
        throw new Error('未在文件中找到可导入的书签或文件夹。');
    }
    
    try {
        await apiRequest('import-data', 'POST', { 
            newCategories: importedCategories, 
            newBookmarks: importedBookmarks 
        });
        showToast("书签导入成功！");
        invalidateCache();
        // 导入成功后，需要重新加载数据以确保UI同步
        // 由于initializePage在其他文件，最好的方式是提示用户并刷新
        showConfirm("导入成功", "数据已成功导入，请刷新页面以查看最新内容。", () => {
            location.reload();
        });
    } catch (error) {
        showToast(`后端导入失败: ${error.message}`, true);
    }
}


// --- 事件监听器 ---

// 处理“选择文件”按钮的点击事件
document.addEventListener('click', event => {
    if (document.getElementById('tab-system')?.classList.contains('active')) {
        if (event.target.closest('#import-bookmarks-btn-admin')) {
            document.getElementById('import-file-input-admin')?.click();
        }
    }
});

// 处理文件输入框的选择事件
document.addEventListener('change', event => {
    if (document.getElementById('tab-system')?.classList.contains('active')) {
        if (event.target.id === 'import-file-input-admin') {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    // 开始解析文件内容
                    await parseAndImport(e.target.result);
                } catch (error) { 
                    showToast(`导入失败: ${error.message}`, true); 
                }
            };
            reader.onerror = () => {
                showToast(`读取文件失败！`, true);
            };
            reader.readAsText(file);
            // 清空文件选择，以便用户可以再次选择同一个文件
            event.target.value = '';
        }
    }
});
