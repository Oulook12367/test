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

    // --- Tab 1: Category Management ---
    const renderCategoryAdminTab = (container) => {
        container.innerHTML = `<p class="admin-panel-tip">通过修改表单来调整分类，完成后请点击下方的“保存”按钮。</p> 
            <div class="category-admin-header"><span>排序</span><span>分类名称</span><span>上级分类</span><span>操作</span></div> 
            <ul id="category-admin-list"></ul> 
            <div class="admin-panel-actions"> 
                <button id="save-categories-btn" class="button button-primary"><i class="fas fa-save"></i> 保存全部分类</button> 
                <button id="add-new-category-btn" class="button"><i class="fas fa-plus"></i> 添加新分类</button> 
            </div>`;
        
        const listEl = container.querySelector('#category-admin-list');
        
        const categoryMap = new Map(allCategories.map(cat => [cat.id, { ...cat, children: [] }]));
        const tree = [];
        [...allCategories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name)).forEach(cat => {
            if (cat.parentId && categoryMap.has(cat.parentId)) {
                categoryMap.get(cat.parentId).children.push(categoryMap.get(cat.id));
            } else {
                tree.push(categoryMap.get(cat.id));
            }
        });
        
        const buildList = (nodes, level) => {
            nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name)).forEach(cat => {
                const li = document.createElement('li');
                li.dataset.id = cat.id;
                li.innerHTML = `<input type="number" class="cat-order-input" value="${cat.sortOrder || 0}"><div class="cat-name-cell" style="padding-left: ${level * 25}px;"><input type="text" class="cat-name-input" value="${escapeHTML(cat.name)}"></div><select class="cat-parent-select"></select><button class="delete-cat-btn button-icon danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
                const parentSelect = li.querySelector('.cat-parent-select');
                populateCategoryDropdown(parentSelect, allCategories, cat.parentId, cat.id, { allowNoParent: true });
                listEl.appendChild(li);
                if (cat.children.length > 0) buildList(cat.children, level + 1);
            });
        };
        buildList(tree, 0);
        
        // [关键修正] 使用事件委托来处理所有列表项的点击事件
        listEl.addEventListener('click', (event) => {
            const deleteButton = event.target.closest('.delete-cat-btn');
            if (deleteButton) {
                event.stopPropagation(); // 阻止事件冒泡
                const listItem = deleteButton.closest('li');
                if (listItem) {
                    const catId = listItem.dataset.id;
                    const catNameInput = listItem.querySelector('.cat-name-input');
                    const catName = catNameInput ? catNameInput.value : '';
                    handleDeleteCategory(catId, catName);
                }
            }
        });

        container.querySelector('#add-new-category-btn').addEventListener('click', handleAddNewCategory);
        container.querySelector('#save-categories-btn').addEventListener('click', handleSaveCategories);
    };

    const handleAddNewCategory = () => { /* ... (no changes needed) ... */ };
    const handleSaveCategories = async () => { /* ... (no changes needed) ... */ };
    const handleDeleteCategory = (catIdToDelete, catName) => { /* ... (no changes needed) ... */ };

    // --- Tab 2: User Management ---
    const renderUserAdminTab = (container) => { /* ... (no changes needed, but will use same delegation pattern) ... */ 
        container.innerHTML = `<div id="user-management-container"> ... </div>`; // (content omitted for brevity)

        const userList = container.querySelector('#user-list');
        // ... (render list items logic) ...
        allUsers.forEach(user => {
            // ... (li creation)
        });

        // Event Delegation for User List
        userList.addEventListener('click', (e) => {
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
                return; // Stop further processing
            }

            const li = e.target.closest('li[data-username]');
            if (li) {
                const user = allUsers.find(u => u.username === li.dataset.username);
                if (user) populateUserForm(user);
            }
        });

        // ... (rest of the function) ...
    };

    // ... (All other user management helper functions remain the same) ...

    // --- Tab 3: Bookmark Management ---
    const renderBookmarkAdminTab = (container) => { /* ... (no changes needed, but will use same delegation pattern) ... */ 
        container.innerHTML = `<p class="admin-panel-tip">...</p> ...`; // (content omitted for brevity)

        const listEl = container.querySelector('#bookmark-admin-list-container ul');
        // ... (render list items logic) ...
        bookmarksToDisplay.forEach(bm => {
            // ... (li creation)
        });

        // Event Delegation for Bookmark List
        listEl.addEventListener('click', (event) => {
            const editButton = event.target.closest('.edit-bm-btn');
            const deleteButton = event.target.closest('.delete-bm-btn');
            const listItem = event.target.closest('li[data-id]');

            if (!listItem) return;

            const bookmarkId = listItem.dataset.id;
            const bookmark = allBookmarks.find(bm => bm.id === bookmarkId);
            if (!bookmark) return;

            if (editButton) {
                event.stopPropagation();
                handleEditBookmark(bookmark);
            } else if (deleteButton) {
                event.stopPropagation();
                handleDeleteBookmark(bookmark);
            }
        });
        
        // ... (rest of the function) ...
    };

    // ... (All other bookmark and system helper functions remain the same) ...

    // --- Final Initialization ---
    initializePage();
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', hideAllModals));
    if (document.getElementById('confirm-btn-no')) {
      document.getElementById('confirm-btn-no').onclick = hideAllModals;
    }
});
