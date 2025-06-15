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
        // 为每个分类的下拉菜单填充选项，排除其自身
        populateCategoryDropdown(li.querySelector('.cat-parent-select'), allCategories, cat.parentId, cat.id);
        listEl.appendChild(li);
    });
}

/**
 * 带有防抖功能的自动保存函数，用于处理分类的新增和更新。
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
    
    // 从UI元素获取最新数据
    const newName = nameInput.value.trim();
    const newSortOrder = parseInt(listItem.querySelector('.cat-order-input').value) || 0;
    const newParentId = listItem.querySelector('.cat-parent-select').value || null;

    // 如果是已存在的分类且数据未变，则不执行任何操作
    if (!isNew && category.name === newName && category.sortOrder === newSortOrder && category.parentId === newParentId) {
        return;
    }
    
    // 数据校验
    if (!newName) {
        showToast("分类名称不能为空！", true);
        if(!isNew) nameInput.value = category.name; // 恢复旧名称
        return;
    }

    // 准备要发送到后端的数据
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
        
        let savedCategory;
        if (isNew) {
            // --- 新增逻辑 ---
            // 后端不需要我们提供ID，它会自己生成
            savedCategory = await apiRequest('categories', 'POST', {name: newName, parentId: newParentId, sortOrder: newSortOrder});
            
            // 用从服务器返回的真实数据替换掉临时的本地数据
            const tempIndex = allCategories.findIndex(c => c.id === id);
            if (tempIndex > -1) {
                allCategories[tempIndex] = savedCategory;
            } else {
                 allCategories.push(savedCategory);
            }
            // 更新DOM元素的ID，这样下次编辑就会触发更新而不是新增
            listItem.dataset.id = savedCategory.id;
            listItem.classList.remove('new-item-row');
        } else {
            // --- 更新逻辑 ---
            savedCategory = await apiRequest(`categories/${id}`, 'PUT', categoryData);
            // 更新本地数据
            category.name = newName;
            category.sortOrder = newSortOrder;
            category.parentId = newParentId;
        }

        if (statusEl) statusEl.innerHTML = '<i class="fas fa-check" style="color: #34d399;"></i>';
        invalidateCache(); // 使前端缓存失效
        
        // 如果是新增或层级发生变化，需要重新渲染整个列表以更新树结构
        if (isNew || category.parentId !== newParentId) {
            renderCategoryAdminTab(document.getElementById('tab-categories'));
        }

    } catch (error) {
        console.error(`保存分类 ${id} 失败:`, error);
        if (statusEl) statusEl.innerHTML = `<i class="fas fa-times" title="${error.message}" style="color: #f87171;"></i>`;
        // 如果是新增失败，最好将该行移除
        if (isNew) {
            allCategories = allCategories.filter(c => c.id !== id);
            listItem.remove();
        }
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
                    await initializePage('tab-categories'); // 删除操作后需要完全刷新数据
                } catch(error) {
                    showToast(`删除失败: ${error.message}`, true);
                }
            });
        }
    }
});
