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
    
    // 将扁平的分类数组转换为层级树结构以便渲染
    const categoryMap = new Map(allCategories.map(c => [c.id, {...c, children: []}]));
    const tree = [];
    allCategories.forEach(c => {
        if (!c) return;
        const node = categoryMap.get(c.id);
        if (c.parentId && categoryMap.has(c.parentId)) {
            const parent = categoryMap.get(c.parentId);
            if(parent) parent.children.push(node);
        } else {
            tree.push(node);
        }
    });
    // 确保顶级分类按排序值排序
    tree.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    /**
     * 递归构建分类列表的UI。
     * @param {Array} nodes - 当前层级的分类节点数组。
     * @param {number} level - 当前的层级深度，用于缩进。
     */
    const buildList = (nodes, level) => {
        // 确保子分类也按排序值排序
        nodes.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
            if (!cat) return;
            const li = document.createElement('li');
            li.dataset.id = cat.id;
            li.innerHTML = `
                <input type="number" class="cat-order-input" value="${cat.sortOrder || 0}" min="0">
                <div class="cat-name-cell" style="padding-left: ${level * 25}px;">
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
            // 如果有子分类，则递归构建
            if (cat.children && cat.children.length > 0) buildList(cat.children, level + 1);
        });
    };
    buildList(tree, 0);
}

/**
 * 带有防抖功能的自动保存函数，用于处理分类的更改。
 * @param {HTMLElement} listItem - 被修改的列表项DOM元素。
 */
const handleCategoryAutoSave = debounce(async (listItem) => {
    const id = listItem.dataset.id;
    // 不保存尚未提交到后端的新分类行
    if (!id || id.startsWith('new-')) return;

    const category = allCategories.find(c => c.id === id);
    if (!category) return;

    const statusEl = listItem.querySelector('.item-status');
    const nameInput = listItem.querySelector('.cat-name-input');
    
    // 从UI元素获取最新数据
    const newName = nameInput.value.trim();
    const newSortOrder = parseInt(listItem.querySelector('.cat-order-input').value) || 0;
    const newParentId = listItem.querySelector('.cat-parent-select').value || null;

    // 如果数据没有实际变化，则不执行任何操作
    if (category.name === newName && category.sortOrder === newSortOrder && category.parentId === newParentId) {
        return;
    }
    
    // 数据校验
    if (!newName) {
        showToast("分类名称不能为空！", true);
        nameInput.value = category.name; // 将输入框的值恢复为修改前的值
        return;
    }

    // 乐观更新本地JS数据模型
    category.name = newName;
    category.sortOrder = newSortOrder;
    category.parentId = newParentId;

    try {
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        // 假设后端已有 PUT /api/categories/:id 接口
        // await apiRequest(`categories/${id}`, 'PUT', category);
        
        // 临时提示，因为后端接口可能尚未实现
        console.warn("自动保存功能依赖后端的 PUT /api/categories/:id 接口。");
        showToast("分类已保存 (前端模拟)。");

        if (statusEl) statusEl.innerHTML = '<i class="fas fa-check" style="color: #34d399;"></i>';
        invalidateCache(); // 使前端缓存失效
    } catch (error) {
        console.error(`自动保存分类 ${id} 失败:`, error);
        if (statusEl) statusEl.innerHTML = `<i class="fas fa-times" title="${error.message}" style="color: #f87171;"></i>`;
        // 此处可以加入数据回滚逻辑
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
    // 确保只在分类管理标签页激活时生效
    if (document.getElementById('tab-categories')?.classList.contains('active')) {
        const target = event.target;
        
        // 处理“添加新分类”按钮点击事件
        if (target.closest('#add-new-category-btn')) {
            // 将来可以改为更优雅的模态框
            const newCatName = prompt("请输入新分类的名称：");
            if(newCatName && newCatName.trim()){
                (async () => {
                    try {
                        // 假设后端已有 POST /api/categories 接口
                        // await apiRequest('categories', 'POST', { name: newCatName.trim() });
                        showToast("新增分类功能需要后端支持POST /api/categories接口", true);
                        invalidateCache();
                        // 成功后应重新初始化页面以显示新分类
                        // await initializePage('tab-categories');
                    } catch(error) {
                        showToast(`添加分类失败: ${error.message}`, true);
                    }
                })();
            }
        }
        
        // 处理“删除分类”按钮点击事件
        if (target.closest('.delete-cat-btn')) {
            const listItem = target.closest('li[data-id]');
            const catId = listItem.dataset.id;
            const catName = listItem.querySelector('.cat-name-input').value;
            showConfirm('确认删除', `您确定要删除分类 "${catName}" 吗？其下所有子分类和书签都将被删除。`, async () => {
                try {
                     // 假设后端已有 DELETE /api/categories/:id 接口
                    // await apiRequest(`categories/${catId}`, 'DELETE');
                    showToast("删除分类功能需要后端支持DELETE /api/categories/:id接口", true);
                    invalidateCache();
                    // 成功后应重新初始化页面
                    // await initializePage('tab-categories');
                } catch(error) {
                    showToast(`删除失败: ${error.message}`, true);
                }
            });
        }
    }
});
