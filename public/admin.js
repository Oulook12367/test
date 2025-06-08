document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Element Selectors ---
    const adminPageContainer = document.getElementById('admin-page-container');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmText = document.getElementById('confirm-text');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');
    const adminPanelNav = document.querySelector('.admin-panel-nav');
    const adminTabContents = document.querySelectorAll('.admin-tab-content');
    const bookmarkEditModal = document.getElementById('bookmark-edit-modal');
    const bookmarkEditForm = document.getElementById('bookmark-edit-form');
    
    // --- 2. State ---
    let allBookmarks = [], allCategories = [], allUsers = [];

    // --- 3. UI Flow & Modals ---
    const showModal = (modal) => {
        if (modal) {
            modalBackdrop.style.display = 'flex';
            modal.style.display = 'block';
        }
    };
    const hideAllModals = () => {
        modalBackdrop.style.display = 'none';
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    };
    const showConfirm = (title, text, onConfirm) => {
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
            const data = await apiRequest('data');
            const token = localStorage.getItem('jwt_token');
            if (!token) throw new Error("No token");

            const payload = JSON.parse(atob(token.split('.')[1]));
            if (!payload.roles || !payload.roles.includes('admin')) {
                throw new Error("Not an admin");
            }

            allCategories = data.categories || [];
            allBookmarks = data.bookmarks || [];
            allUsers = data.users || [];
            
            if (!document.body.classList.contains('is-loading-removed')) {
                document.body.classList.remove('is-loading');
                document.body.className = localStorage.getItem('theme') || 'dark-theme';
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
            window.location.href = 'index.html';
        }
    }

    adminPanelNav.addEventListener('click', (e) => {
        e.preventDefault();
        const link = e.target.closest('.admin-tab-link');
        if (!link || link.classList.contains('active')) return;

        adminPanelNav.querySelectorAll('.admin-tab-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        const tabId = link.dataset.tab;
        adminTabContents.forEach(content => {
            content.classList.toggle('active', content.id === tabId);
        });
        renderAdminTab(tabId);
    });
    
    const renderAdminTab = (tabId) => {
        const container = document.getElementById(tabId);
        if (!container) return;
        container.innerHTML = '';
        switch (tabId) {
            case 'tab-categories':
                renderCategoryAdminTab(container);
                break;
            case 'tab-users':
                renderUserAdminTab(container);
                break;
            case 'tab-bookmarks':
                renderBookmarkAdminTab(container);
                break;
            case 'tab-system':
                renderSystemSettingsTab(container);
                break;
        }
    };
    
    const populateCategoryDropdown = (selectElement, categories, selectedId = null, ignoreId = null, options = { allowNoParent: true }) => {
        selectElement.innerHTML = '';
        if (options.allowNoParent) {
            selectElement.innerHTML = '<option value="">-- 顶级分类 --</option>';
        }
        const categoryMap = new Map(categories.map(cat => [cat.id, { ...cat, children: [] }]));
        const tree = [];
        const sortedCategories = [...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        for (const cat of sortedCategories) {
            if (cat.id === ignoreId) continue;
            if (cat.parentId && categoryMap.has(cat.parentId)) {
                const parent = categoryMap.get(cat.parentId);
                if (parent) parent.children.push(categoryMap.get(cat.id));
            } else {
                tree.push(categoryMap.get(cat.id));
            }
        }
        const buildOptions = (nodes, level) => {
            if (level >= 4) return;
            for (const node of nodes) {
                if (!node) continue;
                const option = document.createElement('option');
                option.value = node.id;
                option.textContent = `${'— '.repeat(level)}${node.name}`;
                if (node.id === selectedId) option.selected = true;
                selectElement.appendChild(option);
                if (node.children.length > 0) buildOptions(node.children, level + 1);
            }
        };
        buildOptions(tree, 0);
    };

    // --- Tab 1: Category Management ---
    const renderCategoryAdminTab = (container) => {
        container.innerHTML = `<h2>分类管理</h2>
            <p class="admin-panel-tip">任何修改（名称、排序、父级）都会在约半秒后自动保存。
            <span id="cat-save-status" style="margin-left: 10px; opacity: 0; transition: opacity 0.3s;"></span></p>
            <div class="category-admin-header"><span>排序</span><span>分类名称</span><span>上级分类</span><span>操作</span></div>
            <ul id="category-admin-list"></ul>
            <div class="admin-panel-actions"><button id="add-new-category-btn" class="secondary"><i class="fas fa-plus"></i> 添加新分类</button></div>`;
        
        const listEl = container.querySelector('#category-admin-list');
        const saveStatusEl = container.querySelector('#cat-save-status');

        const saveAllCategoriesNow = debounce(async () => {
            saveStatusEl.textContent = '正在保存...';
            saveStatusEl.style.opacity = '1';
            
            const listItems = document.querySelectorAll('#category-admin-list li');
            let finalCategories = [];
            let hasError = false;

            listItems.forEach(li => {
                const idVal = li.dataset.id;
                const name = li.querySelector('.cat-name-input').value.trim();
                const parentId = li.querySelector('.cat-parent-select').value || null;
                const sortOrder = parseInt(li.querySelector('.cat-order-input').value) || 0;
                
                if (!name) { hasError = true; }
                
                const newId = idVal.startsWith('new-') ? `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : idVal;
                finalCategories.push({ id: newId, sortOrder, name, parentId });
            });

            if (hasError) {
                alert('分类名称不能为空！');
                saveStatusEl.textContent = '保存失败！';
                setTimeout(() => { if(saveStatusEl) saveStatusEl.style.opacity = '0'; }, 2000);
                return;
            }

            try {
                await apiRequest('data', 'PUT', { categories: finalCategories });
                saveStatusEl.textContent = '已保存！';
                await initializePage('tab-categories');
            } catch (error) {
                saveStatusEl.textContent = '保存失败！';
                alert('保存失败: ' + error.message);
            } finally {
                setTimeout(() => { if(saveStatusEl) saveStatusEl.style.opacity = '0'; }, 2000);
            }
        }, 500);

        listEl.addEventListener('change', (e) => {
            if (e.target.matches('.cat-order-input, .cat-name-input, .cat-parent-select')) {
                saveAllCategoriesNow();
            }
        });

        const categoryMap = new Map(allCategories.map(cat => [cat.id, { ...cat, children: [] }]));
        const tree = [];
        [...allCategories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
            if (cat.parentId && categoryMap.has(cat.parentId)) {
                categoryMap.get(cat.parentId).children.push(categoryMap.get(cat.id));
            } else {
                tree.push(categoryMap.get(cat.id));
            }
        });
        
        const buildList = (nodes, level) => {
            nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
                const li = document.createElement('li');
                li.dataset.id = cat.id;
                li.innerHTML = `<input type="number" class="cat-order-input" value="${cat.sortOrder || 0}"><div class="cat-name-cell" style="padding-left: ${level * 25}px;"><input type="text" class="cat-name-input" value="${escapeHTML(cat.name)}"></div><select class="cat-parent-select"></select><button class="delete-cat-btn secondary danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
                const parentSelect = li.querySelector('.cat-parent-select');
                populateCategoryDropdown(parentSelect, allCategories, cat.parentId, cat.id, { allowNoParent: true });
                li.querySelector('.delete-cat-btn').onclick = () => handleDeleteCategory(cat.id, cat.name);
                listEl.appendChild(li);
                if (cat.children.length > 0) buildList(cat.children, level + 1);
            });
        };
        buildList(tree, 0);
        container.querySelector('#add-new-category-btn').addEventListener('click', handleAddNewCategory);
    };

    const handleAddNewCategory = () => {
        const listEl = document.getElementById('category-admin-list');
        const newCatId = `new-${Date.now()}`;
        const allOrderInputs = listEl.querySelectorAll('.cat-order-input');
        const existingOrders = Array.from(allOrderInputs).map(input => parseInt(input.value) || 0);
        const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : -1;
        const newSortOrder = maxOrder + 10;
        const li = document.createElement('li');
        li.dataset.id = newCatId;
        li.innerHTML = `<input type="number" class="cat-order-input" value="${newSortOrder}"><div class="cat-name-cell"><input type="text" class="cat-name-input" value="新分类" placeholder="回车或失焦保存"></div><select class="cat-parent-select"></select><button class="delete-cat-btn secondary danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
        const parentSelect = li.querySelector('.cat-parent-select');
        populateCategoryDropdown(parentSelect, allCategories, null, newCatId, { allowNoParent: true });
        li.querySelector('.delete-cat-btn').onclick = () => li.remove();
        listEl.prepend(li);
        li.querySelector('.cat-name-input').focus();
    };

    const handleDeleteCategory = (catIdToDelete, catName) => {
        showConfirm('确认删除', `您确定要删除分类 "${catName}" 吗？这也会删除其下所有的子分类和书签。`, async () => {
            let idsToDelete = new Set([catIdToDelete]);
            let queue = [catIdToDelete];
            while (queue.length > 0) {
                const parentId = queue.shift();
                allCategories.forEach(c => {
                    if (c.parentId === parentId) { idsToDelete.add(c.id); queue.push(c.id); }
                });
            }
            const finalCategories = allCategories.filter(c => !idsToDelete.has(c.id));
            const finalBookmarks = allBookmarks.filter(bm => !idsToDelete.has(bm.categoryId));
            try {
                await apiRequest('data', 'PUT', { categories: finalCategories, bookmarks: finalBookmarks });
                await initializePage('tab-categories');
            } catch (error) { alert('删除失败: ' + error.message); }
        });
    };

    // --- Tab 2: User Management ---
    const renderUserAdminTab = (container) => {
        container.innerHTML = `<h2>用户管理</h2><div id="user-management-container"><div class="user-list-container"><h3>用户列表</h3><ul id="user-list"></ul></div><div class="user-form-container"><form id="user-form"><h3 id="user-form-title">添加新用户</h3><input type="hidden" id="user-form-username-hidden"><div class="form-group"><label for="user-form-username">用户名:</label><input type="text" id="user-form-username" required></div><div class="form-group"><label for="user-form-password">密码:</label><input type="password" id="user-form-password"></div><div class="form-group"><label>角色:</label><div id="user-form-roles" class="checkbox-group horizontal"></div></div><div class="form-group flex-grow"><label>可见分类:</label><div id="user-form-categories" class="checkbox-group"></div></div><div class="user-form-buttons"><button type="submit" class="button-primary">保存用户</button><button type="button" id="user-form-clear-btn" class="secondary">新增/清空</button></div><p class="modal-error-message"></p></form></div></div>`;
        const userList = container.querySelector('#user-list');
        const form = container.querySelector('#user-form');
        const token = localStorage.getItem('jwt_token');
        let currentUsername = '';
        if (token) {
            try { currentUsername = JSON.parse(atob(token.split('.')[1])).sub; } catch (e) { console.error("无法解析Token:", e); }
        }
        allUsers.forEach(user => {
            const li = document.createElement('li');
            li.dataset.username = user.username;
            if (user.username === 'public') {
                li.innerHTML = `<span><i class="fas fa-eye fa-fw"></i> ${user.username} (公共模式)</span>`;
            } else {
                li.innerHTML = `<span>${user.username} (${user.roles.join(', ')})</span>`;
            }
            if (user.username !== 'public' && user.username !== currentUsername) {
                const delBtn = document.createElement('button');
                delBtn.className = 'button-icon danger';
                delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                delBtn.title = '删除用户';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    showConfirm('删除用户', `确定删除用户 "${user.username}"?`, async () => {
                        try {
                            await apiRequest(`users/${user.username}`, 'DELETE');
                            await initializePage('tab-users');
                        } catch (error) { alert(error.message); }
                    });
                };
                li.appendChild(delBtn);
            }
            userList.appendChild(li);
        });
        userList.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-username]');
            if (li && !e.target.closest('button')) {
                const user = allUsers.find(u => u.username === li.dataset.username);
                if (user) populateUserForm(user);
            }
        });
        container.querySelector('#user-form-clear-btn').onclick = clearUserForm;
        form.onsubmit = handleUserFormSubmit;
        clearUserForm();
    };
    const populateUserForm = (user) => {
        const form = document.getElementById('user-form'); if (!form) return;
        form.reset();
        form.querySelector('#user-form-title').textContent = `编辑用户: ${user.username}`;
        const isPublicUser = user.username === 'public';
        const usernameInput = form.querySelector('#user-form-username');
        usernameInput.value = user.username;
        usernameInput.readOnly = true;
        const passwordInput = form.querySelector('#user-form-password');
        passwordInput.placeholder = isPublicUser ? "公共账户无需密码" : "留空则不修改";
        passwordInput.disabled = isPublicUser;
        form.querySelector('#user-form-username-hidden').value = user.username;
        const isAdmin = user.roles.includes('admin');
        renderUserFormRoles(user.roles);
        renderUserFormCategories(isAdmin ? allCategories.map(c => c.id) : (user.permissions?.visibleCategories || []), isPublicUser ? false : isAdmin);
        document.querySelectorAll('#user-list li').forEach(li => li.classList.remove('selected'));
        document.querySelector(`#user-list li[data-username="${user.username}"]`)?.classList.add('selected');
    };
    const clearUserForm = () => {
        const form = document.getElementById('user-form'); if (!form) return;
        form.reset();
        form.querySelector('#user-form-title').textContent = '添加新用户';
        form.querySelector('#user-form-username').readOnly = false;
        form.querySelector('#user-form-password').placeholder = "必填";
        form.querySelector('#user-form-username-hidden').value = '';
        renderUserFormRoles();
        renderUserFormCategories();
        document.querySelectorAll('#user-list li').forEach(li => li.classList.remove('selected'));
    };
    const renderUserFormRoles = (activeRoles = ['viewer']) => {
        const container = document.getElementById('user-form-roles'); if (!container) return;
        container.innerHTML = '';
        const username = document.getElementById('user-form-username').value;
        const isPublicUser = username === 'public';
        const isAdminUser = username === 'admin';
        ['admin', 'editor', 'viewer'].forEach(role => {
            const currentRole = activeRoles[0] || 'viewer';
            const isChecked = currentRole === role;
            const isDisabled = (isAdminUser && role !== 'admin') || (isPublicUser && role !== 'viewer');
            container.innerHTML += `<div><input type="radio" id="role-${role}" name="role-selection" value="${role}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}><label for="role-${role}">${role}</label></div>`;
        });
    };
    const renderUserFormCategories = (visibleIds = [], isDisabled = false) => {
        const container = document.getElementById('user-form-categories'); if (!container) return;
        container.innerHTML = '';
        const sortedCategories = [...allCategories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const categoryMap = new Map(sortedCategories.map(cat => [cat.id, { ...cat, children: [] }]));
        const tree = [];
        for (const cat of sortedCategories) {
            if (cat.parentId && categoryMap.has(cat.parentId)) categoryMap.get(cat.parentId).children.push(categoryMap.get(cat.id));
            else tree.push(categoryMap.get(cat.id));
        }
        const buildCheckboxes = (nodes, level) => {
            if (level >= 4) return;
            for (const node of nodes) {
                container.innerHTML += `<div><input type="checkbox" id="cat-perm-${node.id}" value="${node.id}" ${visibleIds.includes(node.id) ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}><label for="cat-perm-${node.id}" style="padding-left: ${level * 20}px">${escapeHTML(node.name)}</label></div>`;
                if (node.children && node.children.length > 0) buildCheckboxes(node.children, level + 1);
            }
        };
        buildCheckboxes(tree, 0);
    };
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
            permissions: { visibleCategories: Array.from(form.querySelectorAll('#user-form-categories input:checked')).map(cb => cb.value) }
        };
        if (password) userData.password = password;
        if (!isEditing) userData.username = username;
        const endpoint = isEditing ? `users/${hiddenUsername}` : 'users';
        const method = isEditing ? 'PUT' : 'POST';
        try {
            const updatedUser = await apiRequest(endpoint, method, userData);
            alert('用户保存成功！');
            const token = localStorage.getItem('jwt_token');
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                const currentUsername = payload.sub;
                if (currentUsername === updatedUser.username) {
                    if (!updatedUser.roles.includes('admin')) {
                        alert('您的管理员权限已被移除，将退出管理后台并返回主页。');
                        localStorage.removeItem('jwt_token');
                        window.location.href = 'index.html';
                        return;
                    }
                }
            }
            await initializePage('tab-users');
        } catch (error) { errorEl.textContent = error.message; }
    };

    // --- Tab 3: Bookmark Management ---
    const renderBookmarkAdminTab = (container) => {
        container.innerHTML = `<h2>书签管理</h2>
            <p class="admin-panel-tip">通过下拉菜单筛选分类。修改排序数字后将自动保存。</p>
            <div class="bookmark-admin-controls"><span>筛选分类:</span><select id="bookmark-category-filter"><option value="all">-- 显示全部分类 --</option></select></div>
            <div class="bookmark-admin-header"><span class="sort-col">排序</span><span>书签名称</span><span>所属分类</span><span>操作</span></div>
            <div id="bookmark-admin-list-container"><ul></ul></div>
            <div class="admin-panel-actions"><button id="add-new-bookmark-btn" class="secondary"><i class="fas fa-plus"></i> 添加新书签</button></div>`;

        const listEl = container.querySelector('#bookmark-admin-list-container ul');
        const categoryFilter = container.querySelector('#bookmark-category-filter');
        
        listEl.addEventListener('change', debounce(async (e) => {
            if (e.target.matches('.bm-sort-order')) {
                const bmId = e.target.closest('li').dataset.id;
                const bmInState = allBookmarks.find(b => b.id === bmId);
                if (bmInState) {
                    bmInState.sortOrder = parseInt(e.target.value) || 0;
                    await apiRequest('data', 'PUT', { bookmarks: allBookmarks });
                }
            }
        }, 500));
        
        allCategories.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            categoryFilter.appendChild(option);
        });
        
        const lastFilter = sessionStorage.getItem('admin_bookmark_filter');
        if (lastFilter) {
            categoryFilter.value = lastFilter;
        }
        categoryFilter.onchange = () => {
            sessionStorage.setItem('admin_bookmark_filter', categoryFilter.value);
            renderAdminTab('tab-bookmarks');
        };

        const selectedCategoryId = categoryFilter.value;
        let bookmarksToDisplay = [...allBookmarks];
        if (selectedCategoryId !== 'all') {
            bookmarksToDisplay = bookmarksToDisplay.filter(bm => bm.categoryId === selectedCategoryId);
        }
        bookmarksToDisplay.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        
        const categoryNameMap = new Map(allCategories.map(c => [c.id, c.name]));
        listEl.innerHTML = '';
        bookmarksToDisplay.forEach(bm => {
            const li = document.createElement('li');
            li.dataset.id = bm.id;
            li.innerHTML = `<input type="number" class="bm-sort-order" value="${bm.sortOrder || 0}"><span class="bm-admin-name">${escapeHTML(bm.name)}</span><span class="bm-admin-cat">${categoryNameMap.get(bm.categoryId) || '无分类'}</span><div class="bm-admin-actions"><button class="edit-bm-btn secondary" title="编辑"><i class="fas fa-pencil-alt"></i></button><button class="delete-bm-btn danger secondary" title="删除"><i class="fas fa-trash-alt"></i></button></div>`;
            li.querySelector('.edit-bm-btn').onclick = () => handleEditBookmark(bm);
            li.querySelector('.delete-bm-btn').onclick = () => handleDeleteBookmark(bm);
            listEl.appendChild(li);
        });

        container.querySelector('#add-new-bookmark-btn').onclick = handleAddNewBookmark;
    };
    const handleAddNewBookmark = () => {
        if (!bookmarkEditForm || !bookmarkEditModal) { return; }
        bookmarkEditForm.reset();
        document.getElementById('bookmark-modal-title').textContent = '添加新书签';
        bookmarkEditForm.querySelector('#bm-edit-id').value = '';
        const categorySelect = bookmarkEditForm.querySelector('#bm-edit-category');
        if (categorySelect) {
            populateCategoryDropdown(categorySelect, allCategories, null, null, { allowNoParent: false });
        }
        showModal(bookmarkEditModal);
    };
    const handleEditBookmark = (bookmark) => {
        if (!bookmarkEditForm || !bookmarkEditModal) { return; }
        bookmarkEditForm.reset();
        document.getElementById('bookmark-modal-title').textContent = '编辑书签';
        bookmarkEditForm.querySelector('#bm-edit-id').value = bookmark.id;
        bookmarkEditForm.querySelector('#bm-edit-name').value = bookmark.name;
        bookmarkEditForm.querySelector('#bm-edit-url').value = bookmark.url;
        bookmarkEditForm.querySelector('#bm-edit-desc').value = bookmark.description || '';
        bookmarkEditForm.querySelector('#bm-edit-icon').value = bookmark.icon || '';
        populateCategoryDropdown(bookmarkEditForm.querySelector('#bm-edit-category'), allCategories, bookmark.categoryId, null, { allowNoParent: false });
        showModal(bookmarkEditModal);
    };
    const handleDeleteBookmark = (bookmark) => {
        showConfirm('删除书签', `确定删除书签 "${bookmark.name}"?`, async () => {
            try {
                await apiRequest(`bookmarks/${bookmark.id}`, 'DELETE');
                await initializePage('tab-bookmarks');
            } catch (error) { alert(`删除失败: ${error.message}`); }
        });
    };
    bookmarkEditForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = bookmarkEditForm.querySelector('#bm-edit-id').value;
        const isEditing = !!id;
        const data = {
            name: bookmarkEditForm.querySelector('#bm-edit-name').value,
            url: bookmarkEditForm.querySelector('#bm-edit-url').value,
            description: bookmarkEditForm.querySelector('#bm-edit-desc').value,
            icon: bookmarkEditForm.querySelector('#bm-edit-icon').value,
            categoryId: bookmarkEditForm.querySelector('#bm-edit-category').value,
        };
        const endpoint = isEditing ? `bookmarks/${id}` : 'bookmarks';
        const method = isEditing ? 'PUT' : 'POST';
        try {
            await apiRequest(endpoint, method, data);
            hideAllModals();
            await initializePage('tab-bookmarks');
        } catch (error) {
            const errorEl = bookmarkEditForm.querySelector('.modal-error-message');
            if(errorEl) errorEl.textContent = error.message;
        }
    });

    // --- Tab 4: System Settings ---
    const renderSystemSettingsTab = (container) => {
        container.innerHTML = `<h2>系统设置</h2><div class="system-setting-item"><h3><i class="fas fa-file-import"></i> 导入书签</h3><p>从浏览器导出的HTML文件导入书签。导入操作会合并现有书签，不会清空原有数据。</p><button id="import-bookmarks-btn-admin" class="secondary">选择HTML文件</button><input type="file" id="import-file-input-admin" accept=".html,.htm" style="display: none;"></div>`;
        container.querySelector('#import-bookmarks-btn-admin').onclick = () => container.querySelector('#import-file-input-admin').click();
        container.querySelector('#import-file-input-admin').onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    await parseAndImport(event.target.result);
                    alert('书签导入成功！');
                    await initializePage('tab-system');
                } catch (error) { alert(`导入失败: ${error.message}`); }
            };
            reader.readAsText(file);
            e.target.value = '';
        };
    };
    const parseAndImport = async (htmlContent) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        let importedCategories = [];
        let importedBookmarks = [];
        const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const highestCatSortOrder = allCategories.length > 0 ? Math.max(...allCategories.map(c => c.sortOrder || 0)) : -1;
        const highestBmSortOrder = allBookmarks.length > 0 ? Math.max(...allBookmarks.map(bm => bm.sortOrder || 0)) : -1;
        let currentCatSort = highestCatSortOrder + 10;
        let currentBmSort = highestBmSortOrder + 10;
        
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
                        while(nextSibling && nextSibling.tagName !== 'DL') {
                            nextSibling = nextSibling.nextElementSibling;
                        }
                        subList = nextSibling;
                    }
                    if (subList) {
                        parseNode(subList, newCategoryId);
                    }
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
        const rootItems = Array.from(rootDl.children);
        const hasRootLinks = rootItems.some(child => child.tagName === 'DT' && child.querySelector('A'));
        if (hasRootLinks) {
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
        await apiRequest('data', 'PUT', { categories: finalCategories, bookmarks: finalBookmarks });
        await initializePage('tab-system');
    };

    // --- Final Initialization ---
    initializePage();
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', hideAllModals));
    document.getElementById('confirm-btn-no').onclick = hideAllModals;
});
