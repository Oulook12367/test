document.addEventListener('DOMContentLoaded', () => {
    // --- 1. STATE & ELEMENTS ---
    let allData = { bookmarks: [], categories: [], users: [] };
    let dataVersion = null;
    let confirmCallback = null;

    const adminPageContainer = document.getElementById('admin-page-container');
    const adminContentPanel = document.getElementById('admin-panel-content');
    const adminPanelNav = document.querySelector('.admin-panel-nav');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const confirmModal = document.getElementById('confirm-modal');
    const bookmarkEditModal = document.getElementById('bookmark-edit-modal');
    const bookmarkEditForm = document.getElementById('bookmark-edit-form');
    
    // --- 2. UTILITY FUNCTIONS ---
    const escapeHTML = (str) => str ? String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]) : '';
    const showModal = (modal) => { modalBackdrop.style.display = 'flex'; modal.style.display = 'block'; };
    const hideAllModals = () => { if(modalBackdrop) modalBackdrop.style.display = 'none'; };
    const showConfirm = (title, text, onConfirm) => {
        confirmModal.querySelector('#confirm-title').textContent = title;
        confirmModal.querySelector('#confirm-text').textContent = text;
        confirmCallback = onConfirm;
        showModal(confirmModal);
    };

    // --- 3. API REQUEST ---
    async function apiRequest(endpoint, method = 'GET', body = null) {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('jwt_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (['PATCH', 'POST', 'PUT', 'DELETE'].includes(method) && dataVersion) {
            headers['If-Match'] = dataVersion;
        }
        
        const options = { method, headers, cache: 'no-cache', body: body ? JSON.stringify(body) : null };
        const response = await fetch(`/api/${endpoint}`, options);
        
        const newVersion = response.headers.get('ETag');
        if (newVersion) dataVersion = newVersion;
        
        if (response.status === 204) return null;
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Request failed: ${response.status}`);
        return result;
    }

    // --- 4. RENDER FUNCTIONS (Kept your detailed implementations) ---
    
    const renderActiveTab = () => {
        const activeLink = adminPanelNav.querySelector('.admin-tab-link.active');
        if (activeLink) renderAdminTab(activeLink.dataset.tab);
    };

    const renderAdminTab = (tabId) => {
        if (!adminContentPanel) return;
        adminContentPanel.innerHTML = ''; // Always clear before rendering
        switch (tabId) {
            case 'tab-categories': renderCategoryAdminTab(); break;
            case 'tab-users': renderUserAdminTab(); break;
            case 'tab-bookmarks': renderBookmarkAdminTab(); break;
            case 'tab-system': renderSystemSettingsTab(); break;
        }
    };

    const populateCategoryDropdown = (select, categories, selectedId, ignoreId, options = { allowNoParent: true }) => {
        select.innerHTML = options.allowNoParent ? '<option value="">顶级分类</option>' : '';
        const categoryMap = new Map(categories.map(cat => [cat.id, { ...cat, children: [] }]));
        const tree = [];
        categories.forEach(cat => {
            if (cat.id === ignoreId) return;
            if (cat.parentId && categoryMap.has(cat.parentId)) categoryMap.get(cat.parentId).children.push(categoryMap.get(cat.id));
            else tree.push(categoryMap.get(cat.id));
        });
        const buildOptions = (nodes, level) => {
            nodes.sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).forEach(node => {
                select.innerHTML += `<option value="${node.id}" ${node.id === selectedId ? 'selected' : ''}>${'— '.repeat(level)}${escapeHTML(node.name)}</option>`;
                if (node.children?.length > 0) buildOptions(node.children, level + 1);
            });
        };
        buildOptions(tree, 0);
    };

    const renderCategoryAdminTab = () => {
        adminContentPanel.innerHTML = `
            <p class="admin-panel-tip">通过修改表单来调整分类，完成后请点击下方的“保存”按钮。</p>
            <div class="category-admin-header"><span>排序</span><span>分类名称</span><span>上级分类</span><span>操作</span></div>
            <div style="flex-grow: 1; overflow-y: auto;"><ul id="category-admin-list"></ul></div>
            <div class="admin-panel-actions">
                <button data-action="save-categories" class="button button-primary"><i class="fas fa-save"></i> 保存全部分类</button>
                <button data-action="add-new-category" class="button"><i class="fas fa-plus"></i> 添加新分类</button>
            </div>`;
        const listEl = adminContentPanel.querySelector('#category-admin-list');
        const categoryMap = new Map(allData.categories.map(c => [c.id, { ...c, children: [] }]));
        const tree = [];
        allData.categories.forEach(c => {
            if (c.parentId && categoryMap.has(c.parentId)) categoryMap.get(c.parentId).children.push(categoryMap.get(c.id));
            else tree.push(categoryMap.get(c.id));
        });
        const buildList = (nodes, level) => {
            nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
                const li = document.createElement('li');
                li.dataset.id = cat.id;
                li.innerHTML = `
                    <input type="number" class="cat-order-input" value="${cat.sortOrder || 0}">
                    <div class="cat-name-cell" style="padding-left: ${level * 25}px;"><input type="text" class="cat-name-input" value="${escapeHTML(cat.name)}"></div>
                    <select class="cat-parent-select"></select>
                    <button data-action="delete-category" class="delete-cat-btn button-icon danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
                populateCategoryDropdown(li.querySelector('.cat-parent-select'), allData.categories, cat.parentId, cat.id);
                listEl.appendChild(li);
                if (cat.children && cat.children.length > 0) buildList(cat.children, level + 1);
            });
        };
        buildList(tree, 0);
    };
    
    const renderBookmarkAdminTab = () => {
        adminContentPanel.innerHTML = `
            <p class="admin-panel-tip">直接修改下表中的名称、排序和所属分类，然后点击“保存”按钮。</p>
            <div class="bookmark-admin-controls" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                <span>筛选分类:</span>
                <select id="bookmark-category-filter" style="width: auto; max-width: 350px; flex-grow: 1;"><option value="all">-- 显示全部分类 --</option></select>
            </div>
            <div class="bookmark-admin-header"><span>排序</span><span>书签名称</span><span>所属分类</span><span>操作</span></div>
            <div id="bookmark-admin-list-container" style="flex-grow: 1; overflow-y: auto; min-height: 0;"><ul></ul></div>
            <div class="admin-panel-actions">
                <button data-action="save-bookmarks" class="button button-primary"><i class="fas fa-save"></i> 保存书签</button>
                <button data-action="add-new-bookmark" class="button"><i class="fas fa-plus"></i> 添加新书签</button>
            </div>`;
        const categoryFilter = adminContentPanel.querySelector('#bookmark-category-filter');
        allData.categories.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
            categoryFilter.innerHTML += `<option value="${cat.id}">${escapeHTML(cat.name)}</option>`;
        });
        const lastFilter = sessionStorage.getItem('admin_bookmark_filter') || 'all';
        categoryFilter.value = lastFilter;
        renderBookmarkList(lastFilter);
    };

    const renderBookmarkList = (categoryId) => {
        const listEl = adminContentPanel.querySelector('#bookmark-admin-list-container ul');
        if (!listEl) return;
        const bookmarksToDisplay = categoryId === 'all' ? [...allData.bookmarks] : allData.bookmarks.filter(bm => bm.categoryId === categoryId);
        bookmarksToDisplay.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        listEl.innerHTML = '';
        bookmarksToDisplay.forEach(bm => {
            const li = document.createElement('li');
            li.dataset.id = bm.id;
            li.innerHTML = `
                <input type="number" class="bm-sort-order" value="${bm.sortOrder || 0}">
                <input type="text" class="bm-name-input" value="${escapeHTML(bm.name)}">
                <select class="bm-category-select"></select>
                <div class="bm-admin-actions">
                    <button data-action="edit-bookmark" class="edit-bm-btn button-icon" title="编辑网址、描述、图标"><i class="fas fa-pencil-alt"></i></button>
                    <button data-action="delete-bookmark" class="delete-bm-btn danger button-icon" title="删除"><i class="fas fa-trash-alt"></i></button>
                </div>`;
            populateCategoryDropdown(li.querySelector('.bm-category-select'), allData.categories, bm.categoryId, null, { allowNoParent: false });
            listEl.appendChild(li);
        });
    };
    
    const renderUserAdminTab = () => {
        adminContentPanel.innerHTML = `
            <div id="user-management-container">
                <div class="user-list-container">
                    <h3>用户列表</h3>
                    <ul id="user-list"></ul>
                </div>
                <div class="user-form-container">
                    <form id="user-form" novalidate>
                        <!-- Form content is rendered by clearUserForm/populateUserForm -->
                    </form>
                </div>
            </div>`;
        const userList = adminContentPanel.querySelector('#user-list');
        const currentUsername = parseJwtPayload(localStorage.getItem('jwt_token'))?.sub;
        allData.users.forEach(user => {
            const li = document.createElement('li');
            li.dataset.username = user.username;
            li.innerHTML = `<span>${escapeHTML(user.username)} (${user.roles.join(', ')})</span>`;
            if (user.username !== 'public' && user.username !== currentUsername) {
                li.innerHTML += `<button data-action="delete-user" class="button-icon danger" title="删除用户"><i class="fas fa-trash-alt"></i></button>`;
            }
            userList.appendChild(li);
        });
        clearUserForm();
    };

    const renderSystemSettingsTab = () => {
        adminContentPanel.innerHTML = `
            <div class="system-setting-item">
                <p style="margin-bottom: 1.5rem;">从浏览器导出的HTML文件导入书签。导入操作会合并现有书签，不会清空原有数据。</p>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <h3><i class="fas fa-file-import"></i> 导入书签</h3>
                    <button data-action="import-bookmarks" class="button">选择HTML文件</button>
                    <input type="file" id="import-file-input-admin" accept=".html,.htm" style="display: none;">
                </div>
            </div>`;
    };

    const populateUserForm = (user) => {
        const form = adminContentPanel.querySelector('#user-form');
        if (!form) return;
        const isEditing = !!user;
        const targetUser = user || {};
        const isPublicUser = targetUser.username === 'public';
        const isAdminUser = targetUser.username === 'admin';
        
        form.innerHTML = `
            <h3 id="user-form-title">${isEditing ? `编辑用户: ${escapeHTML(targetUser.username)}` : '添加新用户'}</h3>
            <input type="hidden" id="user-form-username-hidden" value="${isEditing ? escapeHTML(targetUser.username) : ''}">
            <div class="form-group-inline">
                <label for="user-form-username">用户名:</label>
                <input type="text" id="user-form-username" value="${isEditing ? escapeHTML(targetUser.username) : ''}" ${isEditing ? 'readonly' : ''} required>
            </div>
            <div class="form-group-inline">
                <label for="user-form-password">密码:</label>
                <input type="password" id="user-form-password" placeholder="${isEditing ? '留空则不修改' : '必填'}" ${isPublicUser ? 'disabled' : ''}>
            </div>
            <div class="form-group-inline">
                <label>角色:</label>
                <div id="user-form-roles" class="checkbox-group horizontal">
                    ${['admin', 'editor', 'viewer'].map(role => `
                        <div>
                            <input type="radio" id="role-${role}" name="role-selection" value="${role}" 
                            ${(targetUser.roles?.[0] || 'viewer') === role ? 'checked' : ''}
                            ${(isAdminUser && role !== 'admin') || (isPublicUser && role !== 'viewer') ? 'disabled' : ''}>
                            <label for="role-${role}">${role}</label>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="form-group-inline">
                <label for="user-form-default-cat">默认显示分类:</label>
                <select id="user-form-default-cat"></select>
            </div>
            <div class="form-group flex-grow">
                <label>可见分类:</label>
                <div id="user-form-categories" class="checkbox-group"></div>
            </div>
            <div class="user-form-buttons">
                <button type="submit" class="button button-primary">保存用户</button>
                <button type="button" data-action="clear-user-form" class="button">新增/清空</button>
            </div>
            <p class="error-message"></p>`;
        
        const visibleCategories = targetUser.roles?.includes('admin') ? allData.categories.map(c=>c.id) : (targetUser.permissions?.visibleCategories || []);
        renderUserFormCategories(visibleCategories, isPublicUser || targetUser.roles?.includes('admin'));
        updateDefaultCategoryDropdown(targetUser.defaultCategoryId);
        
        if (isEditing) {
            adminContentPanel.querySelector(`#user-list li[data-username="${targetUser.username}"]`)?.classList.add('selected');
        }
    };
    
    const clearUserForm = () => {
        adminContentPanel.querySelectorAll('#user-list li').forEach(li => li.classList.remove('selected'));
        populateUserForm(null);
    };

    const renderUserFormCategories = (visibleIds = [], isDisabled = false) => {
        const container = adminContentPanel.querySelector('#user-form-categories');
        if (!container) return;
        const categoryMap = new Map(allData.categories.map(c => [c.id, { ...c, children: [] }]));
        const tree = [];
        allData.categories.forEach(c => {
            if(c.parentId && categoryMap.has(c.parentId)) categoryMap.get(c.parentId).children.push(categoryMap.get(c.id));
            else tree.push(categoryMap.get(c.id));
        });
        let checkboxesHTML = '';
        const buildCheckboxes = (nodes, level) => {
            nodes.sort((a,b) => (a.sortOrder||0)-(b.sortOrder||0)).forEach(node => {
                checkboxesHTML += `
                    <div>
                        <input type="checkbox" id="cat-perm-${node.id}" value="${node.id}" ${visibleIds.includes(node.id) ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                        <label for="cat-perm-${node.id}" style="padding-left: ${level * 20}px">${escapeHTML(node.name)}</label>
                    </div>`;
                if (node.children?.length > 0) buildCheckboxes(node.children, level + 1);
            });
        };
        buildCheckboxes(tree, 0);
        container.innerHTML = checkboxesHTML;
    };
    
    const updateDefaultCategoryDropdown = (selectedId) => {
        const form = adminContentPanel.querySelector('#user-form');
        if (!form) return;
        const defaultCatSelect = form.querySelector('#user-form-default-cat');
        const visibleCatIds = Array.from(form.querySelectorAll('#user-form-categories input:checked')).map(cb => cb.value);
        populateCategoryDropdown(defaultCatSelect, allData.categories.filter(cat => visibleCatIds.includes(cat.id)), selectedId, null, {allowNoParent: true});
        if (!visibleCatIds.includes(defaultCatSelect.value) && defaultCatSelect.value !== 'all') {
            defaultCatSelect.value = 'all';
        }
    };

    // --- 5. ACTION HANDLERS ---
    
    const handleSaveData = async (payload, successMessage) => {
        try {
            const result = await apiRequest('data', 'PATCH', payload);
            // CRITICAL: Update local state with the authoritative response from the server
            allData = { ...allData, ...result };
            dataVersion = result.version;
            alert(successMessage);
            renderActiveTab();
        } catch (error) {
            alert(`保存失败: ${error.message}`);
            // Optionally, force a full refresh on failure to get a clean state
            init();
        }
    };
    
    // --- 6. EVENT LISTENERS ---

    // Delegated listener for all actions within the main content panel
    adminContentPanel.addEventListener('click', e => {
        const target = e.target;
        const actionTarget = target.closest('[data-action]');
        if (!actionTarget) return;

        e.preventDefault();
        const action = actionTarget.dataset.action;
        const li = actionTarget.closest('li[data-id]');
        const userLi = actionTarget.closest('li[data-username]');

        // --- Categories Actions ---
        if (action === 'add-new-category') {
            const listEl = adminContentPanel.querySelector('#category-admin-list');
            if (!listEl) return;
            const tempId = `new-${Date.now()}`;
            const maxOrder = allData.categories.reduce((max, cat) => Math.max(max, cat.sortOrder || 0), -1);
            const newLi = document.createElement('li');
            newLi.dataset.id = tempId;
            newLi.innerHTML = `<input type="number" class="cat-order-input" value="${maxOrder + 1}"><div class="cat-name-cell"><input type="text" class="cat-name-input" value="新分类"></div><select class="cat-parent-select"></select><button data-action="delete-category" class="delete-cat-btn button-icon danger"><i class="fas fa-trash-alt"></i></button>`;
            populateCategoryDropdown(newLi.querySelector('.cat-parent-select'), allData.categories);
            listEl.prepend(newLi);
            newLi.querySelector('.cat-name-input').focus();
        }
        if (action === 'save-categories') {
            const items = adminContentPanel.querySelectorAll('#category-admin-list li');
            const newCategories = Array.from(items).map(item => ({
                id: item.dataset.id, name: item.querySelector('.cat-name-input').value.trim(),
                parentId: item.querySelector('.cat-parent-select').value || null,
                sortOrder: parseInt(item.querySelector('.cat-order-input').value) || 0
            }));
            if (newCategories.some(c => !c.name)) return alert('分类名称不能为空！');
            handleSaveData({ categories: newCategories, bookmarks: allData.bookmarks }, '分类已成功保存！');
        }
        if (action === 'delete-category' && li) {
            if (li.dataset.id.startsWith('new-')) return li.remove();
            const catId = li.dataset.id;
            showConfirm('确认删除', `确定删除分类及其所有子分类和书签吗？`, () => {
                let idsToDelete = new Set([catId]);
                let changed = true;
                while (changed) {
                    changed = false;
                    allData.categories.forEach(c => {
                        if (c.parentId && idsToDelete.has(c.parentId) && !idsToDelete.has(c.id)) {
                             idsToDelete.add(c.id);
                             changed = true;
                        }
                    });
                }
                const finalCategories = allData.categories.filter(c => !idsToDelete.has(c.id));
                const finalBookmarks = allData.bookmarks.filter(bm => !idsToDelete.has(bm.categoryId));
                handleSaveData({ categories: finalCategories, bookmarks: finalBookmarks }, '删除成功！');
            });
        }

        // --- Bookmarks Actions ---
        if (action === 'save-bookmarks') {
            const items = adminContentPanel.querySelectorAll('#bookmark-admin-list-container li');
            const updatedBms = new Map(Array.from(items).map(item => [item.dataset.id, {
                name: item.querySelector('.bm-name-input').value.trim(),
                sortOrder: parseInt(item.querySelector('.bm-sort-order').value) || 0,
                categoryId: item.querySelector('.bm-category-select').value
            }]));
            const finalBookmarks = allData.bookmarks.map(bm => updatedBms.has(bm.id) ? {...bm, ...updatedBms.get(bm.id)} : bm);
            if (finalBookmarks.some(bm => !bm.name)) return alert('书签名称不能为空！');
            handleSaveData({ bookmarks: finalBookmarks, categories: allData.categories }, '书签已成功保存！');
        }
        if (action === 'add-new-bookmark') {
            if (allData.categories.length === 0) return alert('请先创建分类!');
            const bookmark = { id: `new-${Date.now()}`, name: '', url: '', categoryId: allData.categories[0].id };
            handleEditBookmark(bookmark);
        }
        if (action === 'edit-bookmark' && li) {
            const bookmark = allData.bookmarks.find(bm => bm.id === li.dataset.id);
            if (bookmark) handleEditBookmark(bookmark);
        }
        if (action === 'delete-bookmark' && li) {
            const bookmark = allData.bookmarks.find(bm => bm.id === li.dataset.id);
             showConfirm('确认删除', `确定删除书签 "${bookmark.name}"?`, () => {
                const finalBookmarks = allData.bookmarks.filter(bm => bm.id !== bookmark.id);
                handleSaveData({ bookmarks: finalBookmarks, categories: allData.categories }, '书签删除成功！');
            });
        }
        
        // --- Users Actions ---
        if(action === 'clear-user-form') clearUserForm();
        if(action === 'delete-user' && userLi) {
             const username = userLi.dataset.username;
             showConfirm('确认删除', `确认删除用户 "${username}"?`, async () => {
                try {
                    await apiRequest(`users/${username}`, 'DELETE');
                    alert('用户删除成功!');
                    init(); // Re-initialize to get fresh user data
                } catch(e) { alert(`删除失败: ${e.message}`); }
            });
        }
    });

    // Delegated listener for user selection
    adminContentPanel.addEventListener('click', e => {
        const userLi = e.target.closest('#user-list li[data-username]');
        if (userLi && !e.target.closest('[data-action]')) {
            adminContentPanel.querySelectorAll('#user-list li').forEach(li => li.classList.remove('selected'));
            userLi.classList.add('selected');
            const user = allData.users.find(u => u.username === userLi.dataset.username);
            if (user) populateUserForm(user);
        }
    });

    // --- 7. INITIALIZATION ---
    async function init() {
        try {
            const token = localStorage.getItem('jwt_token');
            if (!token || !parseJwtPayload(token)?.roles?.includes('admin')) {
                throw new Error("无权限或未登录");
            }
            const data = await apiRequest('data');
            allData = data;
            dataVersion = data.version;

            document.body.classList.remove('is-loading');
            adminPageContainer.style.display = 'flex';
            
            renderActiveTab();
        } catch (error) {
            console.error("初始化失败:", error);
            window.location.href = 'login.html';
        }
    }

    // --- FINAL SETUP ---
    // These listeners are outside the main delegated one
    adminPanelNav.addEventListener('click', e => {
        const link = e.target.closest('.admin-tab-link');
        if (!link || link.classList.contains('active')) return;
        e.preventDefault();
        adminPanelNav.querySelector('.active')?.classList.remove('active');
        link.classList.add('active');
        renderActiveTab();
    });

    modalBackdrop.addEventListener('click', e => {
        if (e.target.dataset.action === 'close-modal' || e.target === modalBackdrop) {
            hideAllModals();
        }
    });
    
    document.getElementById('confirm-btn-yes').addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        hideAllModals();
    });

    init();
});
