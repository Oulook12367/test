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
            // 【重要修正】在执行回调函数之前，先调用 hideAllModals 关闭蒙版和所有弹窗
            hideAllModals(); 
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
    
   // 在 admin.js 中找到并【完全替换】此函数
const populateCategoryDropdown = (selectElement, categories, selectedId = null, ignoreId = null, options = { allowNoParent: true }) => {
    selectElement.innerHTML = ''; // 清空旧选项
    
    // 根据调用需要，决定是否显示“顶级分类”选项
    if (options.allowNoParent) {
        selectElement.innerHTML = '<option value="">-- 顶级分类 --</option>';
    }

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
// 在 admin.js 中找到并【再次确认/替换】此函数
const renderCategoryAdminTab = (container) => {
    container.innerHTML = `<h2>分类管理</h2>
        <p class="admin-panel-tip">任何修改（名称、排序、父级）都会即时自动保存。
        <span id="cat-save-status" style="margin-left: 10px; opacity: 0; transition: opacity 0.3s;"></span></p>
        <div class="category-admin-header"><span>排序</span><span style="grid-column: span 2;">分类名称</span><span>操作</span></div>
        <ul id="category-admin-list"></ul>
        <div class="admin-panel-actions"><button id="add-new-category-btn" class="secondary"><i class="fas fa-plus"></i> 添加新分类</button></div>`;
    
    const listEl = container.querySelector('#category-admin-list');
    const saveStatusEl = container.querySelector('#cat-save-status');

    // ... (自动保存的 debounce 函数逻辑保持不变) ...
    const saveAllCategoriesNow = debounce(async () => { /* ... */ }, 500);
    listEl.addEventListener('change', (e) => { /* ... */ });

    // --- 【重要】这里的逻辑决定了分类的显示顺序 ---
    const categoryMap = new Map(allCategories.map(cat => [cat.id, { ...cat, children: [] }]));
    const tree = [];
    // 1. 在构建树状结构之前，先对所有分类进行一次排序
    [...allCategories].sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
        if (cat.parentId && categoryMap.has(cat.parentId)) {
            categoryMap.get(cat.parentId).children.push(categoryMap.get(cat.id));
        } else {
            tree.push(categoryMap.get(cat.id));
        }
    });
    
    const buildList = (nodes, level) => {
        // 2. 在渲染每一层级的子分类时，再次进行排序
        nodes.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
            const li = document.createElement('li');
            li.dataset.id = cat.id;
            // ... (li.innerHTML 的内容保持不变) ...
            li.innerHTML = `<input type="number" class="cat-order-input" value="${cat.sortOrder || 0}"><div class="cat-name-cell" style="padding-left: ${level * 25}px;"><input type="text" class="cat-name-input" value="${escapeHTML(cat.name)}"></div><select class="cat-parent-select"></select><button class="delete-cat-btn secondary danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
            const parentSelect = li.querySelector('.cat-parent-select');
            populateCategoryDropdown(parentSelect, allCategories, cat.parentId, cat.id);
            li.querySelector('.delete-cat-btn').onclick = () => handleDeleteCategory(cat.id, cat.name);
            listEl.appendChild(li);
            // 递归渲染子分类
            if (cat.children.length > 0) buildList(cat.children, level + 1);
        });
    };
    // 从树的根节点开始构建列表
    buildList(tree, 0);

    container.querySelector('#add-new-category-btn').addEventListener('click', handleAddNewCategory);
};

// 在 admin.js 中找到并【完全替换】此函数
const handleAddNewCategory = () => {
    const listEl = document.getElementById('category-admin-list');
    const newCatId = `new-${Date.now()}`;
    
    // 【重要修改】从当前页面的输入框中动态计算最大排序号，更准确
    const allOrderInputs = listEl.querySelectorAll('.cat-order-input');
    const existingOrders = Array.from(allOrderInputs).map(input => parseInt(input.value) || 0);
    const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : -1;
    const newSortOrder = maxOrder + 10;

    const li = document.createElement('li');
    li.dataset.id = newCatId;
    li.innerHTML = `<input type="number" class="cat-order-input" value="${newSortOrder}"><div class="cat-name-cell"><input type="text" class="cat-name-input" value="新分类" placeholder="请输入名称后回车或失焦保存"></div><select class="cat-parent-select"></select><button class="delete-cat-btn secondary danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
    const parentSelect = li.querySelector('.cat-parent-select');
    populateCategoryDropdown(parentSelect, allCategories, null, newCatId);
    li.querySelector('.delete-cat-btn').onclick = () => li.remove();
    listEl.prepend(li); // 将新分类添加到列表顶部
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

 

    // --- Tab 2: User Management ---


  // =======================================================================
// --- 请将这个代码块完整地粘贴到 admin.js 中 ---
// =======================================================================

// --- Tab 2: User Management ---
// 在 admin.js 中, 找到并完全替换此函数
const renderUserAdminTab = (container) => {
    container.innerHTML = `<h2>用户管理</h2><div id="user-management-container"><div class="user-list-container"><h3>用户列表</h3><ul id="user-list"></ul></div><div class="user-form-container"><form id="user-form"><h3 id="user-form-title">添加新用户</h3><input type="hidden" id="user-form-username-hidden"><div class="form-group"><label for="user-form-username">用户名:</label><input type="text" id="user-form-username" required></div><div class="form-group"><label for="user-form-password">密码:</label><input type="password" id="user-form-password"></div><div class="form-group"><label>角色:</label><div id="user-form-roles" class="checkbox-group horizontal"></div></div><div class="form-group flex-grow"><label>可见分类:</label><div id="user-form-categories" class="checkbox-group"></div></div><div class="user-form-buttons"><button type="submit" class="button-primary">保存用户</button><button type="button" id="user-form-clear-btn" class="secondary">新增/清空</button></div><p class="modal-error-message"></p></form></div></div>`;
    
    const userList = container.querySelector('#user-list');
    const form = container.querySelector('#user-form');

    // 【新增】获取当前登录的用户名
    const token = localStorage.getItem('jwt_token');
    let currentUsername = '';
    if (token) {
        try {
            currentUsername = JSON.parse(atob(token.split('.')[1])).sub;
        } catch (e) {
            console.error("无法解析Token:", e);
        }
    }
    
    allUsers.forEach(user => {
        const li = document.createElement('li');
        li.dataset.username = user.username;

        if (user.username === 'public') {
            li.innerHTML = `<span><i class="fas fa-eye fa-fw"></i> ${user.username} (公共模式)</span>`;
        } else {
            li.innerHTML = `<span>${user.username} (${user.roles.join(', ')})</span>`;
        }

        // 【重要修改】判断逻辑变更
        // 只要列表中的用户不是 public，并且不是当前登录的用户自己，就显示删除按钮
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
                        // 检查是否删除了最后一个管理员（虽然后端有校验，前端也可以提醒）
                        const adminCount = allUsers.filter(u => u.roles.includes('admin')).length;
                        if(user.roles.includes('admin') && adminCount <= 1) {
                           alert("注意：您已删除最后一个管理员账户！");
                        }
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
        // 发起API请求，保存用户信息
        const updatedUser = await apiRequest(endpoint, method, userData);
        alert('用户保存成功！');

        // 【新增逻辑】检查被修改的是否为当前用户，以及权限是否变更
        const token = localStorage.getItem('jwt_token');
        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const currentUsername = payload.sub;

            // 如果当前登录的用户就是被编辑的用户
            if (currentUsername === updatedUser.username) {
                // 并且他的新角色列表中不再包含 'admin'
                if (!updatedUser.roles.includes('admin')) {
                    alert('您的管理员权限已被移除，将退出管理后台并返回主页。');
                    localStorage.removeItem('jwt_token');
                    window.location.href = 'index.html';
                    return; // 终止后续操作
                }
            }
        }

        await initializePage('tab-users');
    } catch(error) { errorEl.textContent = error.message; }
};

// =======================================================================
// --- 替换块结束 ---
// =======================================================================
    
    // --- Tab 3: Bookmark Management ---

const renderCategoryAdminTab = (container) => {
    // 【修改】增加了“上级分类”的表头
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
            const id = li.dataset.id;
            const name = li.querySelector('.cat-name-input').value.trim();
            const parentId = li.querySelector('.cat-parent-select').value || null;
            const sortOrder = parseInt(li.querySelector('.cat-order-input').value) || 0;
            if (!name) { hasError = true; }
            finalCategories.push({ id, sortOrder, name, parentId });
        });

        if (hasError) {
            alert('分类名称不能为空！');
            saveStatusEl.textContent = '保存失败！';
            setTimeout(() => { saveStatusEl.style.opacity = '0'; }, 2000);
            return;
        }

        try {
            await apiRequest('data', 'PUT', { categories: finalCategories });
            saveStatusEl.textContent = '已保存！';
            // 【重要修正】保存成功后，调用 initializePage 获取最新数据并重绘，确保排序生效
            await initializePage('tab-categories');
        } catch (error) {
            saveStatusEl.textContent = '保存失败！';
            alert('保存失败: ' + error.message);
            setTimeout(() => { saveStatusEl.style.opacity = '0'; }, 2000);
        }
    }, 500);

    listEl.addEventListener('change', (e) => {
        if (e.target.matches('.cat-order-input, .cat-name-input, .cat-parent-select')) {
            saveAllCategoriesNow();
        }
    });


    
    // 动态填充分类选项
    allCategories.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        categoryFilter.appendChild(option);
    });

    // 【重要修正】修复筛选器逻辑
    categoryFilter.onchange = () => {
        // 直接重新渲染本组件即可，无需请求服务器
        renderBookmarkAdminTab(container);
    };

    // 渲染列表 (保持和上次一样的逻辑)
    const selectedCategoryId = categoryFilter.value;
    let bookmarksToDisplay = [...allBookmarks];

    if (selectedCategoryId !== 'all') {
        bookmarksToDisplay = bookmarksToDisplay.filter(bm => bm.categoryId === selectedCategoryId);
    }
    bookmarksToDisplay.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    
    const categoryNameMap = new Map(allCategories.map(c => [c.id, c.name]));
    bookmarksToDisplay.forEach(bm => {
        const li = document.createElement('li');
        li.dataset.id = bm.id;
        li.innerHTML = `<input type="number" class="bm-sort-order" value="${bm.sortOrder || 0}"><span class="bm-admin-name">${escapeHTML(bm.name)}</span><span class="bm-admin-cat">${categoryNameMap.get(bm.categoryId) || '无分类'}</span><div class="bm-admin-actions"><button class="edit-bm-btn secondary" title="编辑"><i class="fas fa-pencil-alt"></i></button><button class="delete-bm-btn danger secondary" title="删除"><i class="fas fa-trash-alt"></i></button></div>`;
        li.querySelector('.edit-bm-btn').onclick = () => handleEditBookmark(bm);
        li.querySelector('.delete-bm-btn').onclick = () => handleDeleteBookmark(bm);
        listEl.appendChild(li);
    });

    // 恢复“添加新书签”按钮的功能
    container.querySelector('#add-new-bookmark-btn').onclick = handleAddNewBookmark;
};



// 【新增】一个处理“添加新书签”的函数
const handleAddNewBookmark = () => {
    if (!bookmarkEditForm || !bookmarkEditModal) {
        console.error('错误：书签编辑相关的DOM元素未找到。');
        return;
    }
    bookmarkEditForm.reset();
    document.getElementById('bookmark-modal-title').textContent = '添加新书签';
    bookmarkEditForm.querySelector('#bm-edit-id').value = '';
    
    const categorySelect = bookmarkEditForm.querySelector('#bm-edit-category');
    if (categorySelect) {
        // 【修改】传入新参数，不允许没有父级
        populateCategoryDropdown(categorySelect, allCategories, null, null, { allowNoParent: false });
    }
    
    showModal(bookmarkEditModal);
};
    
   

 const handleEditBookmark = (bookmark) => {
    bookmarkEditForm.reset();
    document.getElementById('bookmark-modal-title').textContent = '编辑书签';
    bookmarkEditForm.querySelector('#bm-edit-id').value = bookmark.id;
    bookmarkEditForm.querySelector('#bm-edit-name').value = bookmark.name;
    bookmarkEditForm.querySelector('#bm-edit-url').value = bookmark.url;
    bookmarkEditForm.querySelector('#bm-edit-desc').value = bookmark.description || '';
    bookmarkEditForm.querySelector('#bm-edit-icon').value = bookmark.icon || '';
    
    // 【修改】传入新参数，不允许没有父级
    populateCategoryDropdown(bookmarkEditForm.querySelector('#bm-edit-category'), allCategories, bookmark.categoryId, null, { allowNoParent: false });
    
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

  // 在 admin.js 中找到并替换这个事件监听器
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
// 在 admin.js 中，找到 parseAndImport 函数，并将其中的 parseNode 子函数替换为下面的版本
// 在 admin.js 的 parseAndImport 函数内部，找到并【完全替换】parseNode 子函数
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

            // 【重要修改】更鲁棒的子列表查找逻辑
            // 1. 先尝试在当前 <DT> 内部查找 <DL>
            let subList = child.querySelector('dl');
            // 2. 如果内部没有，再尝试查找 <DT> 的下一个兄弟元素是不是 <DL>
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
        await initializePage();
    };

    // --- Initial Load ---
    initializePage();
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', hideAllModals));
    document.getElementById('confirm-btn-no').onclick = hideAllModals;
});
