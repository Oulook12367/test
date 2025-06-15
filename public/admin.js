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

// --- 1. 新增：一个非阻塞的消息提示工具 (用它来代替所有 alert) ---
function showToast(message, isError = false) {
    let toast = document.querySelector('.toast-message');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast-message';
        // 为 toast 添加一些基本样式
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '30px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 25px',
            borderRadius: '12px',
            color: 'white',
            background: isError ? 'rgba(239, 68, 68, 0.8)' : 'rgba(34, 197, 94, 0.8)', // 红色或绿色背景
            backdropFilter: 'blur(10px)',
            webkitBackdropFilter: 'blur(10px)',
            zIndex: '9999',
            opacity: '0',
            transition: 'opacity 0.3s ease-in-out',
            fontWeight: '700',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
        });
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.background = isError ? 'rgba(239, 68, 68, 0.8)' : 'rgba(34, 197, 94, 0.8)';
    toast.style.opacity = '1';

    // 3秒后自动消失
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}


    
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
        if (options.allowNoParent) selectElement.innerHTML = '<option value=""> 顶级分类 </option>';
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
        container.innerHTML = `<p class="admin-panel-tip" style="margin-bottom: 1rem;">通过修改表单来调整分类，完成后请点击下方的“保存全部分类”按钮。</p><div class="category-admin-header"><span>排序</span><span>分类名称</span><span>上级分类</span><span>操作</span></div><div style="flex-grow: 1; overflow-y: auto; min-height: 0;"><ul id="category-admin-list"></ul></div><div class="admin-panel-actions"><button id="save-categories-btn" class="button button-primary"><i class="fas fa-save"></i> 保存全部分类</button><button id="add-new-category-btn" class="button"><i class="fas fa-plus"></i> 添加新分类</button></div>`;
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
        
        listEl.innerHTML = ''; // Clear existing list
        bookmarksToDisplay.forEach(bm => {
            const li = document.createElement('li');
            li.dataset.id = bm.id;
            // [新功能] 书签名称和分类现在是可编辑的输入框和下拉菜单
            li.innerHTML = `<input type="number" class="bm-sort-order" value="${bm.sortOrder || 0}">` +
                         `<input type="text" class="bm-name-input" value="${escapeHTML(bm.name)}">` +
                         `<select class="bm-category-select"></select>` +
                         `<div class="bm-admin-actions">` +
                         `<button class="edit-bm-btn button-icon" title="编辑网址、描述、图标"><i class="fas fa-pencil-alt"></i></button>` +
                         `<button class="delete-bm-btn danger button-icon" title="删除"><i class="fas fa-trash-alt"></i></button>` +
                         `</div>`;
            const categorySelect = li.querySelector('.bm-category-select');
            // 为每个书签的分类下拉菜单填充选项
            populateCategoryDropdown(categorySelect, allCategories, bm.categoryId, null, { allowNoParent: false });
            listEl.appendChild(li);
        });
    };

    const renderBookmarkAdminTab = (container) => {
        container.innerHTML = `<p class="admin-panel-tip" style="margin-bottom: 1rem;">通过直接修改表单来调整书签，书签描述或图标请点击编辑按钮。修改完成后，点击下方的“保存全部书签”按钮来应用更改。</p><div class="bookmark-admin-controls" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;"><span>筛选分类:</span><select id="bookmark-category-filter" style="width: auto; max-width: 350px; flex-grow: 1;"><option value="all"> 显示全部分类 </option></select></div><div class="bookmark-admin-header"><span class="sort-col">排序</span><span>书签名称</span><span>所属分类</span><span>操作</span></div><div style="flex-grow: 1; overflow-y: auto; min-height: 0;"><div id="bookmark-admin-list-container"><ul></ul></div></div><div class="admin-panel-actions"><button id="save-bookmarks-btn" class="button button-primary"><i class="fas fa-save"></i> 保存全部书签</button><button id="add-new-bookmark-btn" class="button"><i class="fas fa-plus"></i> 添加新书签</button></div>`;
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

   // --- 2. 替换 handleSaveCategories 函数 ---
const handleSaveCategories = async () => {
    const saveBtn = document.getElementById('save-categories-btn');
    if (!saveBtn || saveBtn.disabled) return;
    const originalBtnHTML = saveBtn.innerHTML;

    // 步骤 1: 暂存旧数据，用于失败时回滚
    const originalCategories = JSON.parse(JSON.stringify(allCategories));

    // 步骤 2: 收集新数据
    const listItems = document.querySelectorAll('#category-admin-list li');
    let finalCategories = [];
    let hasError = false;
    const newIdMap = new Map();
    listItems.forEach((li, index) => {
        const idVal = li.dataset.id;
        const name = li.querySelector('.cat-name-input').value.trim();
        if (!name) { hasError = true; }
        
        let newId = idVal;
        if (idVal.startsWith('new-')) {
            newId = `cat-${Date.now()}-${index}`; // 确保ID唯一
            newIdMap.set(idVal, newId);
        }

        finalCategories.push({
            id: newId,
            name: name,
            parentId: li.querySelector('.cat-parent-select').value || null,
            sortOrder: parseInt(li.querySelector('.cat-order-input').value) || 0,
        });
    });
    
    // 如果有子分类的父ID是临时的'new-'ID，也需要更新
    finalCategories.forEach(cat => {
        if (cat.parentId && newIdMap.has(cat.parentId)) {
            cat.parentId = newIdMap.get(cat.parentId);
        }
    });

    if (hasError) {
        showToast('错误：分类名称不能为空！', true);
        return;
    }

    // 步骤 3: 乐观更新 - 立即更新本地状态和UI
    allCategories = finalCategories;
    renderAdminTab('tab-categories'); // 使用新数据重新渲染分类UI
    showToast("分类已更新，正在后台同步...");

    // 步骤 4: 后台发送API请求，并处理UI反馈
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 同步中...';
    saveBtn.disabled = true;

    try {
        // 后端将负责处理ID的最终确认
        await apiRequest('data', 'PUT', { categories: finalCategories });
        saveBtn.innerHTML = '<i class="fas fa-check"></i> 同步成功';
        // 成功后，为了获取后端可能生成的新ID，需要重新初始化数据
        // 但为了更好的体验，我们可以只更新ID，而不是整个页面刷新
        await initializePage('tab-categories');

    } catch (error) {
        // 步骤 5: 失败回滚 - 恢复数据和UI
        showToast('同步失败，已撤销更改: ' + error.message, true);
        allCategories = originalCategories; // 恢复JS数据
        renderAdminTab('tab-categories'); // 用旧数据恢复UI
        saveBtn.innerHTML = '<i class="fas fa-times"></i> 同步失败';
    } finally {
        // 步骤 6: 无论成功失败，2秒后恢复按钮
        setTimeout(() => {
            if (saveBtn) {
                saveBtn.innerHTML = originalBtnHTML;
                saveBtn.disabled = false;
            }
        }, 2000);
    }
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
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!submitBtn || submitBtn.disabled) return;
    const originalBtnHTML = submitBtn.innerHTML;
    const errorEl = form.querySelector('.modal-error-message');
    errorEl.textContent = '';

    // 步骤 1: 暂存旧数据
    const originalUsers = JSON.parse(JSON.stringify(allUsers));
    
    // 步骤 2: 收集新数据
    const hiddenUsername = form.querySelector('#user-form-username-hidden').value;
    const isEditing = !!hiddenUsername;
    const username = form.querySelector('#user-form-username').value.trim();
    const password = form.querySelector('#user-form-password').value;

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

    // 步骤 3: 乐观更新UI
    // 为了简化，我们直接重新初始化整个用户标签页，因为它也包含了表单状态
    // 这里可以先不更新allUsers，等待API成功后再做，因为涉及密码哈希等后端逻辑
    showToast("正在提交用户数据...");

    // 步骤 4: 后台请求
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
    submitBtn.disabled = true;

    try {
        const savedUser = await apiRequest(endpoint, method, userData);
        submitBtn.innerHTML = '<i class="fas fa-check"></i> 保存成功!';
        
        // 操作成功后，再更新前端数据并刷新UI
        showToast("用户保存成功！");
        
        // 检查当前登录用户是否被降权
        const token = localStorage.getItem('jwt_token');
        if (token) {
            const payload = parseJwtPayload(token);
            if (payload.sub === savedUser.username && !savedUser.roles.includes('admin')) {
                showToast('您的管理员权限已被移除，将退出管理后台。', true);
                localStorage.removeItem('jwt_token');
                setTimeout(() => window.location.href = 'index.html', 2000);
                return;
            }
        }
        
        // 重新加载页面数据以确保完全同步
        await initializePage('tab-users');
        clearUserForm(); // 清空并重置表单

    } catch (error) {
        // 步骤 5: 失败回滚（对于用户表单，主要是UI上的回滚）
        errorEl.textContent = error.message;
        submitBtn.innerHTML = '<i class="fas fa-times"></i> 保存失败';
        // 因为我们没有预先修改allUsers，所以不需要JS数据回滚
    } finally {
        // 步骤 6: 恢复按钮
        setTimeout(() => {
            if (submitBtn) {
                submitBtn.innerHTML = originalBtnHTML;
                submitBtn.disabled = false;
            }
        }, 2000);
    }
};

    
// --- 3. 替换 handleSaveBookmarks 函数 ---
const handleSaveBookmarks = async () => {
    const saveBtn = document.getElementById('save-bookmarks-btn');
    if (!saveBtn || saveBtn.disabled) return;
    const originalBtnHTML = saveBtn.innerHTML;

    // 步骤 1: 暂存旧数据
    const originalBookmarks = JSON.parse(JSON.stringify(allBookmarks));

    // 步骤 2: 收集新数据
    const listItems = document.querySelectorAll('#bookmark-admin-list-container li');
    let hasChanges = false;
    listItems.forEach(li => {
        const id = li.dataset.id;
        const bookmark = allBookmarks.find(bm => bm.id === id);
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

    if (!hasChanges) {
        showToast("没有检测到任何更改。");
        return;
    }

    // 步骤 3: 乐观更新UI
    const currentFilter = document.getElementById('bookmark-category-filter').value;
    renderBookmarkList(currentFilter); // 使用已修改的allBookmarks数组重新渲染
    showToast("书签已更新，正在后台同步...");

    // 步骤 4: 后台请求
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 同步中...';
    saveBtn.disabled = true;
    
    try {
        await apiRequest('data', 'PUT', { bookmarks: allBookmarks });
        saveBtn.innerHTML = '<i class="fas fa-check"></i> 同步成功';
    } catch (error) {
        // 步骤 5: 失败回滚
        showToast(`保存失败，已撤销更改: ${error.message}`, true);
        allBookmarks = originalBookmarks; // 恢复JS数据
        renderBookmarkList(currentFilter); // 用旧数据恢复UI
        saveBtn.innerHTML = '<i class="fas fa-times"></i> 同步失败';
    } finally {
        // 步骤 6: 恢复按钮
        setTimeout(() => {
            if (saveBtn) {
                saveBtn.innerHTML = originalBtnHTML;
                saveBtn.disabled = false;
            }
        }, 2000);
    }
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
        await apiRequest('data', 'PUT', { categories: finalCategories, bookmarks: finalBookmarks });
        await initializePage('tab-system');
    };

    // --- The Master Event Listener ---
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
                            try {
                                await apiRequest(`users/${encodeURIComponent(username)}`, 'DELETE');
                                await initializePage('tab-users');
                            } catch (error) { alert(error.message); }
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
                            alert('书签导入成功！');
                            await initializePage('tab-system');
                        } catch (error) { alert(`导入失败: ${error.message}`); }
                    };
                    reader.readAsText(file);
                    event.target.value = '';
                }
            }
        });
        
        // [KEY FIX] The focusout listener is now attached to the document
        // to correctly capture events from the modal, which is outside adminContentPanel.
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

                    if (data.title && !nameInput.value) {
                        nameInput.value = data.title;
                    }
                    if (data.description && !descInput.value) {
                        descInput.value = data.description;
                    }
                    if (data.icon && !iconInput.value) {
                        iconInput.value = data.icon;
                    }
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
                if (index > -1) allBookmarks[index] = savedBookmark;
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
