// admin-categories.js

/**
 * 渲染“分类管理”标签页的全部内容。
 * @param {HTMLElement} container - 用于承载标签页内容的DOM元素。
 */
function renderCategoryAdminTab(container) {
    // 设置标签页的静态HTML结构
    container.innerHTML = `
        <p class="admin-panel-tip" style="margin-bottom: 1rem;">所有更改（名称、父级、排序）都将自动保存。</p>
        <div class="category-admin-header">
            <span>排序</span>
            <span>分类名称</span>
            <span>上级分类</span>
            <span>操作</span>
        </div>
        <div style="flex-grow: 1; overflow-y: auto; min-height: 0;">
            <ul id="category-admin-list"></ul>
        </div>
        <div class="admin-panel-actions">
            <button id="add-new-category-btn" class="button"><i class="fas fa-plus"></i> 添加新分类</button>
        </div>`;

    const listEl = container.querySelector('#category-admin-list');
    
    // 使用核心函数对分类进行层级排序
    const sortedCategories = getHierarchicalSortedCategories(allCategories);
    
    listEl.innerHTML = ''; // 清空现有列表
    sortedCategories.forEach(cat => {
        if (!cat) return;
        const isNew = String(cat.id).startsWith('new-');
        const li = document.createElement('li');
        li.dataset.id = cat.id;
        if (isNew) {
            li.classList.add('new-item-row');
        }
        
        // 为新行添加一个专属的保存按钮，已存在的行则显示状态
        const actionButtonHTML = isNew 
            ? `<button class="save-new-cat-btn button-icon" title="保存新分类"><i class="fas fa-check"></i></button>`
            : `<span class="item-status" style="display:inline-block; width: 20px;"></span>`;

        li.innerHTML = `
            <input type="number" class="cat-order-input" value="${cat.sortOrder || 0}" min="0">
            <div class="cat-name-cell" style="padding-left: ${(cat.level || 0) * 25}px;">
                <input type="text" class="cat-name-input" value="${escapeHTML(cat.name)}">
            </div>
            <select class="cat-parent-select"></select>
            <div class="cat-actions" style="display: flex; align-items: center; justify-content: flex-end; gap: 5px;">
                 ${actionButtonHTML}
                 <button class="delete-cat-btn button-icon danger" title="删除"><i class="fas fa-trash-alt"></i></button>
            </div>`;
        populateCategoryDropdown(li.querySelector('.cat-parent-select'), allCategories, cat.parentId, cat.id);
        listEl.appendChild(li);
    });
}

/**
 * 带有防抖功能的自动保存函数，用于处理【已存在的】分类的更新。
 * @param {HTMLElement} listItem - 被修改的列表项DOM元素。
 */
const handleCategoryAutoSave = debounce(async (listItem) => {
    const id = listItem.dataset.id;
    // 自动保存逻辑忽略新添加的、未保存的行
    if (!id || id.startsWith('new-')) return;

    const category = allCategories.find(c => c.id === id);
    if (!category) return;

    const statusEl = listItem.querySelector('.item-status');
    const nameInput = listItem.querySelector('.cat-name-input');
    
    const newName = nameInput.value.trim();
    const newSortOrder = parseInt(listItem.querySelector('.cat-order-input').value) || 0;
    const newParentId = listItem.querySelector('.cat-parent-select').value || null;

    if (category.name === newName && category.sortOrder === newSortOrder && category.parentId === newParentId) {
        return; // 数据未变
    }
    
    if (!newName) {
        showToast("分类名称不能为空！", true);
        nameInput.value = category.name; // 将输入框的值恢复为修改前的值
        return;
    }

    // 乐观更新本地JS数据模型
    const oldParentId = category.parentId;
    category.name = newName;
    category.sortOrder = newSortOrder;
    category.parentId = newParentId;

    try {
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        await apiRequest(`categories/${id}`, 'PUT', category);

        if (statusEl) statusEl.innerHTML = '<i class="fas fa-check" style="color: #34d399;"></i>';
        invalidateCache();
        
        // 如果层级发生变化，需要重新渲染整个列表以更新树结构
        if (oldParentId !== newParentId) {
            renderCategoryAdminTab(document.getElementById('tab-categories'));
        }

    } catch (error) {
        console.error(`自动保存分类 ${id} 失败:`, error);
        if (statusEl) statusEl.innerHTML = `<i class="fas fa-times" title="${error.message}" style="color: #f87171;"></i>`;
    } finally {
        setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 2000);
    }
}, 750);


// --- 事件监听器 ---

// 使用事件委托处理所有输入事件，触发自动保存
document.addEventListener('input', event => {
    // 确保只在分类管理标签页激活时生效
    if (document.getElementById('tab-categories')?.classList.contains('active')) {
        const listItem = event.target.closest('li[data-id]');
        if (listItem) {
            handleCategoryAutoSave(listItem);
        }
    }
});

// 使用事件委托处理所有点击事件
document.addEventListener('click', event => {
    if (document.getElementById('tab-categories')?.classList.contains('active')) {
        const target = event.target;
        
        // 处理“添加新分类”按钮点击事件
        if (target.closest('#add-new-category-btn')) {
            // 检查是否已有未保存的新行
            if(document.querySelector('.new-item-row')){
                showToast("请先保存当前新增的分类。", true);
                document.querySelector('.new-item-row .cat-name-input')?.focus();
                return;
            }

            // 创建一个临时的分类对象
            const newTempCategory = {
                id: `new-${Date.now()}`,
                name: "新分类",
                sortOrder: 0, // 默认排在最前面
                parentId: null,
                level: 0,
            };
            
            // 将其添加到全局数组的开头
            allCategories.unshift(newTempCategory);

            // 重新渲染UI
            renderCategoryAdminTab(document.getElementById('tab-categories'));
            
            // 自动聚焦到新行的输入框并选中内容
            const newRowInput = document.querySelector(`li[data-id="${newTempCategory.id}"] .cat-name-input`);
            if(newRowInput) {
                newRowInput.focus();
                newRowInput.select();
            }
        }
        
        // 处理新行的“保存”按钮点击事件
        if (target.closest('.save-new-cat-btn')) {
            const listItem = target.closest('li[data-id]');
            const tempId = listItem.dataset.id;
            
            const nameInput = listItem.querySelector('.cat-name-input');
            const name = nameInput.value.trim();
            if (!name) {
                showToast("分类名称不能为空！", true);
                return;
            }

            const categoryData = {
                name: name,
                sortOrder: parseInt(listItem.querySelector('.cat-order-input').value) || 0,
                parentId: listItem.querySelector('.cat-parent-select').value || null,
            };

            (async () => {
                const saveButton = target.closest('.save-new-cat-btn');
                saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                saveButton.disabled = true;

                try {
                    const newCategory = await apiRequest('categories', 'POST', categoryData);
                    showToast("新增分类成功！");
                    invalidateCache();
                    // 用后端返回的真实数据替换掉临时数据
                    const tempIndex = allCategories.findIndex(c => c.id === tempId);
                    if (tempIndex > -1) {
                        allCategories[tempIndex] = newCategory;
                    } else {
                        allCategories.push(newCategory);
                    }
                    // 重新渲染整个列表
                    renderCategoryAdminTab(document.getElementById('tab-categories'));
                } catch(error) {
                    showToast(`添加分类失败: ${error.message}`, true);
                    saveButton.innerHTML = '<i class="fas fa-check"></i>';
                    saveButton.disabled = false;
                }
            })();
        }
        
        // 处理“删除分类”按钮点击事件
        if (target.closest('.delete-cat-btn')) {
            const listItem = target.closest('li[data-id]');
            const catId = listItem.dataset.id;

            // 如果是删除一个尚未保存的新行
            if (catId.startsWith('new-')) {
                allCategories = allCategories.filter(c => c.id !== catId);
                renderCategoryAdminTab(document.getElementById('tab-categories'));
                return;
            }

            const catName = listItem.querySelector('.cat-name-input').value;
            showConfirm('确认删除', `您确定要删除分类 "${catName}" 吗？其下所有子分类和书签都将被删除。`, async () => {
                try {
                    await apiRequest(`categories/${catId}`, 'DELETE');
                    showToast("分类及相关书签删除成功！");
                    invalidateCache();
                    // 删除后需要从服务器重新获取全量数据
                    const data = await apiRequest('data');
                    allCategories = data.categories || [];
                    allBookmarks = data.bookmarks || [];
                    renderCategoryAdminTab(document.getElementById('tab-categories'));
                } catch(error) {
                    showToast(`删除失败: ${error.message}`, true);
                }
            });
        }
    }
});
