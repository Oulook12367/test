// admin-system.js

/**
 * 渲染“系统工具”标签页的UI结构。
 * @param {HTMLElement} container - 用于承载内容的DOM元素。
 */
function renderSystemSettingsTab(container) {
    const usersArray = Array.isArray(allUsers) ? allUsers : Object.values(allUsers);
    const currentUser = usersArray.find(u => u.username === parseJwtPayload(localStorage.getItem('jwt_token'))?.sub);

    container.innerHTML = `
        <div class="system-setting-item">
            <p style="margin-bottom: 1.5rem;">从浏览器导出的HTML文件（Netscape书签格式）导入书签。此操作会合并现有书签，不会清空原有数据。</p>
            <div style="display: flex; align-items: center; gap: 1rem;">
                <h3 style="margin: 0; flex-shrink: 0;"><i class="fas fa-file-import"></i> 导入书签</h3>
                <button id="import-bookmarks-btn-admin" class="button">选择HTML文件</button>
                <input type="file" id="import-file-input-admin" accept=".html,.htm" style="display: none;">
            </div>
        </div>
        <div style="border-top: 1px solid rgba(255,255,255,0.2); margin: 2rem 0;"></div>
        <div class="system-setting-item">
            <p style="margin-bottom: 1.5rem;">将您有权访问的所有分类和书签导出为一个标准的HTML文件，该文件可被所有现代浏览器导入。</p>
            <div style="display: flex; align-items: center; gap: 1rem;">
                <h3 style="margin: 0; flex-shrink: 0;"><i class="fas fa-file-export"></i> 导出数据</h3>
                <button id="export-data-btn" class="button">开始导出</button>
            </div>
        </div>
        <div style="border-top: 1px solid rgba(255,255,255,0.2); margin: 2rem 0;"></div>
        <div class="system-setting-item">
            <p style="margin-bottom: 1.5rem;">如果因之前导入错误等原因导致部分书签无法显示，可以尝试使用此工具进行修复。</p>
            <div style="display: flex; align-items: center; gap: 1rem;">
                <h3 style="margin: 0; flex-shrink: 0;"><i class="fas fa-medkit"></i> 数据修复</h3>
                <button id="cleanup-orphan-bookmarks-btn" class="button">修复孤儿书签</button>
            </div>
        </div>`;

    if (currentUser && currentUser.roles.includes('admin')) {
        const publicModeSection = document.createElement('div');
        publicModeSection.className = 'system-setting-item';
        Object.assign(publicModeSection.style, {
            marginTop: '2rem',
            borderTop: '1px solid rgba(255,255,255,0.2)',
            paddingTop: '2rem'
        });
        const isChecked = siteSettings.publicModeEnabled ? 'checked' : '';
        publicModeSection.innerHTML = `
            <p style="margin-bottom: 1.5rem;">开启后，未登录的访客将可以看到您在“用户管理”中为'public'账户分配的分类和书签。</p>
            <div style="display: flex; align-items: center; gap: 1rem;">
                <h3 style="margin: 0; flex-shrink: 0;"><i class="fas fa-globe-asia"></i> 公共模式</h3>
                <label class="switch">
                    <input type="checkbox" id="public-mode-toggle" ${isChecked}>
                    <span class="slider round"></span>
                </label>
            </div>
        `;
        container.appendChild(publicModeSection);
    }
}

/**
 * 【修复】解析浏览器导出的HTML书签文件并准备导入数据。
 * @param {string} htmlContent - 从文件读取的HTML字符串内容。
 */
async function parseAndImport(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    let importedCategories = [];
    let importedBookmarks = [];
    
    const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const highestCatSortOrder = allCategories.length > 0 ? Math.max(-1, ...allCategories.map(c => c.sortOrder || 0)) : -1;
    let currentCatSort = highestCatSortOrder + 1;

    // 【修复】全新的、更健壮的递归解析函数
    function parseNode(node, parentId) {
        if (!node) return;
        
        let currentElement = node.firstElementChild;
        while(currentElement) {
            if (currentElement.tagName === 'DT') {
                const folderHeader = currentElement.querySelector('h3');
                const link = currentElement.querySelector('a');

                if (folderHeader) {
                    const categoryName = folderHeader.textContent.trim();
                    const existingCategory = [...allCategories, ...importedCategories].find(c => c.name === categoryName && c.parentId === parentId);
                    let categoryToUseId = existingCategory ? existingCategory.id : generateId('cat');
                    
                    if (!existingCategory) {
                        importedCategories.push({ id: categoryToUseId, name: categoryName, parentId: parentId, sortOrder: currentCatSort++ });
                    }
                    
                    const subList = currentElement.nextElementSibling;
                    if (subList && subList.tagName === 'DL') {
                        parseNode(subList, categoryToUseId);
                        currentElement = subList; // 【关键】处理完子列表后，将指针跳过它
                    }
                } else if (link) {
                    const highestBmSortOrder = [...allBookmarks, ...importedBookmarks].filter(b => b.categoryId === parentId).length > 0 
                        ? Math.max(-1, ...[...allBookmarks, ...importedBookmarks].filter(b => b.categoryId === parentId).map(bm => bm.sortOrder || 0)) 
                        : -1;
                    importedBookmarks.push({
                        id: generateId('bm'), name: link.textContent.trim(), url: link.href, categoryId: parentId,
                        description: link.getAttribute('description') || '', icon: link.getAttribute('icon') || '', 
                        sortOrder: highestBmSortOrder + 1
                    });
                }
            }
            currentElement = currentElement.nextElementSibling;
        }
    }

    const rootDl = doc.querySelector('dl');
    if (!rootDl) throw new Error('无效的书签文件格式，未找到根<DL>元素。');
    
    let uncategorizedCatId = null;
    if (Array.from(rootDl.children).some(child => child.tagName === 'DT' && child.querySelector('A'))) {
        let uncategorizedCat = allCategories.find(c => c.name === '导入的未分类书签' && c.parentId === null);
        if (uncategorizedCat) {
            uncategorizedCatId = uncategorizedCat.id;
        } else {
            uncategorizedCatId = generateId('cat');
            importedCategories.push({ id: uncategorizedCatId, name: '导入的未分类书签', parentId: null, sortOrder: currentCatSort++ });
        }
    }

    parseNode(rootDl, null);

    importedBookmarks.forEach(bm => {
        if (bm.categoryId === null && uncategorizedCatId) {
            bm.categoryId = uncategorizedCatId;
        }
    });

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
        showConfirm("导入成功", "数据已成功导入，请刷新页面以查看最新内容。", () => {
            location.reload();
        });
    } catch (error) {
        showToast(`后端导入失败: ${error.message}`, true);
    }
}


// --- 事件监听器 ---
document.addEventListener('click', event => {
    if (document.getElementById('tab-system')?.classList.contains('active')) {
        const target = event.target;
        if (target.closest('#import-bookmarks-btn-admin')) {
            document.getElementById('import-file-input-admin')?.click();
        }
        if (target.closest('#export-data-btn')) {
            const button = target.closest('#export-data-btn');
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在生成...';
            button.disabled = true;
            (async () => {
                try {
                    const response = await fetch('/api/export-data', { headers: { 'Authorization': `Bearer ${localStorage.getItem('jwt_token')}` } });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || '导出失败');
                    }
                    const htmlContent = await response.text();
                    const blob = new Blob([htmlContent], { type: 'text/html' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    const contentDisposition = response.headers.get('content-disposition');
                    let filename = `navicenter_bookmarks.html`;
                    if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
                        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                        const matches = filenameRegex.exec(contentDisposition);
                        if (matches != null && matches[1]) {
                            filename = matches[1].replace(/['"]/g, '');
                        }
                    }
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    a.remove();
                    showToast("导出文件已开始下载！");
                } catch (error) {
                    showToast(`导出失败: ${error.message}`, true);
                } finally {
                    button.innerHTML = originalText;
                    button.disabled = false;
                }
            })();
        }
        if (target.closest('#cleanup-orphan-bookmarks-btn')) {
            showConfirm(
                '确认修复数据？', 
                '此操作会查找所有没有有效分类的书签，并将它们移动到“未分类书签”文件夹中。这是一个安全的操作。是否继续？', 
                async () => {
                    const button = target.closest('#cleanup-orphan-bookmarks-btn');
                    const originalText = button.innerHTML;
                    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在修复...';
                    button.disabled = true;
                    try {
                        const result = await apiRequest('cleanup-orphan-bookmarks', 'POST');
                        showToast(result.message || "操作完成。");
                        if (result.fixedCount > 0) {
                            invalidateCache();
                            showConfirm("修复完成", "数据已修复，建议刷新页面以查看最新状态。", () => location.reload());
                        }
                    } catch (error) {
                        showToast(`修复失败: ${error.message}`, true);
                    } finally {
                        button.innerHTML = originalText;
                        button.disabled = false;
                    }
                }
            );
        }
    }
});
document.addEventListener('change', event => {
    if (document.getElementById('tab-system')?.classList.contains('active')) {
        const target = event.target;
        if (target.id === 'import-file-input-admin') {
            const file = target.files[0];
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
            target.value = '';
        }
        if (target.id === 'public-mode-toggle') {
            const isEnabled = target.checked;
            (async () => {
                const originalState = !isEnabled;
                try {
                    showToast("正在保存设置...");
                    await apiRequest('system-settings', 'PUT', { publicModeEnabled: isEnabled });
                    showToast("设置已保存！");
                    invalidateCache(); 
                    siteSettings.publicModeEnabled = isEnabled;
                } catch (error) {
                    showToast(`保存失败: ${error.message}`, true);
                    target.checked = originalState;
                }
            })();
        }
    }
});
