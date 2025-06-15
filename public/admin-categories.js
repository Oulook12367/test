// admin-categories.js

/**
 * 渲染“分类管理”标签页的全部内容。
 * @param {HTMLElement} container - 用于承载标签页内容的DOM元素。
 */
function renderCategoryAdminTab(container) {
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
    const sortedCategories = getHierarchicalSortedCategories(allCategories);
    
    listEl.innerHTML = '';
    sortedCategories.forEach(cat => {
        const li = document.createElement('li');
        li.dataset.id = cat.id;
        // 为新添加的、尚未保存的行添加一个特殊类名
        if (String(cat.id).startsWith('new-')) {
            li.classList.add('new-item-row');
        }
        li.innerHTML = `
            <input type="number" class="cat-order-input" value="${cat.sortOrder || 0}" min="0">
            <div class="cat-name-cell" style="padding-left: ${(cat.level || 0) * 25}px;">
                <input type="text" class="cat-name-input" value="${escapeHTML(cat.name)}">
            </div>
            <select class="cat-parent-select"></select>
            <div class="cat-actions" style="display: flex; align-items: center; justify-content: flex-end; gap: 5px;">
                 <span class="item-status" style="display:inline-block; width: 20px;"></span>
                 <button class="delete-cat-btn button-icon danger" title="删除"><i class="fas fa-trash-alt"></i></button>
            </div>`;
        populateCategoryDropdown(li.querySelector('.cat-parent-select'), allCategories, cat.parentId, cat.id);
        listEl.appendChild(li);
    });
}

/**
 * 带有防抖功能的自动保存函数，现在能同时处理新增和更新。
 * @param {HTMLElement} listItem - 被修改的列表项DOM元素。
 */
const handleCategoryAutoSave = debounce(async (listItem) => {
    const id = listItem.dataset.id;
    if (!id) return;

    const isNew = id.startsWith('new-');
    const category = allCategories.find(c => c.id.toString() === id);
    if (!category) return;

    const statusEl = listItem.querySelector('.item-status');
    const nameInput = listItem.querySelector('.cat-name-input');
    const newName = nameInput.value.trim();
    const newSortOrder = parseInt(listItem.querySelector('.cat-order-input').value) || 0;
    const newParentId = listItem.querySelector('.cat-parent-select').value || null;

    if (!isNew && category.name === newName && category.sortOrder === newSortOrder && category.parentId === newParentId) {
        return; // 数据未变
    }
    
    if (!newName) {
        showToast("分类名称不能为空！", true);
        if(!isNew) nameInput.value = category.name; // 恢复旧名称
        return;
    }

    const categoryData = {
        name: newName,
        sortOrder: newSortOrder,
        parentId: newParentId,
    };
    
    if (!isNew) {
        categoryData.id = id;
    }

    try {
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        if (isNew) {
            // --- 新增逻辑 ---
            const newCategory = await apiRequest('categories', 'POST', categoryData);
            // 用从服务器返回的真实数据替换掉临时的本地数据
            const tempIndex = allCategories.findIndex(c => c.id === id);
            if (tempIndex > -1) {
                allCategories[tempIndex] = newCategory;
            }
            // 更新DOM元素的ID，这样下次编辑就会触发更新而不是新增
            listItem.dataset.id = newCategory.id;
            listItem.classList.remove('new-item-row');

        } else {
            // --- 更新逻辑 ---
            await apiRequest(`categories/${id}`, 'PUT', categoryData);
            // 更新本地数据
            category.name = newName;
            category.sortOrder = newSortOrder;
            category.parentId = newParentId;
        }

        if (statusEl) statusEl.innerHTML = '<i class="fas fa-check" style="color: #34d399;"></i>';
        invalidateCache();
        // 重新渲染下拉列表以反映层级变化
        if (isNew || category.parentId !== newParentId) {
            renderCategoryAdminTab(document.getElementById('tab-categories'));
        }

    } catch (error) {
        console.error(`保存分类 ${id} 失败:`, error);
        if (statusEl) statusEl.innerHTML = `<i class="fas fa-times" title="${error.message}" style="color: #f87171;"></i>`;
    } finally {
        setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 2000);
    }
}, 750);


// --- 事件监听器 ---

document.addEventListener('input', event => {
    if (document.getElementById('tab-categories')?.classList.contains('active')) {
        const listItem = event.target.closest('li[data-id]');
        if (listItem) {
            handleCategoryAutoSave(listItem);
        }
    }
});

document.addEventListener('click', event => {
    if (document.getElementById('tab-categories')?.classList.contains('active')) {
        const target = event.target;
        
        // 【修复】新增分类按钮的新逻辑
        if (target.closest('#add-new-category-btn')) {
            // 检查是否已有未保存的新行
            if(document.querySelector('.new-item-row')){
                showToast("请先保存当前新增的分类。", true);
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
            
            // 自动聚焦到新行的输入框
            const newRowInput = document.querySelector(`li[data-id="${newTempCategory.id}"] .cat-name-input`);
            if(newRowInput) {
                newRowInput.focus();
                newRowInput.select();
            }
        }
        
        if (target.closest('.delete-cat-btn')) {
            const listItem = target.closest('li[data-id]');
            const catId = listItem.dataset.id;

            // 如果是删除一个尚未保存的新行
            if (catId.startsWith('new-')) {
                allCategories = allCategories.filter(c => c.id !== catId);
                renderCategoryAdminTab(document.getElementById('tab-categories'));
                return;
            }

            // 删除已保存的行
            const catName = listItem.querySelector('.cat-name-input').value;
            showConfirm('确认删除', `您确定要删除分类 "${catName}" 吗？其下所有子分类和书签都将被删除。`, async () => {
                try {
                    await apiRequest(`categories/${catId}`, 'DELETE');
                    showToast("分类及相关书签删除成功！");
                    invalidateCache();
                    await initializePage('tab-categories');
                } catch(error) {
                    showToast(`删除失败: ${error.message}`, true);
                }
            });
        }
    }
});
