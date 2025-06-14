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
    let activeEventListeners = [];

    // --- 3. UI Flow & Modals ---
    const showModal = (modal) => {
        if (modal) {
            modalBackdrop.style.display = 'flex';
            modal.style.display = 'block';
        }
    };
    const hideAllModals = () => {
        if(modalBackdrop) modalBackdrop.style.display = 'none';
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    };
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
    
    const cleanupEventListeners = () => {
        activeEventListeners.forEach(({element, type, handler}) => {
            if (element) element.removeEventListener(type, handler);
        });
        activeEventListeners = [];
    };

    const addManagedEventListener = (element, type, handler) => {
        if (!element) return;
        element.addEventListener(type, handler);
        activeEventListeners.push({ element, type, handler });
    };

    // --- 4. Core Logic ---
// 替换 admin.js 中的整个 initializePage 函数
// 替换 admin.js 中的整个 initializePage 函数
async function initializePage(activeTabId = 'tab-categories') {
    try {
        const token = localStorage.getItem('jwt_token');
        
        // 使用新的、安全的函数来解析 Token
        const payload = parseJwtPayload(token);

        // 如果 token 不存在或解析失败，或者角色不正确，则抛出错误
        if (!payload || !payload.roles || !payload.roles.includes('admin')) {
            throw new Error("Token 无效或用户非管理员。");
        }
        
        // Token 验证通过后，再从服务器获取最新数据
        const data = await apiRequest('data');

        // (可选但推荐) 再次验证从服务器返回的数据，防止权限在登录后被变更
        const currentUserFromServer = data.users.find(u => u.username === payload.sub);
        if (!currentUserFromServer || !currentUserFromServer.roles.includes('admin')) {
            throw new Error("用户权限不足或服务器数据异常。");
        }

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
        console.error("Initialization failed:", error); // 这就是您看到的错误信息
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
            adminTabContents.forEach(content => {
                content.classList.toggle('active', content.id === tabId);
            });
            renderAdminTab(tabId);
        });
    }
    
    const renderAdminTab = (tabId) => {
        cleanupEventListeners();
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
        if (options.allowNoParent) selectElement.innerHTML = '<option value="">-- 顶级分类 --</option>';
        const categoryMap = new Map(categories.map(cat => [cat.id, { ...cat, children: [] }]));
        const tree = [];
        const sortedCategories = [...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
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


 // [!!!] 核心修复：替换整个 renderCategoryAdminTab 函数
    const renderCategoryAdminTab = (container) => {
        container.innerHTML = `<p class="admin-panel-tip">通过修改表单来调整分类，完成后请点击下方的“保存”按钮。</p><div class="category-admin-header"><span>排序</span><span>分类名称</span><span>上级分类</span><span>操作</span></div><ul id="category-admin-list"></ul><div class="admin-panel-actions"><button id="save-categories-btn" class="button button-primary"><i class="fas fa-save"></i> 保存全部分类</button><button id="add-new-category-btn" class="button"><i class="fas fa-plus"></i> 添加新分类</button></div>`;
        const listEl = container.querySelector('#category-admin-list');
        
        // 1. Create a map where each category object is enhanced with a `children` array.
        const categoryMap = new Map(allCategories.map(c => [c.id, {...c, children: []}]));
        
        // 2. This array will hold the root-level category nodes.
        const tree = [];
        
        // 3. Iterate over the original categories to build the tree structure.
        allCategories.forEach(cat => {
            const node = categoryMap.get(cat.id); // Get the enhanced object from the map.
            if (cat.parentId && categoryMap.has(cat.parentId)) {
                // If it has a parent, find the parent's enhanced object and push this node into its children array.
                categoryMap.get(cat.parentId).children.push(node);
            } else {
                // If it's a root node (no parentId or parent not found), push it to the tree.
                tree.push(node);
            }
        });

        // 4. This function now receives nodes that are GUARANTEED to have a 'children' property.
        const buildList = (nodes, level) => {
            // Sort children within the current level before rendering.
            nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
                const li = document.createElement('li');
                li.dataset.id = cat.id;
                li.innerHTML = `<input type="number" class="cat-order-input" value="${cat.sortOrder || 0}"><div class="cat-name-cell" style="padding-left: ${level * 25}px;"><input type="text" class="cat-name-input" value="${escapeHTML(cat.name)}"></div><select class="cat-parent-select"></select><button class="delete-cat-btn button-icon danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
                populateCategoryDropdown(li.querySelector('.cat-parent-select'), allCategories, cat.parentId, cat.id);
                listEl.appendChild(li);
                
                // This check is now safe.
                if (cat.children && cat.children.length > 0) {
                    buildList(cat.children, level + 1);
                }
            });
        };

        buildList(tree, 0);

        addManagedEventListener(listEl, 'click', (event) => {
            const deleteButton = event.target.closest('.delete-cat-btn');
            if (deleteButton) {
                event.stopPropagation();
                const listItem = deleteButton.closest('li[data-id]');
                if (!listItem) return;
                const catId = listItem.dataset.id;
                if (catId.startsWith('new-')) {
                    listItem.remove();
                } else {
                    const catName = listItem.querySelector('.cat-name-input').value;
                    handleDeleteCategory(catId, catName);
                }
            }
        });

        addManagedEventListener(container.querySelector('#add-new-category-btn'), 'click', handleAddNewCategory);
        addManagedEventListener(container.querySelector('#save-categories-btn'), 'click', handleSaveCategories);
    };

    // The rest of the functions in admin.js remain the same.
    // Make sure to copy them from your original file if they are not present below.
    
    const handleAddNewCategory = () => {
        const listEl = document.getElementById('category-admin-list');
        if (!listEl) return;
        const newCatId = `new-${Date.now()}`;
        const allOrderInputs = listEl.querySelectorAll('.cat-order-input');
        const existingOrders = Array.from(allOrderInputs).map(input => parseInt(input.value) || 0);
        const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : -1;
        const newSortOrder = maxOrder + 10;
        const li = document.createElement('li');
        li.dataset.id = newCatId;
        li.innerHTML = `<input type="number" class="cat-order-input" value="${newSortOrder}"><div class="cat-name-cell"><input type="text" class="cat-name-input" value="新分类"></div><select class="cat-parent-select"></select><button class="delete-cat-btn button-icon danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
        const parentSelect = li.querySelector('.cat-parent-select');
        populateCategoryDropdown(parentSelect, allCategories, null, newCatId, { allowNoParent: true });
        listEl.prepend(li);
        li.querySelector('.cat-name-input').focus();
    };
    const handleSaveCategories = async () => {
        const listItems = document.querySelectorAll('#category-admin-list li');
        let finalCategories = [];
        let hasError = false;
        listItems.forEach(li => {
            const idVal = li.dataset.id;
            const name = li.querySelector('.cat-name-input').value.trim();
            if (!name) { hasError = true; }
            finalCategories.push({
                id: idVal.startsWith('new-') ? `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : idVal,
                name: name,
                parentId: li.querySelector('.cat-parent-select').value || null,
                sortOrder: parseInt(li.querySelector('.cat-order-input').value) || 0,
            });
        });
        if (hasError) { alert('分类名称不能为空！'); return; }
        try {
            await apiRequest('data', 'PUT', { categories: finalCategories });
            alert('分类保存成功！');
            await initializePage('tab-categories');
        } catch (error) { alert('保存失败: ' + error.message); }
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

    const renderUserAdminTab = (container) => {
        container.innerHTML = `<div id="user-management-container"><div class="user-list-container"><h3>用户列表</h3><ul id="user-list"></ul></div><div class="user-form-container"><form id="user-form"><h3 id="user-form-title">添加新用户</h3><div class="user-form-static-fields"><input type="hidden" id="user-form-username-hidden"><div class="form-group-inline"><label for="user-form-username">用户名:</label><input type="text" id="user-form-username" required></div><div class="form-group-inline"><label for="user-form-password">密码:</label><input type="password" id="user-form-password"></div><div class="form-group-inline"><label>角色:</label><div id="user-form-roles" class="checkbox-group horizontal"></div></div><div class="form-group-inline"><label for="user-form-default-cat">默认显示分类:</label><select id="user-form-default-cat"></select></div></div><div class="form-group flex-grow"><label>可见分类:</label><div id="user-form-categories" class="checkbox-group"></div></div><div class="user-form-buttons"><button type="submit" class="button button-primary">保存用户</button><button type="button" id="user-form-clear-btn" class="button">新增/清空</button></div><p class="modal-error-message"></p></form></div></div>`;
        const userList = container.querySelector('#user-list');
        const form = container.querySelector('#user-form');
        const token = localStorage.getItem('jwt_token');
        let currentUsername = '';
        if (token) { try { currentUsername = JSON.parse(atob(token.split('.')[1])).sub; } catch (e) { console.error("无法解析Token:", e); } }
        allUsers.forEach(user => {
            const li = document.createElement('li');
            li.dataset.username = user.username;
            li.innerHTML = `<span>${user.username === 'public' ? `<i class="fas fa-eye fa-fw"></i> ${user.username} (公共模式)` : `${user.username} (${user.roles.join(', ')})`}</span>`;
            if (user.username !== 'public' && user.username !== currentUsername) {
                const delBtn = document.createElement('button');
                delBtn.className = 'button-icon danger';
                delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                delBtn.title = '删除用户';
                li.appendChild(delBtn);
            }
            userList.appendChild(li);
        });
        addManagedEventListener(userList, 'click', (e) => {
            const deleteButton = e.target.closest('.button-icon.danger');
            if (deleteButton) {
                e.stopPropagation();
                const userItem = e.target.closest('li[data-username]');
                const username = userItem.dataset.username;
                showConfirm('删除用户', `确定删除用户 "${username}"?`, async () => {
                    try {
                        await apiRequest(`users/${encodeURIComponent(username)}`, 'DELETE');
                        await initializePage('tab-users');
                    } catch (error) { alert(error.message); }
                });
                return;
            }
            const li = e.target.closest('li[data-username]');
            if (li) {
                const user = allUsers.find(u => u.username === li.dataset.username);
                if (user) populateUserForm(user);
            }
        });
        const visibleCategoriesContainer = form.querySelector('#user-form-categories');
        addManagedEventListener(visibleCategoriesContainer, 'change', () => updateDefaultCategoryDropdown(form));
        addManagedEventListener(container.querySelector('#user-form-clear-btn'), 'click', clearUserForm);
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
        updateDefaultCategoryDropdown(form, user.defaultCategoryId);
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
        updateDefaultCategoryDropdown(form, 'all');
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
        const sortedCategories = [...allCategories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
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
    const updateDefaultCategoryDropdown = (form, selectedId) => {
        const defaultCatSelect = form.querySelector('#user-form-default-cat');
        const visibleCatCheckboxes = form.querySelectorAll('#user-form-categories input:checked');
        const visibleCatIds = Array.from(visibleCatCheckboxes).map(cb => cb.value);
        const currentSelectedValue = defaultCatSelect.value;
        defaultCatSelect.innerHTML = `<option value="all">全部书签</option>`;
        const categoriesToShow = allCategories.filter(cat => visibleCatIds.includes(cat.id));
        categoriesToShow.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
        categoriesToShow.forEach(cat => {
            defaultCatSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
        if (selectedId && (selectedId === 'all' || categoriesToShow.some(c => c.id === selectedId))) {
            defaultCatSelect.value = selectedId;
        } else if (categoriesToShow.some(c => c.id === currentSelectedValue)) {
            defaultCatSelect.value = currentSelectedValue;
        } else {
            defaultCatSelect.value = 'all';
        }
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
            permissions: { visibleCategories: Array.from(form.querySelectorAll('#user-form-categories input:checked')).map(cb => cb.value) },
            defaultCategoryId: form.querySelector('#user-form-default-cat').value
        };
        if (password) userData.password = password;
        if (!isEditing) userData.username = username;
        const endpoint = isEditing ? `users/${encodeURIComponent(hiddenUsername)}` : 'users';
        const method = isEditing ? 'PUT' : 'POST';
        try {
            const updatedUser = await apiRequest(endpoint, method, userData);
            alert('用户保存成功！');
            const token = localStorage.getItem('jwt_token');
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload.sub === updatedUser.username && !updatedUser.roles.includes('admin')) {
                    alert('您的管理员权限已被移除，将退出管理后台并返回主页。');
                    localStorage.removeItem('jwt_token');
                    window.location.href = 'index.html';
                    return;
                }
            }
            await initializePage('tab-users');
        } catch (error) { errorEl.textContent = error.message; }
    };
    
    const renderBookmarkAdminTab = (container) => {
        container.innerHTML = `<p class="admin-panel-tip">通过下拉菜单筛选分类。修改排序数字后，点击下方的“保存”按钮来应用更改。</p><div class="bookmark-admin-controls"><span>筛选分类:</span><select id="bookmark-category-filter"><option value="all">-- 显示全部分类 --</option></select></div><div class="bookmark-admin-header"><span class="sort-col">排序</span><span>书签名称</span><span>所属分类</span><span>操作</span></div><div id="bookmark-admin-list-container"><ul></ul></div><div class="admin-panel-actions"><button id="save-bookmarks-btn" class="button button-primary"><i class="fas fa-save"></i> 保存书签顺序</button><button id="add-new-bookmark-btn" class="button"><i class="fas fa-plus"></i> 添加新书签</button></div>`;
        const listEl = container.querySelector('#bookmark-admin-list-container ul');
        const categoryFilter = container.querySelector('#bookmark-category-filter');
        allCategories.sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).forEach(cat=>{const o=document.createElement('option');o.value=cat.id;o.textContent=cat.name;categoryFilter.appendChild(o)});
        const lastFilter=sessionStorage.getItem('admin_bookmark_filter');if(lastFilter)categoryFilter.value=lastFilter;
        addManagedEventListener(categoryFilter, 'change', () => {
            sessionStorage.setItem('admin_bookmark_filter', categoryFilter.value);
            renderAdminTab('tab-bookmarks');
        });
        const selectedCategoryId=categoryFilter.value;
        let bookmarksToDisplay=selectedCategoryId==='all'?[...allBookmarks]:allBookmarks.filter(bm=>bm.categoryId===selectedCategoryId);
        bookmarksToDisplay.sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
        const categoryNameMap=new Map(allCategories.map(c=>[c.id,c.name]));
        listEl.innerHTML=bookmarksToDisplay.map(bm=>`<li data-id="${bm.id}"><input type="number" class="bm-sort-order" value="${bm.sortOrder||0}"><span class="bm-admin-name">${escapeHTML(bm.name)}</span><span class="bm-admin-cat">${categoryNameMap.get(bm.categoryId)||"无分类"}</span><div class="bm-admin-actions"><button class="edit-bm-btn button-icon" title="编辑"><i class="fas fa-pencil-alt"></i></button><button class="delete-bm-btn danger button-icon" title="删除"><i class="fas fa-trash-alt"></i></button></div></li>`).join('');
        addManagedEventListener(listEl, 'click', (event) => {
            const editButton = event.target.closest('.edit-bm-btn');
            const deleteButton = event.target.closest('.delete-bm-btn');
            const listItem = event.target.closest('li[data-id]');
            if (!listItem) return;
            const bookmark = allBookmarks.find(bm => bm.id === listItem.dataset.id);
            if (!bookmark) return;
            if (editButton) { event.stopPropagation(); handleEditBookmark(bookmark); } 
            else if (deleteButton) { event.stopPropagation(); handleDeleteBookmark(bookmark); }
        });
        addManagedEventListener(container.querySelector('#add-new-bookmark-btn'), 'click', handleAddNewBookmark);
        addManagedEventListener(container.querySelector('#save-bookmarks-btn'), 'click', handleSaveBookmarks);
    };
    const handleSaveBookmarks = async () => {
        const listItems = document.querySelectorAll('#bookmark-admin-list-container li');
        let hasChanges = false;
        listItems.forEach(li => {
            const id = li.dataset.id;
            const newSortOrder = parseInt(li.querySelector('.bm-sort-order').value) || 0;
            const bookmark = allBookmarks.find(bm => bm.id === id);
            if (bookmark && (bookmark.sortOrder || 0) !== newSortOrder) {
                bookmark.sortOrder = newSortOrder;
                hasChanges = true;
            }
        });
        if (!hasChanges) { alert('没有检测到排序变更。'); return; }
        try {
            await apiRequest('data', 'PUT', { bookmarks: allBookmarks });
            alert('书签顺序保存成功！');
            await initializePage('tab-bookmarks');
        } catch (error) { alert(`保存失败: ${error.message}`); }
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

    const renderSystemSettingsTab = (container) => {
        container.innerHTML = `<div class="system-setting-item"><h3><i class="fas fa-file-import"></i> 导入书签</h3><p>从浏览器导出的HTML文件导入书签。导入操作会合并现有书签，不会清空原有数据。</p><button id="import-bookmarks-btn-admin" class="button">选择HTML文件</button><input type="file" id="import-file-input-admin" accept=".html,.htm" style="display: none;"></div>`;
        const importBtn = container.querySelector('#import-bookmarks-btn-admin');
        const fileInput = container.querySelector('#import-file-input-admin');
        addManagedEventListener(importBtn, 'click', () => fileInput.click());
        addManagedEventListener(fileInput, 'change', (e) => {
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
        await apiRequest('data', 'PUT', { categories: finalCategories, bookmarks: finalBookmarks });
        await initializePage('tab-system');
    };

    // --- Final Initialization ---
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', hideAllModals));
    const confirmNoBtn = document.getElementById('confirm-btn-no');
    if(confirmNoBtn) confirmNoBtn.onclick = hideAllModals;
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
            await apiRequest(endpoint, method, data);
            hideAllModals();
            await initializePage('tab-bookmarks');
        } catch (error) {
            const errorEl = bookmarkEditForm.querySelector('.modal-error-message');
            if(errorEl) errorEl.textContent = error.message;
        }
    };

    initializePage();
});
