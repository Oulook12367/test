document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
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
    
    // --- State ---
    let allBookmarks = [], allCategories = [], allUsers = [];

    // --- UI Flow & Modals ---
    const showModal = (modal) => { 
        modalBackdrop.style.display = 'flex'; 
        // 【重要修正】这里使用 'block' 而不是 'flex'
        // 这能让 .modal-backdrop 的 flex 布局正确地将其居中
        modal.style.display = 'block'; 
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
            // 只隐藏确认框，保留背景和其他模态框
            confirmModal.style.display = 'none';
            onConfirm(); 
        };
    };

    // --- Auth Check & Initial Data Load ---
    async function initializePage() {
        try {
            const data = await apiRequest('data');
            const token = localStorage.getItem('jwt_token');
            if(!token) throw new Error("No token");

            const payload = JSON.parse(atob(token.split('.')[1]));
            if(!payload.roles || !payload.roles.includes('admin')) {
                throw new Error("Not an admin");
            }

            allCategories = data.categories || [];
            allBookmarks = (data.bookmarks || []).map((bm, index) => ({...bm, sortOrder: bm.sortOrder ?? index}));
            allUsers = data.users || [];
            
            document.body.classList.remove('is-loading');
            document.body.className = localStorage.getItem('theme') || 'dark-theme';
            adminPageContainer.style.display = 'flex';
            renderAdminTab('tab-categories');

        } catch (error) {
            window.location.href = 'index.html'; 
        }
    }

    // --- Admin Panel Logic ---
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
        container.innerHTML = ''; // Clear previous content
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
    
    const populateCategoryDropdown = (selectElement, categories, selectedId = null, ignoreId = null) => {
        selectElement.innerHTML = '<option value="">-- 顶级分类 --</option>';
        const categoryMap = new Map(categories.map(cat => [cat.id, { ...cat, children: [] }]));
        const tree = [];
        const sortedCategories = [...categories].sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));

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
        container.innerHTML = `<h2>分类管理</h2><p class="admin-panel-tip">通过“排序”数字（越小越靠前）和“父级分类”来调整结构。修改后请点击下方“保存全部分类”按钮。</p><div class="category-admin-header"><span>排序</span><span style="grid-column: span 2;">分类名称</span><span>操作</span></div><ul id="category-admin-list"></ul><div class="admin-panel-actions"><button id="save-categories-btn"><i class="fas fa-save"></i> 保存全部分类</button><button id="add-new-category-btn" class="secondary"><i class="fas fa-plus"></i> 添加新分类</button></div>`;
        
        const listEl = container.querySelector('#category-admin-list');
        const categoryMap = new Map(allCategories.map(cat => [cat.id, { ...cat, children: [] }]));
        const tree = [];
        [...allCategories].sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
            if (cat.parentId && categoryMap.has(cat.parentId)) {
                categoryMap.get(cat.parentId).children.push(categoryMap.get(cat.id));
            } else {
                tree.push(categoryMap.get(cat.id));
            }
        });
        
        const buildList = (nodes, level) => {
            nodes.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
                const li = document.createElement('li');
                li.dataset.id = cat.id;
                li.innerHTML = `<input type="number" class="cat-order-input" value="${cat.sortOrder || 0}"><div class="cat-name-cell" style="padding-left: ${level * 25}px;"><input type="text" class="cat-name-input" value="${escapeHTML(cat.name)}"></div><select class="cat-parent-select"></select><button class="delete-cat-btn secondary danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
                const parentSelect = li.querySelector('.cat-parent-select');
                populateCategoryDropdown(parentSelect, allCategories, cat.parentId, cat.id);
                li.querySelector('.delete-cat-btn').onclick = () => handleDeleteCategory(cat.id, cat.name);
                listEl.appendChild(li);
                if (cat.children.length > 0) buildList(cat.children, level + 1);
            });
        };
        buildList(tree, 0);

        container.querySelector('#add-new-category-btn').addEventListener('click', handleAddNewCategory);
        container.querySelector('#save-categories-btn').addEventListener('click', handleSaveCategories);
    };

    const handleAddNewCategory = () => {
        const listEl = document.getElementById('category-admin-list');
        const newCatId = `new-${Date.now()}`;
        const newSortOrder = (allCategories.length > 0) ? Math.max(...allCategories.map(c => c.sortOrder || 0)) + 10 : 0;
        const li = document.createElement('li');
        li.dataset.id = newCatId;
        li.innerHTML = `<input type="number" class="cat-order-input" value="${newSortOrder}"><div class="cat-name-cell"><input type="text" class="cat-name-input" value="新分类"></div><select class="cat-parent-select"></select><button class="delete-cat-btn secondary danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
        const parentSelect = li.querySelector('.cat-parent-select');
        populateCategoryDropdown(parentSelect, allCategories, null, newCatId);
        li.querySelector('.delete-cat-btn').onclick = () => li.remove();
        listEl.prepend(li);
        li.querySelector('.cat-name-input').focus();
    };

    const handleDeleteCategory = (catIdToDelete, catName) => {
        showConfirm('确认删除', `您确定要删除分类 "${catName}" 吗？这也会删除其下所有的子分类和书签。`, async () => {
            let idsToDelete = new Set([catIdToDelete]);
            let queue = [catIdToDelete];
            while(queue.length > 0){
                const parentId = queue.shift();
                allCategories.forEach(c => {
                    if(c.parentId === parentId) { idsToDelete.add(c.id); queue.push(c.id); }
                });
            }
            const finalCategories = allCategories.filter(c => !idsToDelete.has(c.id));
            const finalBookmarks = allBookmarks.filter(bm => !idsToDelete.has(bm.categoryId));
            try {
                await apiRequest('data', 'PUT', { categories: finalCategories, bookmarks: finalBookmarks });
                await initializePage();
            } catch (error) { alert('删除失败: ' + error.message); }
        });
    };

    const handleSaveCategories = async () => {
        const listItems = document.querySelectorAll('#category-admin-list li');
        let finalCategories = [];
        let hasError = false;
        const parentChildOrders = new Map();

        listItems.forEach(li => {
            const id = li.dataset.id;
            const name = li.querySelector('.cat-name-input').value.trim();
            const parentId = li.querySelector('.cat-parent-select').value || 'root';
            const sortOrder = parseInt(li.querySelector('.cat-order-input').value) || 0;
            if (!name) { alert('分类名称不能为空！'); hasError = true; }
            if (!parentChildOrders.has(parentId)) parentChildOrders.set(parentId, new Set());
            if (parentChildOrders.get(parentId).has(sortOrder)) {
                alert(`在同一个父分类下存在重复的排序号: ${sortOrder}`);
                hasError = true;
            }
            parentChildOrders.get(parentId).add(sortOrder);
            finalCategories.push({
                id: id.startsWith('new-') ? `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : id,
                sortOrder, name, parentId: parentId === 'root' ? null : parentId,
            });
        });
        if (hasError) return;
        try {
            await apiRequest('data', 'PUT', { categories: finalCategories });
            alert('分类保存成功！');
            await initializePage();
        } catch (error) { alert('保存失败: ' + error.message); }
    };

    // --- Tab 2: User Management ---


  // =======================================================================
// --- 请将这个代码块完整地粘贴到 admin.js 中 ---
// =======================================================================

// --- Tab 2: User Management ---
const renderUserAdminTab = (container) => {
    container.innerHTML = `<h2>用户管理</h2><div id="user-management-container"><div class="user-list-container"><h3>用户列表</h3><ul id="user-list"></ul></div><div class="user-form-container"><form id="user-form"><h3 id="user-form-title">添加新用户</h3><input type="hidden" id="user-form-username-hidden"><div class="form-group"><label for="user-form-username">用户名:</label><input type="text" id="user-form-username" required></div><div class="form-group"><label for="user-form-password">密码:</label><input type="password" id="user-form-password"></div><div class="form-group"><label>角色:</label><div id="user-form-roles" class="checkbox-group horizontal"></div></div><div class="form-group flex-grow"><label>可见分类:</label><div id="user-form-categories" class="checkbox-group"></div></div><div class="user-form-buttons"><button type="submit" class="button-primary">保存用户</button><button type="button" id="user-form-clear-btn" class="secondary">新增/清空</button></div><p class="modal-error-message"></p></form></div></div>`;
    
    const userList = container.querySelector('#user-list');
    const form = container.querySelector('#user-form');
    
    allUsers.forEach(user => {
        const li = document.createElement('li');
        li.dataset.username = user.username;

        if (user.username === 'public') {
            li.innerHTML = `<span><i class="fas fa-eye fa-fw"></i> ${user.username} (公共模式)</span>`;
        } else {
            li.innerHTML = `<span>${user.username} (${user.roles.join(', ')})</span>`;
        }

        if (user.username !== 'admin' && user.username !== 'public') {
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
                    } catch (error) { 
                        alert(error.message); 
                    }
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
            if (user) {
                populateUserForm(user);
            }
        }
    });

    container.querySelector('#user-form-clear-btn').onclick = clearUserForm;
    form.onsubmit = handleUserFormSubmit;
    
    clearUserForm(); 
};

// 在 admin.js 中, 找到并完全替换 populateUserForm 函数

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

// 在 admin.js 中, 找到并完全替换 renderUserFormRoles 函数
const renderUserFormRoles = (activeRoles = ['viewer']) => {
    const container = document.getElementById('user-form-roles'); if(!container) return;
    container.innerHTML = '';
    
    const username = document.getElementById('user-form-username').value;
    const isPublicUser = username === 'public';
    const isAdminUser = username === 'admin';

    ['admin', 'editor', 'viewer'].forEach(role => {
        const currentRole = activeRoles[0] || 'viewer';
        const isChecked = currentRole === role;

        const isDisabled = (isAdminUser && role !== 'admin') || (isPublicUser && role !== 'viewer');
        
        container.innerHTML += `
            <div>
                <input type="radio" id="role-${role}" name="role-selection" value="${role}" 
                       ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                <label for="role-${role}">${role}</label>
            </div>
        `;
    });
};


const renderUserFormCategories = (visibleIds = [], isDisabled = false) => {
    const container = document.getElementById('user-form-categories'); if(!container) return;
    container.innerHTML = '';
    const sortedCategories = [...allCategories].sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));
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
            if(node.children && node.children.length > 0) buildCheckboxes(node.children, level + 1);
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
    const userData = {
        roles: Array.from(form.querySelectorAll('#user-form-roles input:checked')).map(cb => cb.value),
        permissions: { visibleCategories: Array.from(form.querySelectorAll('#user-form-categories input:checked')).map(cb => cb.value) }
    };
    if (password) userData.password = password;
    if (!isEditing) userData.username = username;
    const endpoint = isEditing ? `users/${hiddenUsername}` : 'users';
    const method = isEditing ? 'PUT' : 'POST';
    try {
        await apiRequest(endpoint, method, userData);
        alert('用户保存成功！');
        await initializePage('tab-users');
    } catch(error) { errorEl.textContent = error.message; }
};

// =======================================================================
// --- 替换块结束 ---
// =======================================================================
    
    // --- Tab 3: Bookmark Management ---
    const renderBookmarkAdminTab = (container) => {
    container.innerHTML = `<h2>书签管理</h2><p class="admin-panel-tip">在这里管理所有的书签。点击“保存顺序”来应用排序变更。</p><div class="bookmark-admin-controls"><span>排序方式:</span><select id="bookmark-sort-select"><option value="name_asc">名称 (A-Z)</option><option value="name_desc">名称 (Z-A)</option><option value="category">按分类</option></select></div><div class="bookmark-admin-header"><span class="sort-col">排序</span><span>书签名称</span><span>所属分类</span><span>操作</span></div><div id="bookmark-admin-list-container"></div><div class="admin-panel-actions"><button id="save-bookmarks-btn"><i class="fas fa-save"></i> 保存书签顺序</button><button id="add-new-bookmark-btn" class="secondary"><i class="fas fa-plus"></i> 添加新书签</button></div>`;
    const listContainer = container.querySelector('#bookmark-admin-list-container');
 
       
        const ul = document.createElement('ul');
        listContainer.appendChild(ul);
        const sortBy = container.querySelector('#bookmark-sort-select').value;
        let sortedBookmarks = [...allBookmarks];
        const categoryNameMap = new Map(allCategories.map(c => [c.id, c.name]));

        switch (sortBy) {
            case 'name_desc': sortedBookmarks.sort((a,b) => b.name.localeCompare(a.name)); break;
            case 'category': sortedBookmarks.sort((a,b) => (categoryNameMap.get(a.categoryId) || '').localeCompare(categoryNameMap.get(b.categoryId) || '')); break;
            default: sortedBookmarks.sort((a,b) => a.name.localeCompare(b.name)); break;
        }

        sortedBookmarks.forEach(bm => {
            const li = document.createElement('li');
            li.dataset.id = bm.id;
            const category = allCategories.find(c => c.id === bm.categoryId);
            li.innerHTML = `<input type="number" class="bm-sort-order" value="${bm.sortOrder || 0}"><span class="bm-admin-name">${escapeHTML(bm.name)}</span><span class="bm-admin-cat">${category ? escapeHTML(category.name) : '无分类'}</span><div class="bm-admin-actions"><button class="edit-bm-btn secondary" title="编辑"><i class="fas fa-pencil-alt"></i></button><button class="delete-bm-btn danger secondary" title="删除"><i class="fas fa-trash-alt"></i></button></div>`;
            li.querySelector('.edit-bm-btn').onclick = () => handleEditBookmark(bm);
            li.querySelector('.delete-bm-btn').onclick = () => handleDeleteBookmark(bm);
            ul.appendChild(li);
        });
        container.querySelector('#save-bookmarks-btn').onclick = handleSaveBookmarks;
        container.querySelector('#bookmark-sort-select').onchange = () => renderBookmarkAdminTab(container);
        container.querySelector('#add-new-bookmark-btn').onclick = handleAddNewBookmark;
};

// 【新增】一个处理“添加新书签”的函数
const handleAddNewBookmark = () => {
    bookmarkEditForm.reset();
    bookmarkEditForm.querySelector('#bookmark-modal-title').textContent = '添加新书签';
    bookmarkEditForm.querySelector('#bm-edit-id').value = ''; // id为空表示是新增
    populateCategoryDropdown(bookmarkEditForm.querySelector('#bm-edit-category'), allCategories);
    showModal(bookmarkEditModal);
};
    
    const handleSaveBookmarks = async () => {
        const listItems = document.querySelectorAll('#bookmark-admin-list-container li');
        let updatedBookmarks = JSON.parse(JSON.stringify(allBookmarks));
        listItems.forEach(li => {
            const id = li.dataset.id;
            const sortOrder = parseInt(li.querySelector('.bm-sort-order').value) || 0;
            const bookmark = updatedBookmarks.find(bm => bm.id === id);
            if (bookmark) bookmark.sortOrder = sortOrder;
        });
        try {
            await apiRequest('data', 'PUT', { bookmarks: updatedBookmarks });
            alert('书签顺序保存成功！');
            await initializePage();
        } catch (error) { alert(`保存失败: ${error.message}`); }
    };

    const handleEditBookmark = (bookmark) => {
        bookmarkEditForm.reset();
        bookmarkEditForm.querySelector('#bm-edit-id').value = bookmark.id;
        bookmarkEditForm.querySelector('#bm-edit-name').value = bookmark.name;
        bookmarkEditForm.querySelector('#bm-edit-url').value = bookmark.url;
        bookmarkEditForm.querySelector('#bm-edit-desc').value = bookmark.description || '';
        bookmarkEditForm.querySelector('#bm-edit-icon').value = bookmark.icon || '';
        populateCategoryDropdown(bookmarkEditForm.querySelector('#bm-edit-category'), allCategories, bookmark.categoryId);
        showModal(bookmarkEditModal);
    };

    const handleDeleteBookmark = (bookmark) => {
        showConfirm('删除书签', `确定删除书签 "${bookmark.name}"?`, async () => {
            try {
                await apiRequest(`bookmarks/${bookmark.id}`, 'DELETE');
                await initializePage();
            } catch (error) { alert(`删除失败: ${error.message}`); }
        });
    };

    bookmarkEditForm.addEventListener('submit', async (e) => {
        e.preventDefault();
const id = bookmarkEditForm.querySelector('#bm-edit-id').value;
    const isEditing = !!id; // 如果id存在，则为编辑模式
   

        
       
        const data = {
name: bookmarkEditForm.querySelector('#bm-edit-name').value,
        url: bookmarkEditForm.querySelector('#bm-edit-url').value,
        description: bookmarkEditForm.querySelector('#bm-edit-desc').value,
        icon: bookmarkEditForm.querySelector('#bm-edit-icon').value,
        categoryId: bookmarkEditForm.querySelector('#bm-edit-category').value,
    };


        try {
            await apiRequest(`bookmarks/${id}`, 'PUT', data);
            hideAllModals();
            await initializePage();
        } catch (error) {
            bookmarkEditForm.querySelector('.modal-error-message').textContent = error.message;
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
                    importedCategories.push({
                        id: newCategoryId, name: folderHeader.textContent.trim(), parentId: parentId, sortOrder: currentCatSort++
                    });
                    const subList = child.nextElementSibling;
                    if (subList && subList.tagName === 'DL') parseNode(subList, newCategoryId);
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
        await initializePage();
    };

    // --- Initial Load ---
    initializePage();
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', hideAllModals));
    document.getElementById('confirm-btn-no').onclick = hideAllModals;
});
