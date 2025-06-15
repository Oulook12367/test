// admin-bookmarks.js

// --- 渲染函数 ---
function renderBookmarkAdminTab(container) {
    container.innerHTML = `
        <p class="admin-panel-tip" style="margin-bottom: 1rem;">排序、名称和分类的更改将自动保存。网址、描述和图标需点击编辑按钮修改。</p>
        <div class="bookmark-admin-controls" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
            <span>筛选分类:</span>
            <select id="bookmark-category-filter" style="width: auto; max-width: 350px; flex-grow: 1;">
                <option value="all"> 显示全部分类 </option>
            </select>
        </div>
        <div class="bookmark-admin-header">
            <span class="sort-col">排序</span>
            <span>书签名称</span>
            <span>所属分类</span>
            <span>操作</span>
        </div>
        <div style="flex-grow: 1; overflow-y: auto; min-height: 0;">
            <div id="bookmark-admin-list-container"><ul></ul></div>
        </div>
        <div class="admin-panel-actions">
            <button id="add-new-bookmark-btn" class="button"><i class="fas fa-plus"></i> 添加新书签</button>
        </div>`;
    
    const categoryFilter = container.querySelector('#bookmark-category-filter');
    populateCategoryDropdown(categoryFilter, allCategories, null, null, { allowNoParent: false });
    // 添加"全部"选项
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = '显示全部分类';
    categoryFilter.prepend(allOption);

    const lastFilter = sessionStorage.getItem('admin_bookmark_filter') || 'all';
    categoryFilter.value = lastFilter;
    renderBookmarkList(lastFilter);
}

function renderBookmarkList(categoryId) {
    const listEl = document.querySelector('#bookmark-admin-list-container ul');
    if (!listEl) return;
    
    let bookmarksToDisplay = categoryId === 'all' 
        ? [...allBookmarks] 
        : allBookmarks.filter(bm => bm.categoryId === categoryId);
    
    bookmarksToDisplay.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    
    listEl.innerHTML = '';
    bookmarksToDisplay.forEach(bm => {
        const li = document.createElement('li');
        li.dataset.id = bm.id;
        li.innerHTML = `
            <input type="number" class="bm-sort-order" value="${bm.sortOrder || 0}">
            <input type="text" class="bm-name-input" value="${escapeHTML(bm.name)}">
            <select class="bm-category-select"></select>
            <div class="bm-admin-actions">
                <span class="item-status" style="display:inline-block; width: 20px;"></span>
                <button class="edit-bm-btn button-icon" title="编辑网址、描述、图标"><i class="fas fa-pencil-alt"></i></button>
                <button class="delete-bm-btn danger button-icon" title="删除"><i class="fas fa-trash-alt"></i></button>
            </div>`;
        const categorySelect = li.querySelector('.bm-category-select');
        populateCategoryDropdown(categorySelect, allCategories, bm.categoryId, null, { allowNoParent: false });
        listEl.appendChild(li);
    });
}

// --- 自动保存逻辑 ---
const handleBookmarkAutoSave = debounce(async (listItem) => {
    const id = listItem.dataset.id;
    const bookmark = allBookmarks.find(bm => bm.id === id);
    if (!bookmark) return;

    const statusEl = listItem.querySelector('.item-status');

    const newName = listItem.querySelector('.bm-name-input').value.trim();
    const newSortOrder = parseInt(listItem.querySelector('.bm-sort-order').value) || 0;
    const newCategoryId = listItem.querySelector('.bm-category-select').value;
    
    if (bookmark.name === newName && (bookmark.sortOrder||0) === newSortOrder && bookmark.categoryId === newCategoryId) {
        return; 
    }
    
    if (!newName) {
        showToast("书签名称不能为空！", true);
        listItem.querySelector('.bm-name-input').value = bookmark.name;
        return;
    }

    bookmark.name = newName;
    bookmark.sortOrder = newSortOrder;
    bookmark.categoryId = newCategoryId;

    try {
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        await apiRequest(`bookmarks/${id}`, 'PUT', bookmark);
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-check" style="color: #34d399;"></i>';
        invalidateCache();
    } catch (error) {
        console.error(`自动保存书签 ${id} 失败:`, error);
        if (statusEl) statusEl.innerHTML = `<i class="fas fa-times" title="${error.message}" style="color: #f87171;"></i>`;
    } finally {
        setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 2000);
    }
}, 750);


// --- 事件处理 ---
document.addEventListener('input', event => {
    if (document.getElementById('tab-bookmarks')?.classList.contains('active')) {
        const listItem = event.target.closest('li[data-id]');
        if (listItem) handleBookmarkAutoSave(listItem);
    }
});

document.addEventListener('change', event => {
    if (document.getElementById('tab-bookmarks')?.classList.contains('active')) {
        if (event.target.id === 'bookmark-category-filter') {
            const newCategoryId = event.target.value;
            sessionStorage.setItem('admin_bookmark_filter', newCategoryId);
            renderBookmarkList(newCategoryId);
        }
    }
});

document.addEventListener('click', event => {
    if (document.getElementById('tab-bookmarks')?.classList.contains('active')) {
        const target = event.target;
        const listItem = target.closest('li[data-id]');

        if (target.closest('#add-new-bookmark-btn')) {
            openBookmarkEditModal(); // 打开空表单
        } else if (listItem) {
            const bookmarkId = listItem.dataset.id;
            const bookmark = allBookmarks.find(bm => bm.id === bookmarkId);
            if (!bookmark) return;

            if (target.closest('.edit-bm-btn')) {
                openBookmarkEditModal(bookmark); // 打开预填充表单
            } else if (target.closest('.delete-bm-btn')) {
                showConfirm('删除书签', `确定删除书签 "${bookmark.name}"?`, async () => {
                    try {
                        await apiRequest(`bookmarks/${bookmark.id}`, 'DELETE');
                        showToast("书签删除成功！");
                        invalidateCache();
                        // 重新加载数据并渲染
                        const data = await apiRequest('data');
                        allBookmarks = data.bookmarks;
                        renderBookmarkList(document.getElementById('bookmark-category-filter').value);
                    } catch (error) {
                        showToast(`删除失败: ${error.message}`, true);
                    }
                });
            }
        }
    }
});


// --- 书签编辑模态框逻辑 ---
function openBookmarkEditModal(bookmark = null) {
    const modal = document.getElementById('bookmark-edit-modal');
    const form = document.getElementById('bookmark-edit-form');
    if (!modal || !form) return;
    
    form.reset();
    form.querySelector('.modal-error-message').textContent = '';
    document.getElementById('bookmark-modal-title').textContent = bookmark ? '编辑书签' : '添加新书签';
    form.querySelector('#bm-edit-id').value = bookmark ? bookmark.id : '';
    form.querySelector('#bm-edit-name').value = bookmark ? bookmark.name : '';
    form.querySelector('#bm-edit-url').value = bookmark ? bookmark.url : '';
    form.querySelector('#bm-edit-desc').value = bookmark ? (bookmark.description || '') : '';
    form.querySelector('#bm-edit-icon').value = bookmark ? (bookmark.icon || '') : '';
    
    const categorySelect = form.querySelector('#bm-edit-category');
    const selectedCatId = bookmark ? bookmark.categoryId : (document.getElementById('bookmark-category-filter').value || allCategories[0]?.id);
    populateCategoryDropdown(categorySelect, allCategories, selectedCatId, null, { allowNoParent: false });

    showModal(modal);
}

// 提交编辑/新增书签的表单
document.getElementById('bookmark-edit-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const id = form.querySelector('#bm-edit-id').value;
    const data = {
        id: id,
        name: form.querySelector('#bm-edit-name').value,
        url: form.querySelector('#bm-edit-url').value,
        description: form.querySelector('#bm-edit-desc').value,
        icon: form.querySelector('#bm-edit-icon').value,
        categoryId: form.querySelector('#bm-edit-category').value,
        // sortOrder将由后端处理
    };

    const endpoint = id ? `bookmarks/${id}` : 'bookmarks';
    const method = id ? 'PUT' : 'POST';

    try {
        await apiRequest(endpoint, method, data);
        showToast(`书签${id ? '更新' : '添加'}成功！`);
        hideAllModals();
        invalidateCache();
        // 重新加载数据并渲染
        const freshData = await apiRequest('data');
        allBookmarks = freshData.bookmarks;
        allCategories = freshData.categories; // 分类也可能变化
        renderBookmarkList(document.getElementById('bookmark-category-filter').value);
    } catch (error) {
        form.querySelector('.modal-error-message').textContent = error.message;
    }
});
