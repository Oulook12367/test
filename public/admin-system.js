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
        </div>
        <!-- 可以在此添加更多系统设置项，例如导出、备份管理等 -->
        `;
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
    
    const highestCatSortOrder = allCategories.length > 0 ? Math.max(-1, ...allCategories.map(c => c.sortOrder || 0)) : -1;
    const highestBmSortOrder = allBookmarks.length > 0 ? Math.max(-1, ...allBookmarks.map(bm => bm.sortOrder || 0)) : -1;
    let currentCatSort = highestCatSortOrder + 1;
    let currentBmSort = highestBmSortOrder + 1;

    function parseNode(node, parentId) {
        if (!node || !node.children) return;

        for (const child of node.children) {
            if (child.tagName !== 'DT') continue;
            
            const folderHeader = child.querySelector('h3');
            const link = child.querySelector('a');
            
            if (folderHeader) {
                const newCategoryId = generateId('cat');
                const categoryName = folderHeader.textContent.trim();
                
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
                
                let subList = child.querySelector('dl');
                if (subList) parseNode(subList, categoryToUseId);

            } else if (link) {
                importedBookmarks.push({
                    id: generateId('bm'), 
                    name: link.textContent.trim(), 
                    url: link.href, 
                    categoryId: parentId,
                    description: link.getAttribute('description') || '', 
                    icon: link.getAttribute('icon') || '', 
                    sortOrder: currentBmSort++
                });
            }
        }
    }

    const rootDl = doc.querySelector('dl');
    if (!rootDl) throw new Error('无效的书签文件格式，未找到根<DL>元素。');
    
    parseNode(rootDl, null);

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
        await initializePage('tab-system');
    } catch (error) {
        showToast(`后端导入失败: ${error.message}`, true);
    }
}


// --- 事件监听器 ---

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
            reader.onerror = () => {
                showToast(`读取文件失败！`, true);
            };
            reader.readAsText(file);
            event.target.value = '';
        }
    }
});
