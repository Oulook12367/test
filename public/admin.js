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

    async function apiRequest(endpoint, method = 'GET', body = null) {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('jwt_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && dataVersion) {
            headers['If-Match'] = dataVersion;
        }
        
        const options = { method, headers, cache: 'no-cache' };
        if (body) options.body = JSON.stringify(body);
        
        const response = await fetch(`/api/${endpoint}`, options);
        
        const newVersion = response.headers.get('ETag');
        if (newVersion) {
            dataVersion = newVersion;
        }

        if (response.status === 204) return null;
        
        let result;
        try { result = await response.json(); } 
        catch (e) { /* ignore empty body */ }
        
       if (!response.ok) {
        let errorMsg = `请求失败，状态码: ${response.status}`;
        if (result && result.error) {
            errorMsg += ` - ${result.error}`;
        }
        throw new Error(errorMsg);
    }
    return result;
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

    const renderUserAdminTab = (container) => {
        container.innerHTML = `<div id="user-management-container"><div class="user-list-container"><h3 style="margin-bottom: 1rem;">用户列表</h3><ul id="user-list"></ul></div><div class="user-form-container"><form id="user-form"><h3 id="user-form-title">添加新用户</h3><div class="user-form-static-fields"><input type="hidden" id="user-form-username-hidden"><div class="form-group-inline"><label for="user-form-username">用户名:</label><input type="text" id="user-form-username" required></div><div class="form-group-inline"><label for="user-form-password">密码:</label><input type="password" id="user-form-password"></div><div class="form-group-inline"><label>角色:</label><div id="user-form-roles" class="checkbox-group horizontal"></div></div><div class="form-group-inline"><label for="user-form-default-cat">默认显示分类:</label><select id="user-form-default-cat"></select></div></div><div class="form-group flex-grow"><label>可见分类:</label><div id="user-form-categories" class="checkbox-group"></div></div><div class="user-form-buttons"><button type="submit" class="button button-primary">保存用户</button><button type="button" id="user-form-clear-btn" class="button">新增/清空</button></div><p class="modal-error-message"></p></form></div></div>`;
        const userList = container.querySelector('#user-list');
        const token = localStorage.getItem('jwt_token');
        let currentUsername = '';
        if (token) { try { currentUsername = parseJwtPayload(token).sub; } catch (e) { console.error("Could not parse token:", e); } }
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
        clearUserForm();
    };
    
    const renderSystemSettingsTab = (container) => {
        container.innerHTML = `<div class="system-setting-item"><p style="margin-bottom: 1.5rem;">从浏览器导出的HTML文件导入书签。导入操作会合并现有书签，不会清空原有数据。</p><div style="display: flex; align-items: center; gap: 1rem;"><h3><i class="fas fa-file-import"></i> 导入书签</h3><button id="import-bookmarks-btn-admin" class="button">选择HTML文件</button><input type="file" id="import-file-input-admin" accept=".html,.htm" style="display: none;"></div></div>`;
    };

    const handleAddNewCategory = () => {
        const listEl = document.getElementById('category-admin-list');
        if (!listEl) return;
        const newCatId = `new-${Date.now()}`;
        const allOrderInputs = listEl.querySelectorAll('.cat-order-input');
        const existingOrders = Array.from(allOrderInputs).map(input => parseInt(input.value) || 0);
        const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : -1;
        const newSortOrder = maxOrder + 1;
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
        // No success alert
       try {
        // --- 修改部分 ---
        // 将 allBookmarks 也包含在请求体中
        const result = await apiRequest('data', 'PATCH', { 
            categories: finalCategories, 
            bookmarks: allBookmarks // <--- 添加此行
        });
        // --- 修改部分结束 ---

        dataVersion = result.version;

        // --- 新增部分 ---
        // 成功后强制刷新UI，确保ID等状态正确显示
        alert('分类已成功保存！'); // 给予用户明确反馈
        await initializePage('tab-categories');
        // --- 新增部分结束 ---

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
        
        const oldUsers = JSON.parse(JSON.stringify(allUsers));
        
        try {
            const result = await apiRequest(endpoint, method, userData); // result 现在是 { user: {...}, version: '...' }
dataVersion = result.version;       // 正确地从响应体中获取 version
const updatedUser = result.user;    // 正确地从响应体中获取 user 对象

// 检查一下 updatedUser 是否存在，增加代码健壮性
if (!updatedUser) {
    throw new Error('从服务器返回的数据格式不正确。');
}
            
            const userIndex = allUsers.findIndex(u => u.username === updatedUser.username);
            if (userIndex > -1) {
                const existingPermissions = allUsers[userIndex].permissions;
                allUsers[userIndex] = { ...allUsers[userIndex], ...updatedUser, permissions: {...existingPermissions, ...updatedUser.permissions} };
            } else {
                allUsers.push(updatedUser);
            }
            renderAdminTab('tab-users');
            clearUserForm();
            
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
        } catch (error) { 
            allUsers = oldUsers;
            renderAdminTab('tab-users');
            errorEl.textContent = error.message;
        }
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
        // --- 修改部分 ---
        // 将 allCategories 也包含在请求体中
        const result = await apiRequest('data', 'PATCH', { 
            bookmarks: allBookmarks, 
            categories: allCategories // <--- 添加此行
        });
        // --- 修改部分结束 ---

        dataVersion = result.version;

        // --- 新增部分 ---
        alert('书签已成功保存！');
        // 不需要刷新整个Tab，只刷新列表即可
       await initializePage('tab-bookmarks');
        // --- 新增部分结束 ---

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

    // --- Master Event Listeners ---
    if (adminContentPanel) {
        adminContentPanel.addEventListener('click', (event) => { /* ... */ });
        adminContentPanel.addEventListener('submit', (event) => { /* ... */ });
        adminContentPanel.addEventListener('change', (event) => {
            const target = event.target;
            const activeTabId = document.querySelector('.admin-tab-content.active')?.id;
            
            if (activeTabId === 'tab-bookmarks') {
                if (target.id === 'bookmark-category-filter') {
                    const newCategoryId = target.value;
                    sessionStorage.setItem('admin_bookmark_filter', newCategoryId);
                    renderBookmarkList(newCategoryId);
                }
                if (target.classList.contains('bm-category-select')) {
                    const listItem = target.closest('li[data-id]');
                    if (!listItem) return;
                    const bookmarkId = listItem.dataset.id;
                    const newCategoryId = target.value;
                    const bookmark = allBookmarks.find(bm => bm.id === bookmarkId);
                    if (bookmark) {
                        bookmark.categoryId = newCategoryId;
                    }
                    renderBookmarkList(document.getElementById('bookmark-category-filter').value);
                }
            } else if (activeTabId === 'tab-categories') {
                 if (target.classList.contains('cat-parent-select')) {
                    const listItem = target.closest('li[data-id]');
                    if (!listItem) return;
                    const categoryId = listItem.dataset.id;
                    const newParentId = target.value;
                    const category = allCategories.find(c => c.id === categoryId);
                    if(category) {
                        category.parentId = newParentId || null;
                    }
                    renderAdminTab('tab-categories');
                 }
            } else if (activeTabId === 'tab-users') { /* ... */ }
              else if (activeTabId === 'tab-system') { /* ... */ }
        });
        document.addEventListener('focusout', async (event) => { /* ... (URL Scraping logic) ... */ });
    }
    
    // --- Final Initialization & Modal Handlers ---
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
        
        const oldBookmarks = JSON.parse(JSON.stringify(allBookmarks));
        
        try {
            const savedBookmark = await apiRequest(endpoint, method, data);
            dataVersion = savedBookmark.version || dataVersion;
            hideAllModals();
            if (id) {
                const index = allBookmarks.findIndex(bm => bm.id === id);
                if (index > -1) allBookmarks[index] = { ...allBookmarks[index], ...savedBookmark };
            } else {
                allBookmarks.push(savedBookmark);
            }
            renderBookmarkList(document.getElementById('bookmark-category-filter').value);
        } catch (error) {
            allBookmarks = oldBookmarks;
            renderBookmarkList(document.getElementById('bookmark-category-filter').value);
            const errorEl = bookmarkEditForm.querySelector('.modal-error-message');
            if(errorEl) errorEl.textContent = error.message;
        }
    };
    
    initializePage();
});
