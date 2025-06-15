// admin-categories.js

// --- 渲染函数 ---
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
    const categoryMap = new Map(allCategories.map(c => [c.id, {...c, children: []}]));
    const tree = [];
    allCategories.forEach(c => {
        const node = categoryMap.get(c.id);
        if (c.parentId && categoryMap.has(c.parentId)) {
            categoryMap.get(c.parentId).children.push(node);
        } else {
            tree.push(node);
        }
    });
    tree.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const buildList = (nodes, level) => {
        nodes.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
            const li = document.createElement('li');
            li.dataset.id = cat.id;
            li.innerHTML = `
                <input type="number" class="cat-order-input" value="${cat.sortOrder || 0}">
                <div class="cat-name-cell" style="padding-left: ${level * 25}px;">
                    <input type="text" class="cat-name-input" value="${escapeHTML(cat.name)}">
                </div>
                <select class="cat-parent-select"></select>
                <div class="cat-actions" style="display: flex; align-items: center; gap: 5px;">
                     <span class="item-status" style="display:inline-block; width: 20px;"></span>
                     <button class="delete-cat-btn button-icon danger" title="删除"><i class="fas fa-trash-alt"></i></button>
                </div>`;
            populateCategoryDropdown(li.querySelector('.cat-parent-select'), allCategories, cat.parentId, cat.id);
            listEl.appendChild(li);
            if (cat.children && cat.children.length > 0) buildList(cat.children, level + 1);
        });
    };
    buildList(tree, 0);
}

// --- 自动保存逻辑 ---
const handleCategoryAutoSave = debounce(async (listItem) => {
    const id = listItem.dataset.id;
    if (!id || id.startsWith('new-')) return; // 不保存未提交的新分类

    const category = allCategories.find(c => c.id === id);
    if (!category) return;

    const statusEl = listItem.querySelector('.item-status');

    const newName = listItem.querySelector('.cat-name-input').value.trim();
    const newSortOrder = parseInt(listItem.querySelector('.cat-order-input').value) || 0;
    const newParentId = listItem.querySelector('.cat-parent-select').value || null;

    if (category.name === newName && category.sortOrder === newSortOrder && category.parentId === newParentId) {
        return; // 数据未变
    }
    
    if (!newName) {
        showToast("分类名称不能为空！", true);
        listItem.querySelector('.cat-name-input').value = category.name; // 恢复旧名称
        return;
    }

    // 乐观更新本地数据
    category.name = newName;
    category.sortOrder = newSortOrder;
    category.parentId = newParentId;

    try {
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        // 在新架构中，我们需要一个精细化的API来更新分类
        // await apiRequest(`categories/${id}`, 'PUT', category);
        showToast("分类自动保存功能需要后端支持PUT /api/categories/:id接口", true); // 临时提示
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-check" style="color: #34d399;"></i>';
        invalidateCache();
    } catch (error) {
        console.error(`自动保存分类 ${id} 失败:`, error);
        if (statusEl) statusEl.innerHTML = `<i class="fas fa-times" title="${error.message}" style="color: #f87171;"></i>`;
    } finally {
        setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 2000);
    }
}, 750);


// --- 事件处理 ---
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
        
        // 添加新分类
        if (target.closest('#add-new-category-btn')) {
            // ... (此处逻辑与旧版类似，在UI上添加一个新行，但需要一个“确认添加”按钮来调用POST API)
            // 简单起见，可以弹出一个模态框来添加新分类
            showToast("功能待实现：弹出模态框添加新分类。");
        }
        
        // 删除分类
        if (target.closest('.delete-cat-btn')) {
            const listItem = target.closest('li[data-id]');
            const catId = listItem.dataset.id;
            const catName = listItem.querySelector('.cat-name-input').value;
            showConfirm('确认删除', `您确定要删除分类 "${catName}" 吗？其下所有子分类和书签都将被删除。`, async () => {
                // 后端需要实现级联删除的逻辑
                // await apiRequest(`categories/${catId}`, 'DELETE');
                showToast("分类删除功能需要后端支持DELETE /api/categories/:id接口", true); // 临时提示
                invalidateCache();
                // 成功后重新加载页面
                // location.reload();
            });
        }
    }
});
