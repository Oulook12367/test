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
    let tempCategories = [];

    // --- UI Flow & Modals ---
    const showModal = (modal) => { 
        modalBackdrop.style.display = 'flex'; 
        modal.style.display = 'flex'; 
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
            // Re-show admin panel if it was open
            if(adminPageContainer.style.display !== 'none') {
                showModal(adminPanel);
            }
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
            allBookmarks = (data.bookmarks || []).map((bm, index) => ({...bm, sortOrder: bm.sortOrder ?? index }));
            allUsers = data.users || [];
            
            document.body.classList.remove('is-loading');
            document.body.className = localStorage.getItem('theme') || 'dark-theme';
            adminPageContainer.style.display = 'block';
            renderAdminTab('tab-categories');

        } catch (error) {
            // If anything fails, redirect to main page, which will then redirect to login if necessary
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
        switch (tabId) {
            case 'tab-categories':
                renderCategoryAdminTab();
                break;
            case 'tab-users':
                renderUserAdminTab();
                break;
            case 'tab-bookmarks':
                renderBookmarkAdminTab();
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
    const renderCategoryAdminTab = () => {
        tempCategories = JSON.parse(JSON.stringify(allCategories));
        const listEl = document.getElementById('category-admin-list');
        listEl.innerHTML = '';
        
        tempCategories.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
            const li = document.createElement('li');
            li.dataset.id = cat.id;
            li.innerHTML = `<input type="number" class="cat-order-input" value="${cat.sortOrder || 0}"><input type="text" class="cat-name-input" value="${escapeHTML(cat.name)}"><select class="cat-parent-select"></select><button class="delete-cat-btn secondary danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
            const parentSelect = li.querySelector('.cat-parent-select');
            populateCategoryDropdown(parentSelect, tempCategories, cat.parentId, cat.id);
            
            li.querySelector('.delete-cat-btn').onclick = () => {
                showConfirm('确认删除', `您确定要删除分类 "${cat.name}" 吗？这也会删除其下所有的子分类。`, () => {
                    const catIdToDelete = cat.id;
                    let idsToDelete = new Set([catIdToDelete]);
                    let queue = [catIdToDelete];
                    while(queue.length > 0){
                        const parentId = queue.shift();
                        tempCategories.forEach(c => {
                            if(c.parentId === parentId) { idsToDelete.add(c.id); queue.push(c.id); }
                        });
                    }
                    tempCategories = tempCategories.filter(c => !idsToDelete.has(c.id));
                    renderCategoryAdminTab();
                });
            };
            listEl.appendChild(li);
        });
    };

    document.getElementById('add-new-category-btn').addEventListener('click', () => {
        const newCat = {
            id: `new-${Date.now()}`, name: '新分类', parentId: null,
            sortOrder: (tempCategories.length > 0) ? Math.max(...tempCategories.map(c => c.sortOrder || 0)) + 10 : 0
        };
        tempCategories.unshift(newCat);
        renderCategoryAdminTab();
        const newLi = document.querySelector(`#category-admin-list li[data-id="${newCat.id}"]`);
        if (newLi) { newLi.querySelector('.cat-name-input').focus(); newLi.querySelector('.cat-name-input').select(); }
    });

    document.getElementById('save-categories-btn').addEventListener('click', async () => {
        const listItems = document.querySelectorAll('#category-admin-list li');
        let finalCategories = [];
        let hasError = false;

        listItems.forEach(li => {
            const id = li.dataset.id;
            const name = li.querySelector('.cat-name-input').value.trim();
            if (!name) { alert('分类名称不能为空！'); hasError = true; }
            finalCategories.push({
                id: id.startsWith('new-') ? `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : id,
                sortOrder: parseInt(li.querySelector('.cat-order-input').value) || 0,
                name: name, parentId: li.querySelector('.cat-parent-select').value || null,
            });
        });
        if (hasError) return;
        try {
            await apiRequest('data', 'PUT', { categories: finalCategories });
            alert('分类保存成功！');
            await initializePage();
        } catch (error) { alert('保存失败: ' + error.message); }
    });

    // --- Tab 2: User Management ---
    const renderUserAdminTab = () => {
        const container = document.getElementById('tab-users');
        container.innerHTML = `
            <h2>用户管理</h2>
            <div id="user-management-container">
                <div class="user-list-container">
                    <h3>用户列表</h3>
                    <ul id="user-list"></ul>
                </div>
                <div class="user-form-container">
                    <h3 id="user-form-title">添加新用户</h3>
                    <form id="user-form">
                        <input type="hidden" id="user-form-username-hidden">
                        <label for="user-form-username">用户名:</label>
                        <input type="text" id="user-form-username" required>
                        <label for="user-form-password">密码:</label>
                        <input type="password" id="user-form-password">
                        <label>角色:</label>
                        <div id="user-form-roles" class="checkbox-group horizontal"></div>
                        <label>可见分类:</label>
                        <div id="user-form-categories" class="checkbox-group"></div>
                        <div class="user-form-buttons">
                            <button type="submit">保存用户</button>
                            <button type="button" id="user-form-clear-btn" class="secondary">新增用户</button>
                        </div>
                        <p class="modal-error-message"></p>
                    </form>
                </div>
            </div>`;
        
        const userList = container.querySelector('#user-list');
        userList.innerHTML = '';
        allUsers.forEach(user => {
            const li = document.createElement('li');
            li.dataset.username = user.username;
            li.innerHTML = `<span>${user.username} (${user.roles.join(', ')})</span>`;
            if (user.username !== 'admin') {
                const delBtn = document.createElement('button');
                delBtn.className = 'danger';
                delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    showConfirm('删除用户', `确定删除用户 "${user.username}"?`, async () => {
                        try {
                            await apiRequest(`users/${user.username}`, 'DELETE');
                            await initializePage();
                        } catch (error) { alert(error.message); }
                    });
                };
                li.appendChild(delBtn);
            }
            li.onclick = () => populateUserForm(user);
            userList.appendChild(li);
        });
        
        container.querySelector('#user-form-clear-btn').onclick = clearUserForm;
        container.querySelector('#user-form').onsubmit = handleUserFormSubmit;
        clearUserForm();
    };

    const populateUserForm = (user) => {
        const form = document.getElementById('user-form');
        if (!form) return;
        form.reset();
        form.querySelector('#user-form-title').textContent = `编辑用户: ${user.username}`;
        form.querySelector('.modal-error-message').textContent = '';
        const usernameInput = form.querySelector('#user-form-username');
        usernameInput.value = user.username;
        usernameInput.readOnly = true;
        form.querySelector('#user-form-username-hidden').value = user.username;
        form.querySelector('#user-form-password').placeholder = "留空则不修改";

        renderUserFormRoles(user.roles);
        renderUserFormCategories(user.permissions?.visibleCategories || [], user.roles.includes('admin'));
        document.querySelectorAll('#user-list li').forEach(li => li.classList.remove('selected'));
        document.querySelector(`#user-list li[data-username="${user.username}"]`)?.classList.add('selected');
    };

    const clearUserForm = () => {
        const form = document.getElementById('user-form');
        if (!form) return;
        form.reset();
        form.querySelector('#user-form-title').textContent = '添加新用户';
        form.querySelector('.modal-error-message').textContent = '';
        const usernameInput = form.querySelector('#user-form-username');
        usernameInput.value = '';
        usernameInput.readOnly = false;
        form.querySelector('#user-form-password').placeholder = "必填";
        form.querySelector('#user-form-username-hidden').value = '';
        renderUserFormRoles();
        renderUserFormCategories();
        document.querySelectorAll('#user-list li').forEach(li => li.classList.remove('selected'));
    };

    const renderUserFormRoles = (activeRoles = []) => {
        const container = document.getElementById('user-form-roles');
        if(!container) return;
        container.innerHTML = '';
        ['admin', 'editor', 'viewer'].forEach(role => {
            container.innerHTML += `<div><input type="checkbox" id="role-${role}" value="${role}" ${activeRoles.includes(role) ? 'checked' : ''}><label for="role-${role}">${role}</label></div>`;
        });
    };

    const renderUserFormCategories = (visibleIds = [], isDisabled = false) => {
        const container = document.getElementById('user-form-categories');
        if(!container) return;
        container.innerHTML = '';
        const sortedCategories = [...allCategories].sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        
        const buildCheckboxes = (nodes, level) => {
            if (level >= 4) return;
            for (const node of nodes) {
                 container.innerHTML += `<div><input type="checkbox" id="cat-perm-${node.id}" value="${node.id}" ${visibleIds.includes(node.id) ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}><label for="cat-perm-${node.id}" style="padding-left: ${level * 20}px">${escapeHTML(node.name)}</label></div>`;
                if(node.children && node.children.length > 0) buildCheckboxes(node.children, level + 1);
            }
        };

        const categoryMap = new Map(sortedCategories.map(cat => [cat.id, { ...cat, children: [] }]));
        const tree = [];
        for (const cat of sortedCategories) {
            if (cat.parentId && categoryMap.has(cat.parentId)) categoryMap.get(cat.parentId).children.push(categoryMap.get(cat.id));
            else tree.push(categoryMap.get(cat.id));
        }
        buildCheckboxes(tree, 0);
    };

    const handleUserFormSubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const hiddenUsername = form.querySelector('#user-form-username-hidden').value;
        const isEditing = !!hiddenUsername;
        const username = form.querySelector('#user-form-username').value;
        const password = form.querySelector('#user-form-password').value;
        const errorEl = form.querySelector('.modal-error-message');
        errorEl.textContent = '';
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
            await initializePage();
        } catch(error) {
            errorEl.textContent = error.message;
        }
    };
    
    // --- Tab 3: Bookmark Management ---
    const renderBookmarkAdminTab = (sortBy = 'name_asc') => {
        const container = document.getElementById('bookmark-admin-list-container');
        const ul = document.createElement('ul');
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
        container.innerHTML = '';
        container.appendChild(ul);
    };
    
    document.getElementById('save-bookmarks-btn').addEventListener('click', async () => {
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
    });

    document.getElementById('bookmark-sort-select').onchange = (e) => renderBookmarkAdminTab(e.target.value);

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
    document.getElementById('import-bookmarks-btn-admin').addEventListener('click', () => {
        document.getElementById('import-file-input-admin').click();
    });
    document.getElementById('import-file-input-admin').addEventListener('change', (e) => {
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
    });

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
