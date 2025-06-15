document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Element Selectors & 2. State ---
    const adminPageContainer = document.getElementById('admin-page-container');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmText = document.getElementById('confirm-text');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');
    const adminPanelNav = document.querySelector('.admin-panel-nav');
    const adminTabContents = document.querySelectorAll('.admin-tab-content');
    const adminContentPanel = document.querySelector('.admin-panel-content');
    const bookmarkEditModal = document.getElementById('bookmark-edit-modal');
    const bookmarkEditForm = document.getElementById('bookmark-edit-form');
    let allBookmarks = [], allCategories = [], allUsers = [], dataVersion = null;

    // --- 3. UI Flow & Modals ---
    const showModal = (modal) => {
        hideAllModals();
        if (modal) {
            modalBackdrop.style.display = 'flex';
            modal.style.display = 'block';
        }
    };
    const hideAllModals = () => { if(modalBackdrop) modalBackdrop.style.display = 'none'; document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); };
    const showConfirm = (title, text, onConfirm) => {
        if (!confirmTitle || !confirmText || !confirmModal || !confirmBtnYes) return;
        confirmTitle.textContent = title;
        confirmText.textContent = text;
        showModal(confirmModal);
        confirmBtnYes.onclick = () => {
            hideAllModals();
            onConfirm();
        };
    };
    
    // --- 4. Core Logic ---
    async function initializePage(activeTabId = 'tab-categories') {
        try {
            const token = localStorage.getItem('jwt_token');
            const payload = parseJwtPayload(token);
            if (!payload || !payload.roles || !payload.roles.includes('admin')) throw new Error("Token is invalid or user is not an admin.");
            
            // [修复] 从响应头获取版本号
            const response = await fetch(`/api/data`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error(`Failed to fetch data: ${response.statusText}`);
            
            dataVersion = response.headers.get('ETag');
            const data = await response.json();
            
            allCategories = data.categories || [];
            allBookmarks = data.bookmarks || [];
            allUsers = data.users || [];
            
            if (adminPageContainer && !document.body.classList.contains('is-loading-removed')) {
                document.body.classList.remove('is-loading');
                adminPageContainer.style.display = 'flex';
                document.body.classList.add('is-loading-removed');
            }
            
            const linkToClick = document.querySelector(`.admin-tab-link[data-tab="${activeTabId}"]`);
            if (linkToClick && !linkToClick.classList.contains('active')) {
                linkToClick.click();
            } else if (!document.querySelector('.admin-tab-link.active')) {
                const firstLink = document.querySelector('.admin-tab-link');
                if (firstLink) firstLink.click();
            } else {
                renderAdminTab(activeTabId);
            }
        } catch (error) {
            console.error("Initialization failed:", error);
            window.location.href = 'index.html';
        }
    }

    if (adminPanelNav) {
        adminPanelNav.addEventListener('click', (e) => {
            e.preventDefault();
            const link = e.target.closest('.admin-tab-link');
            if (!link || link.classList.contains('active')) return;
            adminPanelNav.querySelectorAll('.admin-tab-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const tabId = link.dataset.tab;
            adminTabContents.forEach(content => content.classList.toggle('active', content.id === tabId));
            renderAdminTab(tabId);
        });
    }

    const renderAdminTab = (tabId) => {
        const container = document.getElementById(tabId);
        if (!container) return;
        container.innerHTML = '';
        switch (tabId) {
            case 'tab-categories': renderCategoryAdminTab(container); break;
            case 'tab-users': renderUserAdminTab(container); break;
            case 'tab-bookmarks': renderBookmarkAdminTab(container); break;
            case 'tab-system': renderSystemSettingsTab(container); break;
        }
    };

    const populateCategoryDropdown = (selectElement, categories, selectedId = null, ignoreId = null, options = { allowNoParent: true }) => {
        selectElement.innerHTML = '';
        if (options.allowNoParent) selectElement.innerHTML = '<option value="">顶级分类</option>';
        const categoryMap = new Map(categories.map(cat => [cat.id, { ...cat, children: [] }]));
        const tree = [];
        const sortedCategories = [...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
        
        sortedCategories.forEach(cat => {
            if (cat.id === ignoreId) return;
            const node = categoryMap.get(cat.id);
            if (cat.parentId && categoryMap.has(cat.parentId)) {
                categoryMap.get(cat.parentId).children.push(node);
            } else {
                tree.push(node);
            }
        });

        const buildOptions = (nodes, level) => {
            if (level >= 4) return;
            nodes.sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).forEach(node => {
                if (!node) return;
                const option = document.createElement('option');
                option.value = node.id;
                option.textContent = `${'— '.repeat(level)}${node.name}`;
                if (node.id === selectedId) option.selected = true;
                selectElement.appendChild(option);
                if (node.children.length > 0) buildOptions(node.children, level + 1);
            });
        };
        buildOptions(tree, 0);
    };
    
    const renderCategoryAdminTab = (container) => {
        container.innerHTML = `<p class="admin-panel-tip" style="margin-bottom: 1rem;">通过修改表单来调整分类，完成后请点击下方的“保存”按钮。</p><div class="category-admin-header"><span>排序</span><span>分类名称</span><span>上级分类</span><span>操作</span></div><div style="flex-grow: 1; overflow-y: auto; min-height: 0;"><ul id="category-admin-list"></ul></div><div class="admin-panel-actions"><button id="save-categories-btn" class="button button-primary"><i class="fas fa-save"></i> 保存全部分类</button><button id="add-new-category-btn" class="button"><i class="fas fa-plus"></i> 添加新分类</button></div>`;
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
        const buildList = (nodes, level) => {
            nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
                const li = document.createElement('li');
                li.dataset.id = cat.id;
                li.innerHTML = `<input type="number" class="cat-order-input" value="${cat.sortOrder || 0}"><div class="cat-name-cell" style="padding-left: ${level * 25}px;"><input type="text" class="cat-name-input" value="${escapeHTML(cat.name)}"></div><select class="cat-parent-select"></select><button class="delete-cat-btn button-icon danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
                populateCategoryDropdown(li.querySelector('.cat-parent-select'), allCategories, cat.parentId, cat.id);
                listEl.appendChild(li);
                if (cat.children && cat.children.length > 0) buildList(cat.children, level + 1);
            });
        };
        buildList(tree, 0);
    };

    const renderBookmarkList = (categoryId) => {
        const listEl = document.querySelector('#bookmark-admin-list-container ul');
        if (!listEl) return;
        let bookmarksToDisplay = categoryId === 'all' ? [...allBookmarks] : allBookmarks.filter(bm => bm.categoryId === categoryId);
        const categorySortMap = new Map(allCategories.map(cat => [cat.id, cat.sortOrder || 0]));
        bookmarksToDisplay.sort((a, b) => {
            const catA_sort = categorySortMap.get(a.categoryId) || 0;
            const catB_sort = categorySortMap.get(b.categoryId) || 0;
            if (catA_sort !== catB_sort) {
                return catA_sort - catB_sort;
            }
            return (a.sortOrder || 0) - (b.sortOrder || 0);
        });
        listEl.innerHTML = '';
        bookmarksToDisplay.forEach(bm => {
            const li = document.createElement('li');
            li.dataset.id = bm.id;
            li.innerHTML = `<input type="number" class="bm-sort-order" value="${bm.sortOrder || 0}"><input type="text" class="bm-name-input" value="${escapeHTML(bm.name)}"><select class="bm-category-select"></select><div class="bm-admin-actions"><button class="edit-bm-btn button-icon" title="编辑网址、描述、图标"><i class="fas fa-pencil-alt"></i></button><button class="delete-bm-btn danger button-icon" title="删除"><i class="fas fa-trash-alt"></i></button></div>`;
            const categorySelect = li.querySelector('.bm-category-select');
            populateCategoryDropdown(categorySelect, allCategories, bm.categoryId, null, { allowNoParent: false });
            listEl.appendChild(li);
        });
    };

    const renderBookmarkAdminTab = (container) => {
        container.innerHTML = `<p class="admin-panel-tip" style="margin-bottom: 1rem;">通过修改表单来调整分类。修改排序数字后，点击下方的“保存”按钮来应用更改。</p><div class="bookmark-admin-controls" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;"><span>筛选分类:</span><select id="bookmark-category-filter" style="width: auto; max-width: 350px; flex-grow: 1;"><option value="all">-- 显示全部分类 --</option></select></div><div class="bookmark-admin-header"><span class="sort-col">排序</span><span>书签名称</span><span>所属分类</span><span>操作</span></div><div style="flex-grow: 1; overflow-y: auto; min-height: 0;"><div id="bookmark-admin-list-container"><ul></ul></div></div><div class="admin-panel-actions"><button id="save-bookmarks-btn" class="button button-primary"><i class="fas fa-save"></i> 保存书签</button><button id="add-new-bookmark-btn" class="button"><i class="fas fa-plus"></i> 添加新书签</button></div>`;
        const categoryFilter = container.querySelector('#bookmark-category-filter');
        allCategories.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
            const o=document.createElement('option');
            o.value=cat.id;
            o.textContent=cat.name;
            categoryFilter.appendChild(o)
        });
        const lastFilter = sessionStorage.getItem('admin_bookmark_filter') || 'all';
        categoryFilter.value = lastFilter;
        renderBookmarkList(lastFilter);
    };

    const renderUserAdminTab = (container) => { /* ... */ };
    const renderSystemSettingsTab = (container) => { /* ... */ };

    const handleAddNewCategory = () => { /* ... */ };
    
    const handleSaveCategories = async () => {
        const listItems = document.querySelectorAll('#category-admin-list li');
        let hasError = false;
        const finalCategories = Array.from(listItems).map(li => {
            const name = li.querySelector('.cat-name-input').value.trim();
            if (!name) hasError = true;
            const idVal = li.dataset.id;
            return {
                id: idVal.startsWith('new-') ? `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : idVal,
                name: name,
                parentId: li.querySelector('.cat-parent-select').value || null,
                sortOrder: parseInt(li.querySelector('.cat-order-input').value) || 0,
            };
        });
        if (hasError) { alert('分类名称不能为空！'); return; }
        
        const oldCategories = JSON.parse(JSON.stringify(allCategories));
        allCategories = finalCategories;

        try {
            const result = await apiRequest('data', 'PATCH', { categories: finalCategories });
            dataVersion = result.version; // 更新版本号
        } catch (error) {
            allCategories = oldCategories;
            renderAdminTab('tab-categories');
            alert('保存失败: ' + error.message);
        }
    };

    const handleDeleteCategory = (catIdToDelete, catName) => {
        showConfirm('确认删除', `您确定要删除分类 "${catName}" 吗？这也会删除其下所有的子分类和书签。`, async () => {
            const oldCategories = JSON.parse(JSON.stringify(allCategories));
            const oldBookmarks = JSON.parse(JSON.stringify(allBookmarks));
            let idsToDelete = new Set([catIdToDelete]);
            let queue = [catIdToDelete];
            while (queue.length > 0) {
                const parentId = queue.shift();
                allCategories.forEach(c => {
                    if (c.parentId === parentId) { idsToDelete.add(c.id); queue.push(c.id); }
                });
            }
            allCategories = allCategories.filter(c => !idsToDelete.has(c.id));
            allBookmarks = allBookmarks.filter(bm => !idsToDelete.has(bm.categoryId));
            renderAdminTab('tab-categories');

            try {
                const result = await apiRequest('data', 'PATCH', { categories: allCategories, bookmarks: allBookmarks });
                dataVersion = result.version;
            } catch (error) {
                allCategories = oldCategories;
                allBookmarks = oldBookmarks;
                renderAdminTab('tab-categories');
                alert('删除失败: ' + error.message);
            }
        });
    };

    const populateUserForm = (user) => { /* ... */ };
    const clearUserForm = () => { /* ... */ };
    const renderUserFormRoles = (activeRoles = ['viewer']) => { /* ... */ };
    const renderUserFormCategories = (visibleIds = [], isDisabled = false) => { /* ... */ };
    const updateDefaultCategoryDropdown = (form, selectedId) => { /* ... */ };
    
    const handleUserFormSubmit = async (e) => {
        e.preventDefault();
        // ... (form data gathering) ...
        try {
            const result = await apiRequest(endpoint, method, userData);
            dataVersion = result.version;
            // ... (update local state and UI) ...
        } catch (error) { /* ... */ }
    };
    
    const handleSaveBookmarks = async () => {
        const listItems = document.querySelectorAll('#bookmark-admin-list-container li');
        let hasError = false;
        const oldBookmarks = JSON.parse(JSON.stringify(allBookmarks));
        
        listItems.forEach(li => {
            const id = li.dataset.id;
            const bookmark = allBookmarks.find(bm => bm.id === id);
            if (!bookmark) return;
            const newName = li.querySelector('.bm-name-input').value.trim();
            if(!newName) hasError = true;
            bookmark.sortOrder = parseInt(li.querySelector('.bm-sort-order').value) || 0;
            bookmark.name = newName;
            bookmark.categoryId = li.querySelector('.bm-category-select').value;
        });

        if (hasError) { alert('书签名称不能为空！'); return; }

        try {
            const result = await apiRequest('data', 'PATCH', { bookmarks: allBookmarks });
            dataVersion = result.version;
        } catch (error) { 
            allBookmarks = oldBookmarks;
            renderBookmarkList(document.getElementById('bookmark-category-filter').value);
            alert(`保存失败: ${error.message}`);
        }
    };

    const handleAddNewBookmark = () => { /* ... */ };
    const handleEditBookmark = (bookmark) => { /* ... */ };
    const handleDeleteBookmark = (bookmark) => { /* ... */ };
    const parseAndImport = async (htmlContent) => { /* ... */ };

    if (adminContentPanel) { /* ... (Master event listeners) ... */ }
    
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', hideAllModals));
    if(document.getElementById('confirm-btn-no')) document.getElementById('confirm-btn-no').onclick = hideAllModals;
    if(bookmarkEditForm) bookmarkEditForm.onsubmit = async (e) => {
        e.preventDefault();
        // ... (form data gathering) ...
        try {
            const result = await apiRequest(endpoint, method, data);
            dataVersion = result.version;
            // ... (update local state and UI) ...
        } catch (error) { /* ... */ }
    };
    
    initializePage();
});
