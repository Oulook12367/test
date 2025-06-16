// admin-bookmarks.js

/**
 * 渲染“书签管理”标签页的UI结构。
 * @param {HTMLElement} container - 用于承载内容的DOM元素。
 */
function renderBookmarkAdminTab(container) {
    container.innerHTML = `
        <p class="admin-panel-tip" style="margin-bottom: 1rem;">排序、名称和分类的更改将自动保存。网址、描述和图标需点击编辑按钮修改。</p>
        <div class="bookmark-admin-controls" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
            <span>筛选分类:</span>
            <select id="bookmark-category-filter" style="width: auto; max-width: 350px; flex-grow: 1;"></select>
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
    populateCategoryDropdown(categoryFilter, allCategories, null, null, { allowNoParent: true });
    const firstOption = categoryFilter.querySelector('option[value=""]');
    if (firstOption) {
        firstOption.textContent = '显示全部分类';
        firstOption.value = 'all';
    }

    const lastFilter = sessionStorage.getItem('admin_bookmark_filter') || 'all';
    categoryFilter.value = lastFilter;
    renderBookmarkList(lastFilter);
}

/**
 * 【修复】根据指定的分类ID渲染书签列表，并使用正确的排序逻辑。
 * @param {string} categoryId - 要筛选的分类ID，或 'all' 表示所有分类。
 */
function renderBookmarkList(categoryId) {
    const listEl = document.querySelector('#bookmark-admin-list-container ul');
    if (!listEl) return;
    
    let bookmarksToDisplay;

    if (categoryId === 'all') {
        bookmarksToDisplay = [...allBookmarks];
        // 【修复】当显示所有书签时，使用层级排序
        const sortedCategories = getHierarchicalSortedCategories(allCategories);
        const categoryOrderMap = new Map(sortedCategories.map((cat, index) => [cat.id, index]));
        
        bookmarksToDisplay.sort((a, b) => {
            const orderA = categoryOrderMap.get(a.categoryId) ?? Infinity;
            const orderB = categoryOrderMap.get(b.categoryId) ?? Infinity;
            if (orderA !== orderB) return orderA - orderB;
            return (a.sortOrder || 0) - (b.sortOrder || 0);
        });
    } else {
        // 当按分类筛选时，只需按书签自身排序
        bookmarksToDisplay = allBookmarks.filter(bm => bm.categoryId === categoryId);
        bookmarksToDisplay.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    }
    
    listEl.innerHTML = '';
    bookmarksToDisplay.forEach(bm => {
        const li = document.createElement('li');
        li.dataset.id = bm.id;
        li.innerHTML = `
            <input type="number" class="bm-sort-order" value="${bm.sortOrder || 0}" min="0">
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


const handleBookmarkAutoSave = debounce(async (listItem) => {
    const id = listItem.dataset.id;
    const bookmark = allBookmarks.find(bm => bm.id === id);
    if (!bookmark) return;

    const statusEl = listItem.querySelector('.item-status');
    const nameInput = listItem.querySelector('.bm-name-input');
    const newName = nameInput.value.trim();
    const newSortOrder = parseInt(listItem.querySelector('.bm-sort-order').value) || 0;
    const newCategoryId = listItem.querySelector('.bm-category-select').value;
    
    if (bookmark.name === newName && (bookmark.sortOrder||0) === newSortOrder && bookmark.categoryId === newCategoryId) {
        return; 
    }
    
    if (!newName) {
        showToast("书签名称不能为空！", true);
        nameInput.value = bookmark.name;
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


// --- 事件监听器 ---

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
            openBookmarkEditModal();
        } else if (listItem) {
            const bookmarkId = listItem.dataset.id;
            const bookmark = allBookmarks.find(bm => bm.id === bookmarkId);
            if (!bookmark) return;

            if (target.closest('.edit-bm-btn')) {
                openBookmarkEditModal(bookmark);
            } else if (target.closest('.delete-bm-btn')) {
                showConfirm('删除书签', `确定删除书签 "${bookmark.name}"?`, async () => {
                    try {
                        await apiRequest(`bookmarks/${bookmark.id}`, 'DELETE');
                        showToast("书签删除成功！");
                        invalidateCache();
                        allBookmarks = allBookmarks.filter(bm => bm.id !== bookmarkId);
                        renderBookmarkList(document.getElementById('bookmark-category-filter').value);
                    } catch (error) {
                        showToast(`删除失败: ${error.message}`, true);
                    }
                });
            }
        }
    }
});

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
    const filterValue = document.getElementById('bookmark-category-filter').value;
    const selectedCatId = bookmark ? bookmark.categoryId : (filterValue !== 'all' ? filterValue : allCategories[0]?.id);
    populateCategoryDropdown(categorySelect, allCategories, selectedCatId, null, { allowNoParent: false });

    showModal(modal);
}

document.getElementById('bookmark-edit-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    const id = form.querySelector('#bm-edit-id').value;
    const data = {
        name: form.querySelector('#bm-edit-name').value.trim(),
        url: form.querySelector('#bm-edit-url').value.trim(),
        description: form.querySelector('#bm-edit-desc').value.trim(),
        icon: form.querySelector('#bm-edit-icon').value.trim(),
        categoryId: form.querySelector('#bm-edit-category').value,
    };
    if(id) data.id = id;

    if (!data.name || !data.url || !data.categoryId) {
        form.querySelector('.modal-error-message').textContent = '名称、网址和分类为必填项。';
        return;
    }

    const endpoint = id ? `bookmarks/${id}` : 'bookmarks';
    const method = id ? 'PUT' : 'POST';

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const savedBookmark = await apiRequest(endpoint, method, data);
        showToast(`书签${id ? '更新' : '添加'}成功！`);
        hideAllModals();
        invalidateCache();
        
        if (id) {
            const index = allBookmarks.findIndex(bm => bm.id === id);
            if (index > -1) allBookmarks[index] = savedBookmark;
        } else {
            allBookmarks.push(savedBookmark);
        }
        renderBookmarkList(document.getElementById('bookmark-category-filter').value);

    } catch (error) {
        form.querySelector('.modal-error-message').textContent = error.message;
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
});

document.addEventListener('focusout', async (event) => {
    if (event.target.id === 'bm-edit-url') {
        const urlInput = event.target;
        const url = urlInput.value.trim();
        const form = urlInput.closest('form');
        
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return;

        const nameInput = form.querySelector('#bm-edit-name');
        if (nameInput.value) return;

        const originalPlaceholder = urlInput.placeholder;
        const errorEl = form.querySelector('.modal-error-message');
        if(errorEl) errorEl.textContent = '';
        
        try {
            urlInput.placeholder = '正在获取网站信息...';
            urlInput.disabled = true;
            
            const data = await apiRequest(`scrape-url?url=${encodeURIComponent(url)}`);

            if (data.title && !nameInput.value) {
                nameInput.value = data.title;
            }
            const descInput = form.querySelector('#bm-edit-desc');
            if (data.description && !descInput.value) {
                descInput.value = data.description;
            }
            const iconInput = form.querySelector('#bm-edit-icon');
            if (data.icon && !iconInput.value) {
                iconInput.value = data.icon;
            }
        } catch (error) {
            console.error('网址信息获取失败:', error);
            if (errorEl) errorEl.textContent = `网址信息获取失败: ${error.message}`;
        } finally {
            urlInput.placeholder = originalPlaceholder;
            urlInput.disabled = false;
        }
    }
});
