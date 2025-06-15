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
    let allBookmarks = [], allCategories = [], allUsers = [];

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
            
            const data = await apiRequest('data');
            const currentUserFromServer = data.users.find(u => u.username === payload.sub);
            if (!currentUserFromServer || !currentUserFromServer.roles.includes('admin')) throw new Error("User permissions may have been changed.");
            
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

    const renderUserAdminTab = (container) => { /* ... (no changes) ... */ };
    const renderSystemSettingsTab = (container) => { /* ... (no changes) ... */ };
    const handleAddNewCategory = () => { /* ... (no changes) ... */ };

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
        
        const oldCategories = JSON.parse(JSON.stringify(allCategories)); // Deep copy for rollback
        allCategories = finalCategories; // Optimistic update
        renderAdminTab('tab-categories');

        try {
            await apiRequest('data', 'PUT', { categories: finalCategories });
        } catch (error) {
            allCategories = oldCategories; // Rollback on failure
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
            renderAdminTab('tab-categories'); // Optimistic update

            try {
                await apiRequest('data', 'PUT', { categories: allCategories, bookmarks: allBookmarks });
            } catch (error) {
                allCategories = oldCategories; // Rollback
                allBookmarks = oldBookmarks;
                renderAdminTab('tab-categories');
                alert('删除失败: ' + error.message);
            }
        });
    };

    const populateUserForm = (user) => { /* ... (no changes) ... */ };
    const clearUserForm = () => { /* ... (no changes) ... */ };
    const renderUserFormRoles = (activeRoles = ['viewer']) => { /* ... (no changes) ... */ };
    const renderUserFormCategories = (visibleIds = [], isDisabled = false) => { /* ... (no changes) ... */ };
    const updateDefaultCategoryDropdown = (form, selectedId) => { /* ... (no changes) ... */ };
    
    const handleUserFormSubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const hiddenUsername = form.querySelector('#user-form-username-hidden').value;
        const isEditing = !!hiddenUsername;
        const username = form.querySelector('#user-form-username').value.trim();
        const password = form.querySelector('#user-form-password').value;
        const errorEl = form.querySelector('.modal-error-message');
        errorEl.textContent = '';
        if (!username) { errorEl.textContent = '用户名不能为空'; return; }
        if (!isEditing && !password) { errorEl.textContent = '新用户必须设置密码'; return; }
        const selectedRole = form.querySelector('input[name="role-selection"]:checked').value;
        const userData = {
            roles: [selectedRole],
            permissions: { visibleCategories: Array.from(form.querySelectorAll('#user-form-categories input:checked')).map(cb => cb.value) },
            defaultCategoryId: form.querySelector('#user-form-default-cat').value
        };
        if (password) userData.password = password;
        if (!isEditing) userData.username = username;
        
        const endpoint = isEditing ? `users/${encodeURIComponent(hiddenUsername)}` : 'users';
        const method = isEditing ? 'PUT' : 'POST';
        
        try {
            const updatedUser = await apiRequest(endpoint, method, userData);
            const token = localStorage.getItem('jwt_token');
            if (token) {
                const payload = parseJwtPayload(token);
                if (payload.sub === updatedUser.username && !updatedUser.roles.includes('admin')) {
                    alert('您的管理员权限已被移除，将退出管理后台并返回主页。');
                    localStorage.removeItem('jwt_token');
                    window.location.href = 'index.html';
                    return;
                }
            }
            
            const userIndex = allUsers.findIndex(u => u.username === updatedUser.username);
            if (userIndex > -1) {
                allUsers[userIndex] = { ...allUsers[userIndex], ...updatedUser };
            } else {
                allUsers.push(updatedUser);
            }
            renderAdminTab('tab-users');
            clearUserForm();
        } catch (error) { errorEl.textContent = error.message; }
    };
    
    const handleSaveBookmarks = async () => {
        const listItems = document.querySelectorAll('#bookmark-admin-list-container li');
        let hasChanges = false;
        const newBookmarks = JSON.parse(JSON.stringify(allBookmarks)); // Create a temporary copy
        
        listItems.forEach(li => {
            const id = li.dataset.id;
            const bookmark = newBookmarks.find(bm => bm.id === id);
            if (!bookmark) return;

            const newSortOrder = parseInt(li.querySelector('.bm-sort-order').value) || 0;
            const newName = li.querySelector('.bm-name-input').value.trim();
            const newCategoryId = li.querySelector('.bm-category-select').value;

            if ((bookmark.sortOrder || 0) !== newSortOrder || bookmark.name !== newName || bookmark.categoryId !== newCategoryId) {
                bookmark.sortOrder = newSortOrder;
                bookmark.name = newName;
                bookmark.categoryId = newCategoryId;
                hasChanges = true;
            }
        });

        if (!hasChanges) { return; }
        
        const oldBookmarks = JSON.parse(JSON.stringify(allBookmarks));
        allBookmarks = newBookmarks; // Optimistic update
        renderBookmarkList(document.getElementById('bookmark-category-filter').value);

        try {
            await apiRequest('data', 'PUT', { bookmarks: allBookmarks });
        } catch (error) { 
            allBookmarks = oldBookmarks; // Rollback
            renderBookmarkList(document.getElementById('bookmark-category-filter').value);
            alert(`保存失败: ${error.message}`);
        }
    };

    const handleAddNewBookmark = () => { /* ... (no changes) ... */ };
    const handleEditBookmark = (bookmark) => { /* ... (no changes) ... */ };

    const handleDeleteBookmark = (bookmark) => {
        showConfirm('删除书签', `确定删除书签 "${bookmark.name}"?`, async () => {
            const oldBookmarks = JSON.parse(JSON.stringify(allBookmarks));
            allBookmarks = allBookmarks.filter(bm => bm.id !== bookmark.id);
            renderBookmarkList(document.getElementById('bookmark-category-filter').value); // Optimistic update
            try {
                await apiRequest(`bookmarks/${bookmark.id}`, 'DELETE');
            } catch (error) { 
                allBookmarks = oldBookmarks; // Rollback
                renderBookmarkList(document.getElementById('bookmark-category-filter').value);
                alert(`删除失败: ${error.message}`);
            }
        });
    };
    
    const parseAndImport = async (htmlContent) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        let importedCategories = [];
        let importedBookmarks = [];
        const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const highestCatSortOrder = allCategories.length > 0 ? Math.max(...allCategories.map(c => c.sortOrder || 0)) : -1;
        const highestBmSortOrder = allBookmarks.length > 0 ? Math.max(...allBookmarks.map(bm => bm.sortOrder || 0)) : -1;
        let currentCatSort = highestCatSortOrder + 1;
        let currentBmSort = highestBmSortOrder + 1;
        const parseNode = (node, parentId) => {
            if (!node || !node.children) return;
            for (const child of node.children) {
                if (child.tagName !== 'DT') continue;
                const folderHeader = child.querySelector('h3');
                const link = child.querySelector('a');
                if (folderHeader) {
                    const newCategoryId = generateId('cat');
                    importedCategories.push({ id: newCategoryId, name: folderHeader.textContent.trim(), parentId: parentId, sortOrder: currentCatSort++ });
                    let subList = child.querySelector('dl');
                    if (!subList) {
                        let nextSibling = child.nextElementSibling;
                        while(nextSibling && nextSibling.tagName !== 'DL') { nextSibling = nextSibling.nextElementSibling; }
                        subList = nextSibling;
                    }
                    if (subList) parseNode(subList, newCategoryId);
                } else if (link) {
                    importedBookmarks.push({
                        id: generateId('bm'), name: link.textContent.trim(), url: link.href, categoryId: parentId,
                        description: '', icon: link.getAttribute('icon') || '', sortOrder: currentBmSort++
                    });
                }
            }
        };
        const rootDl = doc.querySelector('dl');
        if (!rootDl) throw new Error('无效的书签文件格式。');
        let uncategorizedCatId = null;
        if (Array.from(rootDl.children).some(child => child.tagName === 'DT' && child.querySelector('A'))) {
            let uncategorizedCat = allCategories.find(c => c.name === '导入的未分类书签');
            if (!uncategorizedCat) {
                uncategorizedCatId = generateId('cat');
                importedCategories.push({ id: uncategorizedCatId, name: '导入的未分类书签', parentId: null, sortOrder: currentCatSort++ });
            } else {
                uncategorizedCatId = uncategorizedCat.id;
            }
        }
        parseNode(rootDl, null);
        importedBookmarks.forEach(bm => {
            if (bm.categoryId === null && uncategorizedCatId) bm.categoryId = uncategorizedCatId;
        });
        if (importedCategories.length === 0 && importedBookmarks.length === 0) throw new Error('未在文件中找到可导入的书签或文件夹。');
        const finalCategories = [...allCategories, ...importedCategories];
        const finalBookmarks = [...allBookmarks, ...importedBookmarks];
        
        try {
            await apiRequest('data', 'PUT', { categories: finalCategories, bookmarks: finalBookmarks });
            allCategories = finalCategories;
            allBookmarks = finalBookmarks;
            renderAdminTab('tab-system');
        } catch (error) {
            alert(`导入失败: ${error.message}`);
        }
    };

    if (adminContentPanel) {
        adminContentPanel.addEventListener('click', (event) => {
            const target = event.target;
            const activeTab = document.querySelector('.admin-tab-content.active');
            if (!activeTab) return;
            switch (activeTab.id) {
                case 'tab-categories': {
                    if (target.closest('.delete-cat-btn')) {
                        event.stopPropagation();
                        const listItem = target.closest('li[data-id]');
                        if (!listItem) return;
                        const catId = listItem.dataset.id;
                        if (catId.startsWith('new-')) {
                            listItem.remove();
                        } else {
                            const catName = listItem.querySelector('.cat-name-input').value;
                            handleDeleteCategory(catId, catName);
                        }
                    } else if (target.closest('#add-new-category-btn')) {
                        handleAddNewCategory();
                    } else if (target.closest('#save-categories-btn')) {
                        handleSaveCategories();
                    }
                    break;
                }
                case 'tab-bookmarks': {
                    const bmListItem = target.closest('li[data-id]');
                    if (bmListItem) {
                        const bookmark = allBookmarks.find(bm => bm.id === bmListItem.dataset.id);
                        if (!bookmark) return;
                        if (target.closest('.edit-bm-btn')) {
                            event.stopPropagation();
                            handleEditBookmark(bookmark);
                        } else if (target.closest('.delete-bm-btn')) {
                            event.stopPropagation();
                            handleDeleteBookmark(bookmark);
                        }
                    } else {
                        if (target.closest('#add-new-bookmark-btn')) {
                            handleAddNewBookmark();
                        } else if (target.closest('#save-bookmarks-btn')) {
                            handleSaveBookmarks();
                        }
                    }
                    break;
                }
                case 'tab-users': {
                    const userListItem = target.closest('li[data-username]');
                    if (target.closest('.button-icon.danger')) {
                        event.stopPropagation();
                        if (!userListItem) return;
                        const username = userListItem.dataset.username;
                        showConfirm('删除用户', `确定删除用户 "${username}"?`, async () => {
                            const oldUsers = JSON.parse(JSON.stringify(allUsers));
                            allUsers = allUsers.filter(u => u.username !== username);
                            renderAdminTab('tab-users');
                            try {
                                await apiRequest(`users/${encodeURIComponent(username)}`, 'DELETE');
                            } catch (error) { 
                                allUsers = oldUsers;
                                renderAdminTab('tab-users');
                                alert(error.message); 
                            }
                        });
                    } else if (userListItem) {
                        const user = allUsers.find(u => u.username === userListItem.dataset.username);
                        if (user) populateUserForm(user);
                    } else if (target.closest('#user-form-clear-btn')) {
                        clearUserForm();
                    }
                    break;
                }
                case 'tab-system': {
                    if (target.closest('#import-bookmarks-btn-admin')) {
                        document.getElementById('import-file-input-admin')?.click();
                    }
                    break;
                }
            }
        });

        adminContentPanel.addEventListener('submit', (event) => {
            if (document.getElementById('tab-users')?.classList.contains('active')) {
                if (event.target.id === 'user-form') {
                    handleUserFormSubmit(event);
                }
            }
        });

        adminContentPanel.addEventListener('change', (event) => {
            if (document.getElementById('tab-bookmarks')?.classList.contains('active')) {
                if (event.target.id === 'bookmark-category-filter') {
                    const newCategoryId = event.target.value;
                    sessionStorage.setItem('admin_bookmark_filter', newCategoryId);
                    renderBookmarkList(newCategoryId);
                }
            }
            if (document.getElementById('tab-users')?.classList.contains('active')) {
                if (event.target.closest('#user-form-categories')) {
                    updateDefaultCategoryDropdown(document.getElementById('user-form'));
                }
            }
             if (document.getElementById('tab-system')?.classList.contains('active')) {
                if (event.target.id === 'import-file-input-admin') {
                    const file = event.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        try {
                            await parseAndImport(e.target.result);
                        } catch (error) { alert(`导入失败: ${error.message}`); }
                    };
                    reader.readAsText(file);
                    event.target.value = '';
                }
            }
        });
        
        document.addEventListener('focusout', async (event) => {
            if (event.target.id === 'bm-edit-url' && bookmarkEditModal.style.display === 'block') {
                const urlInput = event.target;
                const url = urlInput.value.trim();
                if (!url || !url.startsWith('http')) {
                    return;
                }
                
                const nameInput = document.getElementById('bm-edit-name');
                const descInput = document.getElementById('bm-edit-desc');
                const iconInput = document.getElementById('bm-edit-icon');
                const originalPlaceholder = urlInput.placeholder;
                const errorEl = bookmarkEditForm.querySelector('.modal-error-message');
                if(errorEl) errorEl.textContent = '';

                try {
                    urlInput.placeholder = '正在获取网站信息...';
                    urlInput.disabled = true;
                    nameInput.disabled = true;

                    const data = await apiRequest(`scrape-url?url=${encodeURIComponent(url)}`);

                    if (data.title && !nameInput.value) { nameInput.value = data.title; }
                    if (data.description && !descInput.value) { descInput.value = data.description; }
                    if (data.icon && !iconInput.value) { iconInput.value = data.icon; }
                } catch (error) {
                    console.error('网址信息获取失败:', error);
                    if (errorEl) errorEl.textContent = `网址信息获取失败: ${error.message}`;
                } finally {
                    urlInput.placeholder = originalPlaceholder;
                    urlInput.disabled = false;
                    nameInput.disabled = false;
                }
            }
        });
    }
    
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', hideAllModals));
    if(document.getElementById('confirm-btn-no')) document.getElementById('confirm-btn-no').onclick = hideAllModals;
    if(bookmarkEditForm) bookmarkEditForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = bookmarkEditForm.querySelector('#bm-edit-id').value;
        const data = {
            name: bookmarkEditForm.querySelector('#bm-edit-name').value,
            url: bookmarkEditForm.querySelector('#bm-edit-url').value,
            description: bookmarkEditForm.querySelector('#bm-edit-desc').value,
            icon: bookmarkEditForm.querySelector('#bm-edit-icon').value,
            categoryId: bookmarkEditForm.querySelector('#bm-edit-category').value,
        };
        const endpoint = id ? `bookmarks/${id}` : 'bookmarks';
        const method = id ? 'PUT' : 'POST';
        try {
            const savedBookmark = await apiRequest(endpoint, method, data);
            hideAllModals();
            if (id) {
                const index = allBookmarks.findIndex(bm => bm.id === id);
                if (index > -1) allBookmarks[index] = { ...allBookmarks[index], ...savedBookmark };
            } else {
                allBookmarks.push(savedBookmark);
            }
            renderBookmarkList(document.getElementById('bookmark-category-filter').value);
        } catch (error) {
            const errorEl = bookmarkEditForm.querySelector('.modal-error-message');
            if(errorEl) errorEl.textContent = error.message;
        }
    };
    
    initializePage();
});
