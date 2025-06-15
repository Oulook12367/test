// admin-categories.js

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
    
    // 【修复】使用新的排序函数来渲染列表
    const sortedCategories = getHierarchicalSortedCategories(allCategories);
    
    listEl.innerHTML = ''; // 清空
    sortedCategories.forEach(cat => {
        const li = document.createElement('li');
        li.dataset.id = cat.id;
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

const handleCategoryAutoSave = debounce(async (listItem) => {
    const id = listItem.dataset.id;
    if (!id || id.startsWith('new-')) return;

    const category = allCategories.find(c => c.id === id);
    if (!category) return;

    const statusEl = listItem.querySelector('.item-status');
    const nameInput = listItem.querySelector('.cat-name-input');
    const newName = nameInput.value.trim();
    const newSortOrder = parseInt(listItem.querySelector('.cat-order-input').value) || 0;
    const newParentId = listItem.querySelector('.cat-parent-select').value || null;

    if (category.name === newName && category.sortOrder === newSortOrder && category.parentId === newParentId) {
        return;
    }
    
    if (!newName) {
        showToast("分类名称不能为空！", true);
        nameInput.value = category.name;
        return;
    }

    category.name = newName;
    category.sortOrder = newSortOrder;
    category.parentId = newParentId;

    try {
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        await apiRequest(`categories/${id}`, 'PUT', category);
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-check" style="color: #34d399;"></i>';
        invalidateCache();
    } catch (error) {
        console.error(`自动保存分类 ${id} 失败:`, error);
        if (statusEl) statusEl.innerHTML = `<i class="fas fa-times" title="${error.message}" style="color: #f87171;"></i>`;
    } finally {
        setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 2000);
    }
}, 750);


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
        
        // 【修复】新增分类功能
        if (target.closest('#add-new-category-btn')) {
            const newCatName = prompt("请输入新分类的名称：");
            if(newCatName && newCatName.trim()){
                (async () => {
                    try {
                        const newCategory = await apiRequest('categories', 'POST', { name: newCatName.trim() });
                        showToast("新增分类成功！");
                        invalidateCache();
                        allCategories.push(newCategory); // 手动更新本地状态
                        renderCategoryAdminTab(document.getElementById('tab-categories')); // 重新渲染UI
                    } catch(error) {
                        showToast(`添加分类失败: ${error.message}`, true);
                    }
                })();
            }
        }
        
        if (target.closest('.delete-cat-btn')) {
            const listItem = target.closest('li[data-id]');
            const catId = listItem.dataset.id;
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
