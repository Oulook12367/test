document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const loginContainer = document.getElementById('login-container');
    const appLayout = document.getElementById('app-layout');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const themeToggleButton = document.getElementById('theme-toggle');
    const localSearchInput = document.getElementById('local-search');
    const searchEngineSelect = document.getElementById('search-engine');
    const bookmarksGrid = document.getElementById('bookmarks-grid');
    const categoryNav = document.getElementById('category-nav');
    const staticNav = document.getElementById('static-nav');
    const logoutButton = document.getElementById('logout-btn');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const addBookmarkBtn = document.getElementById('add-bookmark-btn');
    const userManagementBtn = document.getElementById('user-management-btn');
    const manageCategoriesBtn = document.getElementById('manage-categories-btn');
    const importBookmarksBtn = document.getElementById('import-bookmarks-btn');
    const bookmarkModal = document.getElementById('bookmark-modal');
    const userManagementModal = document.getElementById('user-management-modal');
    const categoryManagementModal = document.getElementById('category-management-modal');
    const confirmModal = document.getElementById('confirm-modal');
    const bookmarkForm = document.getElementById('bookmark-form');
    const userForm = document.getElementById('user-form');
    const addCategoryForm = document.getElementById('add-category-form');
    const bookmarkModalTitle = document.getElementById('bookmark-modal-title');
    const userList = document.getElementById('user-list');
    const userFormTitle = document.getElementById('user-form-title');
    const userFormClearBtn = document.getElementById('user-form-clear-btn');
    const userFormRoles = document.getElementById('user-form-roles');
    const userFormCategories = document.getElementById('user-form-categories');
    const categoryManagerList = document.getElementById('category-manager-list');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmText = document.getElementById('confirm-text');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');
    const bulkDeleteCatBtn = document.getElementById('bulk-delete-cat-btn');
    const manageMenu = document.getElementById('manage-menu');
    const importFileInput = document.getElementById('import-file-input');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle');

    // --- State ---
    let allBookmarks = [], allCategories = [], allUsers = [], currentUser = null, isGuestView = false;
    let categorySortable;
    const savedCollapsedState = localStorage.getItem('collapsedCategories');
    let collapsedCategories = savedCollapsedState ? new Set(JSON.parse(savedCollapsedState)) : new Set();
    
    // --- Helpers ---
    const escapeHTML = (str) => {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, (match) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[match]));
    };

    const getRecursiveCategoryIds = (initialIds) => {
        const fullIdSet = new Set(initialIds);
        const queue = [...initialIds];
        while (queue.length > 0) {
            const parentId = queue.shift();
            const children = allCategories.filter(c => c.parentId === parentId);
            for (const child of children) {
                if (!fullIdSet.has(child.id)) {
                    fullIdSet.add(child.id);
                    queue.push(child.id);
                }
            }
        }
        return fullIdSet;
    };

    // --- API Helper ---
    const apiRequest = async (endpoint, method = 'GET', body = null) => {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('jwt_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const options = { method, headers, cache: 'no-cache' };
        if (body) options.body = JSON.stringify(body);
        
        const response = await fetch(`/api/${endpoint}`, options);
        if (response.status === 204) return null;
        
        let result;
        try {
            result = await response.json();
        } catch (e) {
            throw new Error(`从服务器返回的响应无效`);
        }
        if (!response.ok) {
            throw new Error(result.error || `请求失败，状态码: ${response.status}`);
        }
        return result;
    };

    const persistOrder = async () => {
        try {
            await apiRequest('data', 'PUT', { categories: allCategories, bookmarks: allBookmarks });
        } catch (error) {
            alert('顺序保存失败: ' + error.message);
            await loadData();
        }
    };

    // --- Theme & UI Flow ---
    const applyTheme = (theme) => {
        document.body.className = theme;
        themeToggleButton.innerHTML = theme === 'dark-theme' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
        localStorage.setItem('theme', theme);
    };

    const applySidebarState = (isCollapsed) => {
        appLayout.classList.toggle('sidebar-collapsed', isCollapsed);
        localStorage.setItem('sidebarCollapsed', isCollapsed);
        sidebarToggleBtn.innerHTML = isCollapsed ? '<i class="fas fa-angle-double-right"></i>' : '<i class="fas fa-angle-double-left"></i>';
    };

    const showLoginPage = () => {
        appLayout.style.display = 'none';
        loginContainer.style.display = 'flex';
    };
    
    const logoutAndReset = () => {
        localStorage.removeItem('jwt_token');
        allBookmarks = []; allCategories = []; allUsers = []; currentUser = null; isGuestView = false;
        showLoginPage();
    };

    const checkLoginStatus = async () => {
        try {
            await loadData();
            loginContainer.style.display = 'none';
            appLayout.style.display = 'flex';
        } catch (error) {
            console.error("Data loading failed:", error.message);
            showLoginPage();
        } finally {
            document.body.classList.remove('is-loading');
        }
    };

    // --- Data Loading & Rendering ---
    const loadData = async () => {
        const data = await apiRequest('data');
        const token = localStorage.getItem('jwt_token');
        if (data.isPublic) {
            isGuestView = true;
            currentUser = null;
        } else if (token) {
            isGuestView = false;
            const tokenPayload = JSON.parse(atob(token.split('.')[1]));
            currentUser = data.users.find(u => u.username === tokenPayload.sub);
            if (!currentUser) throw new Error("无法验证当前用户身份，请重新登录。");
        } else {
            throw new Error("需要认证。");
        }
        allCategories = data.categories || [];
        allBookmarks = data.bookmarks || [];
        allUsers = data.users || [];
        renderUI();
    };
    
    const renderUI = () => {
        updateButtonVisibility();
        renderCategories();
        renderBookmarks(document.querySelector('.sidebar .active')?.dataset.id || 'all', localSearchInput.value);
        initSortables();
        if (categoryManagementModal.style.display === 'flex') renderCategoryManagerList();
        if (userManagementModal.style.display === 'flex') renderUserManagementPanel();
    };

    const updateButtonVisibility = () => {
        const canEdit = !isGuestView && currentUser?.permissions?.canEditBookmarks;
        const canManage = !isGuestView && (currentUser?.permissions?.canEditCategories || currentUser?.permissions?.canEditUsers);
        addBookmarkBtn.style.display = canEdit ? 'flex' : 'none';
        manageMenu.style.display = canManage ? 'inline-block' : 'none';
        if (canManage) {
            manageCategoriesBtn.style.display = currentUser.permissions.canEditCategories ? 'block' : 'none';
            userManagementBtn.style.display = currentUser.permissions.canEditUsers ? 'block' : 'none';
            importBookmarksBtn.style.display = currentUser.permissions.canEditBookmarks ? 'block' : 'none';
        }
        logoutButton.innerHTML = isGuestView ? '<i class="fas fa-key"></i>' : '<i class="fas fa-sign-out-alt"></i>';
        logoutButton.title = isGuestView ? '登录' : '退出登录';
    };

    const renderCategories = () => {
        const activeId = document.querySelector('.sidebar .active')?.dataset.id || 'all';
        categoryNav.innerHTML = '';
        staticNav.innerHTML = '';
        
        const allLi = document.createElement('li');
        allLi.dataset.id = 'all';
        allLi.innerHTML = `<i class="fas fa-inbox fa-fw"></i><span>全部书签</span>`;
        staticNav.appendChild(allLi);

        const categoriesWithChildren = new Set(allCategories.map(cat => cat.parentId).filter(id => id !== null));
        
        const buildTree = (parentId) => {
            allCategories.filter(cat => cat.parentId === parentId).forEach(cat => {
                const li = document.createElement('li');
                li.dataset.id = cat.id;
                
                const isParent = categoriesWithChildren.has(cat.id);
                const isCollapsed = collapsedCategories.has(cat.id);
                const iconClass = isCollapsed ? 'fa-caret-right' : 'fa-caret-down';
                
                li.innerHTML = `
                    <span class="category-toggle-placeholder">
                        ${isParent ? `<i class="fas ${iconClass} category-toggle"></i>` : ''}
                    </span>
                    <i class="fas fa-folder fa-fw"></i>
                    <span>${escapeHTML(cat.name)}</span>
                `;
                
                const level = allCategories.filter(c=>c.id === cat.id)[0].parentId ? allCategories.findIndex(c=>c.id === cat.parentId) > -1 ? 2: 1 : 1;
                li.style.paddingLeft = `${level * 15}px`;

                li.dataset.parentId = cat.parentId || 'root';

                categoryNav.appendChild(li);

                if (isParent && !isCollapsed) {
                    buildTree(cat.id);
                }
            });
        };
        buildTree(null);

        const newActiveLi = document.querySelector(`.sidebar li[data-id="${activeId}"]`) || staticNav.querySelector(`li[data-id="all"]`);
        if(newActiveLi) newActiveLi.classList.add('active');
    };
    
    const renderBookmarks = (categoryId = 'all', searchTerm = '') => {
        bookmarksGrid.innerHTML = '';
        let categoryIdsToDisplay = new Set();
        if (categoryId === 'all') {
            allBookmarks.forEach(bm => categoryIdsToDisplay.add(bm.categoryId));
        } else {
            categoryIdsToDisplay = getRecursiveCategoryIds([categoryId]);
        }

        let filteredBookmarks = allBookmarks.filter(bm => categoryIdsToDisplay.has(bm.categoryId));

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filteredBookmarks = filteredBookmarks.filter(bm => bm.name.toLowerCase().includes(lower) || bm.url.toLowerCase().includes(lower));
        }

        if(filteredBookmarks.length === 0){
            bookmarksGrid.innerHTML = '<p class="empty-message">这里什么都没有...</p>';
            return;
        }

        filteredBookmarks.forEach(bm => {
            const card = document.createElement('a');
            card.href = bm.url;
            card.className = 'bookmark-card';
            card.target = '_blank';
            card.rel = 'noopener noreferrer';
            card.dataset.id = bm.id;

            const defaultIcon = `https://www.google.com/s2/favicons?domain=${new URL(bm.url).hostname}`;
            card.innerHTML = `
                <h3>
                    <img src="${bm.icon || defaultIcon}" alt="" onerror="this.onerror=null;this.src='${defaultIcon}'">
                    ${escapeHTML(bm.name)}
                </h3>
                <p>${escapeHTML(bm.description || '')}</p>
            `;

            if (!isGuestView && currentUser?.permissions?.canEditBookmarks) {
                const actions = document.createElement('div');
                actions.className = 'bookmark-card-actions';
                actions.innerHTML = `
                    <button class="edit-btn" title="编辑"><i class="fas fa-pencil-alt"></i></button>
                    <button class="delete-btn" title="删除"><i class="fas fa-trash-alt"></i></button>
                `;
                actions.querySelector('.edit-btn').addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation(); handleEditBookmark(bm);
                });
                actions.querySelector('.delete-btn').addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation(); handleDeleteBookmark(bm);
                });
                card.appendChild(actions);
            }
            bookmarksGrid.appendChild(card);
        });
    };
    
    // --- Event Listeners ---
    themeToggleButton.addEventListener('click', () => applyTheme(document.body.classList.contains('light-theme') ? 'dark-theme' : 'light-theme'));
    sidebarToggleBtn.addEventListener('click', () => applySidebarState(!appLayout.classList.contains('sidebar-collapsed')));
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        try {
            const result = await apiRequest('login', 'POST', {
                username: document.getElementById('username').value,
                password: document.getElementById('password').value,
            });
            localStorage.setItem('jwt_token', result.token);
            await checkLoginStatus();
        } catch (error) {
            loginError.textContent = error.message;
        }
    });

    logoutButton.addEventListener('click', () => {
        isGuestView ? showLoginPage() : logoutAndReset();
    });

    localSearchInput.addEventListener('keyup', (e) => {
        renderBookmarks(document.querySelector('.sidebar .active')?.dataset.id || 'all', e.target.value);
        if (e.key === 'Enter' && e.target.value.trim() !== '') {
            window.open(searchEngineSelect.value + encodeURIComponent(e.target.value.trim()), '_blank');
        }
    });

    document.querySelector('.sidebar').addEventListener('click', (e) => {
        const clickedLi = e.target.closest('li');
        if (!clickedLi || !clickedLi.closest('.category-nav') || clickedLi.classList.contains('sortable-ghost')) return;

        if (e.target.classList.contains('category-toggle')) {
            e.stopPropagation();
            const catId = clickedLi.dataset.id;
            collapsedCategories.has(catId) ? collapsedCategories.delete(catId) : collapsedCategories.add(catId);
            localStorage.setItem('collapsedCategories', JSON.stringify(Array.from(collapsedCategories)));
            renderCategories();
        } else {
            document.querySelectorAll('.sidebar .category-nav li').forEach(li => li.classList.remove('active'));
            clickedLi.classList.add('active');
            renderBookmarks(clickedLi.dataset.id, localSearchInput.value);
        }
    });

    manageMenu.addEventListener('click', (e) => {
        if(e.target.closest('.dropdown-toggle')) manageMenu.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!manageMenu.contains(e.target)) manageMenu.classList.remove('open');
    });
    
    // --- Modals ---
    const showModal = (modal) => { modalBackdrop.style.display = 'flex'; modal.style.display = 'flex'; };
    const hideAllModals = () => { modalBackdrop.style.display = 'none'; document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); };
    modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) hideAllModals(); });
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', hideAllModals));
    
    const showConfirm = (title, text, onConfirm) => {
        confirmTitle.textContent = title;
        confirmText.textContent = text;
        showModal(confirmModal);
        confirmBtnYes.onclick = () => { hideAllModals(); onConfirm(); };
    };
    document.getElementById('confirm-btn-no').onclick = hideAllModals;

    const populateCategoryDropdown = (selectElement, selectedId = null, ignoreId = null) => {
        selectElement.innerHTML = '<option value="">-- 顶级分类 --</option>'; // Add root option
        const buildOptions = (parentId, level) => {
            allCategories
                .filter(cat => cat.parentId === parentId && cat.id !== ignoreId)
                .forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat.id;
                    option.textContent = `${'—'.repeat(level)} ${cat.name}`;
                    if (cat.id === selectedId) option.selected = true;
                    selectElement.appendChild(option);
                    buildOptions(cat.id, level + 1);
                });
        };
        buildOptions(null, 0);
    };

    // All handler functions (handleDeleteBookmark, bookmarkForm submit, etc.) from previous steps go here...
    // These functions use the Optimistic Update pattern.
    const handleDeleteBookmark = (bookmark) => {
        showConfirm('确认删除', `您确定要删除书签 "${escapeHTML(bookmark.name)}" 吗？`, async () => {
            const originalBookmarks = [...allBookmarks];
            allBookmarks = allBookmarks.filter(bm => bm.id !== bookmark.id);
            renderUI();
            try {
                await apiRequest(`bookmarks/${bookmark.id}`, 'DELETE');
            } catch (error) {
                alert(`删除失败: ${error.message}`);
                allBookmarks = originalBookmarks;
                renderUI();
            }
        });
    };

    const handleEditBookmark = (bookmark) => {
        bookmarkModalTitle.textContent = '编辑书签';
        bookmarkForm.reset();
        bookmarkForm.querySelector('.modal-error-message').textContent = '';
        bookmarkForm.querySelector('#bm-id').value = bookmark.id;
        bookmarkForm.querySelector('#bm-name').value = bookmark.name;
        bookmarkForm.querySelector('#bm-url').value = bookmark.url;
        bookmarkForm.querySelector('#bm-desc').value = bookmark.description || '';
        bookmarkForm.querySelector('#bm-icon').value = bookmark.icon || '';
        populateCategoryDropdown(bookmarkForm.querySelector('#bm-category'), bookmark.categoryId);
        showModal(bookmarkModal);
    };

    addBookmarkBtn.addEventListener('click', () => {
        bookmarkModalTitle.textContent = '添加新书签';
        bookmarkForm.reset();
        bookmarkForm.querySelector('.modal-error-message').textContent = '';
        bookmarkForm.querySelector('#bm-id').value = '';
        const categorySelect = bookmarkForm.querySelector('#bm-category');
        populateCategoryDropdown(categorySelect, document.querySelector('.sidebar .active')?.dataset.id);
        if (allCategories.length === 0) {
            alert('请先创建分类。'); return;
        }
        showModal(bookmarkModal);
    });

    bookmarkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = bookmarkForm.querySelector('#bm-id').value;
        const errorEl = bookmarkForm.querySelector('.modal-error-message');
        errorEl.textContent = '';
        const data = {
            name: bookmarkForm.querySelector('#bm-name').value,
            url: bookmarkForm.querySelector('#bm-url').value,
            description: bookmarkForm.querySelector('#bm-desc').value,
            icon: bookmarkForm.querySelector('#bm-icon').value,
            categoryId: bookmarkForm.querySelector('#bm-category').value,
        };
        if(!data.categoryId){ errorEl.textContent = '必须选择一个分类。'; return;}
        hideAllModals();
        if (id) {
            const originalBookmarks = JSON.parse(JSON.stringify(allBookmarks));
            const bookmarkIndex = allBookmarks.findIndex(bm => bm.id === id);
            if (bookmarkIndex > -1) {
                allBookmarks[bookmarkIndex] = { ...allBookmarks[bookmarkIndex], ...data };
                renderUI();
            }
            try {
                await apiRequest(`bookmarks/${id}`, 'PUT', data);
            } catch (error) {
                errorEl.textContent = error.message;
                allBookmarks = originalBookmarks; renderUI(); showModal(bookmarkModal);
            }
        } else {
            const tempId = `temp-${Date.now()}`;
            const newBookmark = { ...data, id: tempId };
            allBookmarks.push(newBookmark);
            renderUI();
            try {
                const savedBookmark = await apiRequest('bookmarks', 'POST', data);
                const tempIndex = allBookmarks.findIndex(bm => bm.id === tempId);
                if (tempIndex > -1) allBookmarks[tempIndex] = savedBookmark;
            } catch (error) {
                errorEl.textContent = error.message;
                allBookmarks = allBookmarks.filter(bm => bm.id !== tempId); renderUI(); showModal(bookmarkModal);
            }
        }
    });

    // --- Category Management ---
    manageCategoriesBtn.addEventListener('click', () => {
        document.getElementById('category-error-message').textContent = '';
        renderCategoryManagerList();
        showModal(categoryManagementModal);
    });

    const renderCategoryManagerList = () => {
        categoryManagerList.innerHTML = '';
        const buildList = (parentId, level) => {
            allCategories.filter(cat => cat.parentId === parentId).forEach(cat => {
                const li = document.createElement('li');
                li.dataset.id = cat.id;
                li.style.paddingLeft = `${level * 20}px`;
                li.innerHTML = `
                    <input type="checkbox" id="del-cat-${cat.id}" data-id="${cat.id}">
                    <span class="category-name">${escapeHTML(cat.name)}</span>
                    <button class="edit-cat-btn" title="编辑名称"><i class="fas fa-pencil-alt"></i></button>
                `;
                li.querySelector('.edit-cat-btn').onclick = () => handleEditCategory(li, cat);
                categoryManagerList.appendChild(li);
                buildList(cat.id, level + 1);
            });
        };
        buildList(null, 0);
    };

    const handleEditCategory = (liElement, category) => {
        const nameSpan = liElement.querySelector('.category-name');
        const editBtn = liElement.querySelector('.edit-cat-btn');
        if(!nameSpan || !editBtn || liElement.querySelector('.inline-edit-input')) return;
        const originalName = category.name;
        const input = document.createElement('input');
        input.type = 'text'; input.value = originalName; input.className = 'inline-edit-input';
        nameSpan.style.display = 'none'; editBtn.style.display = 'none';
        liElement.insertBefore(input, editBtn);
        input.focus(); input.select();
        const finishEditing = async () => {
            const newName = input.value.trim();
            nameSpan.style.display = ''; editBtn.style.display = ''; input.remove();
            if (newName && newName !== originalName) {
                const errorEl = document.getElementById('category-error-message');
                errorEl.textContent = '';
                const originalCategories = JSON.parse(JSON.stringify(allCategories));
                const categoryToUpdate = allCategories.find(c => c.id === category.id);
                if(categoryToUpdate) { categoryToUpdate.name = newName; renderUI(); }
                try {
                    await apiRequest(`categories/${category.id}`, 'PUT', { name: newName });
                } catch (error) {
                    errorEl.textContent = error.message; allCategories = originalCategories; renderUI();
                }
            }
        };
        input.addEventListener('blur', finishEditing);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finishEditing(); }
            else if (e.key === 'Escape') { nameSpan.style.display = ''; editBtn.style.display = ''; input.remove(); }
        });
    };

    bulkDeleteCatBtn.addEventListener('click', () => {
        const idsToDelete = Array.from(categoryManagerList.querySelectorAll('input:checked')).map(cb => cb.dataset.id);
        if (idsToDelete.length === 0) return alert('请先选择要删除的分类。');
        showConfirm('确认强制删除', `确定要删除选中的 ${idsToDelete.length} 个分类及其所有子分类吗？`, async () => {
            const errorEl = document.getElementById('category-error-message');
            errorEl.textContent = '';
            const originalCategories = [...allCategories]; const originalBookmarks = [...allBookmarks];
            const allIdsToDeleteSet = getRecursiveCategoryIds(idsToDelete);
            allCategories = allCategories.filter(c => !allIdsToDeleteSet.has(c.id));
            allBookmarks = allBookmarks.filter(bm => !allIdsToDeleteSet.has(bm.categoryId));
            renderUI(); hideAllModals();
            try {
                await apiRequest('categories', 'DELETE', { ids: idsToDelete });
            } catch (error) {
                alert(`删除失败: ${error.message}`);
                allCategories = originalCategories; allBookmarks = originalBookmarks; renderUI();
            }
        });
    });

    addCategoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('new-category-name');
        const name = input.value.trim();
        const errorEl = document.getElementById('category-error-message');
        errorEl.textContent = '';
        if(!name) { errorEl.textContent = '分类名称不能为空'; return; }
        input.value = '';
        const tempId = `temp-cat-${Date.now()}`;
        const newCategory = { id: tempId, name, parentId: null };
        allCategories.push(newCategory);
        renderUI();
        try {
            const savedCategory = await apiRequest('categories', 'POST', { name });
            const tempCat = allCategories.find(c => c.id === tempId);
            if(tempCat) tempCat.id = savedCategory.id;
        } catch (error) {
            errorEl.textContent = error.message;
            allCategories = allCategories.filter(c => c.id !== tempId); renderUI();
        }
    });

    // --- User Management ---
  userManagementBtn.addEventListener('click', () => {
    // 在显示 Modal 前，先准备好 UI
    const userListContainer = document.querySelector('.user-list-container');
    if (!userListContainer.querySelector('.user-list-header')) {
        const header = document.createElement('div');
        header.className = 'user-list-header';
        header.innerHTML = `
            <span class="user-col-username">用户名</span>
            <span class="user-col-roles">角色</span>
            <span class="user-col-actions" style="width: 40px;"></span>
        `;
        userListContainer.prepend(header);
    }
    renderUserManagementPanel();
    showModal(userManagementModal);
});

    const renderUserManagementPanel = () => {
    userList.innerHTML = '';
    allUsers.forEach(user => {
        const li = document.createElement('li');
        li.dataset.username = user.username;
        li.classList.add('user-list-item'); // 添加一个类便于设置样式

        // 创建用户名列
        const usernameCol = document.createElement('span');
        usernameCol.className = 'user-col-username';
        usernameCol.textContent = user.username;

        // 创建角色列
        const rolesCol = document.createElement('span');
        rolesCol.className = 'user-col-roles';
        rolesCol.textContent = user.roles.join(', ') || 'N/A'; // N/A for users with no roles

        // 创建操作列
        const actionsCol = document.createElement('div');
        actionsCol.className = 'user-col-actions';

        // 只有非当前用户才显示删除按钮
        if (user.username !== currentUser?.username) {
            const deleteBtn = document.createElement('button');
            deleteBtn.title = '删除用户';
            deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                showConfirm('确认删除用户', `确定删除用户 "${escapeHTML(user.username)}"?`, async () => {
                    try {
                        await apiRequest(`users/${user.username}`, 'DELETE');
                        await loadData(); // 重新加载数据以刷新列表
                    } catch (error) { alert(error.message); }
                });
            };
            actionsCol.appendChild(deleteBtn);
        }

        // 将所有列添加到 li 中
        li.append(usernameCol, rolesCol, actionsCol);

        li.onclick = () => populateUserForm(user);
        userList.appendChild(li);
    });
    clearUserForm();
};

    const clearUserForm = () => {
        userList.querySelector('.selected')?.classList.remove('selected');
        userForm.reset();
        userFormTitle.textContent = '添加新用户';
        userForm.querySelector('.modal-error-message').textContent = '';
        const usernameInput = userForm.querySelector('#user-form-username');
        const passwordInput = userForm.querySelector('#user-form-password');
        usernameInput.value = '';
        usernameInput.readOnly = false;
        passwordInput.disabled = false;
        passwordInput.placeholder = "必填";
        userForm.querySelector('#user-form-username-hidden').value = '';
        renderUserFormRoles();
        renderUserFormCategories();
    };

/**
 * @description 使用指定用户的数据填充用户编辑表单
 * @param {object} user - 要编辑的用户对象
 */
const populateUserForm = (user) => {
    // --- 表单和列表UI状态重置 ---
    userList.querySelectorAll('li').forEach(li => li.classList.remove('selected'));
    userList.querySelector(`li[data-username="${user.username}"]`).classList.add('selected');
    userForm.reset();
    userFormTitle.textContent = `编辑用户: ${user.username}`;
    userForm.querySelector('.modal-error-message').textContent = '';
    
    // --- 填充基础信息（用户名、密码） ---
    const usernameInput = userForm.querySelector('#user-form-username');
    const passwordInput = userForm.querySelector('#user-form-password');
    usernameInput.value = user.username;
    usernameInput.readOnly = true;
    userForm.querySelector('#user-form-username-hidden').value = user.username;

    // --- 【核心修改】判断用户角色并设置UI状态 ---
    const isPublicUser = user.username === 'public';
    const isAdmin = user.roles.includes('admin');

    const adminMessageEl = document.getElementById('admin-override-message');
    const categoriesContainerEl = document.getElementById('user-form-categories');

    // 1. 根据是否为管理员，决定是否显示“管理员权限覆盖”提示，并调整分类区域样式
    adminMessageEl.style.display = isAdmin ? 'block' : 'none';
    categoriesContainerEl.style.opacity = isAdmin ? 0.6 : 1;

    // 2. 处理密码框状态
    if (isPublicUser) {
        passwordInput.disabled = true;
        passwordInput.placeholder = '虚拟账户，无法设置密码';
    } else {
        passwordInput.disabled = false;
        passwordInput.placeholder = "留空则不修改";
    }
    
    // 3. 渲染角色勾选框（仅对 'public' 用户禁用）
    renderUserFormRoles(user.roles, isPublicUser);

    // 4. 渲染可见分类勾选框（对 'admin' 用户禁用）
    renderUserFormCategories(user.permissions.visibleCategories, isAdmin);
};

    const renderUserFormRoles = (activeRoles = [], isDisabled = false) => {
        userFormRoles.innerHTML = '';
        ['admin', 'editor', 'viewer'].forEach(role => {
            const id = `role-${role}`;
            const div = document.createElement('div');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = id;
            input.value = role;
            if (activeRoles.includes(role)) input.checked = true;
            input.disabled = isDisabled;
            const label = document.createElement('label');
            label.htmlFor = id;
            label.textContent = role.charAt(0).toUpperCase() + role.slice(1);
            div.append(input, label);
            userFormRoles.appendChild(div);
        });
    };

    /**
 * @description 渲染用户表单中的“可见分类”勾选列表
 * @param {string[]} [visibleIds=[]] - 该用户可见的分类ID数组
 * @param {boolean} [isDisabled=false] - 是否禁用所有勾选框（用于管理员账户）
 */
const renderUserFormCategories = (visibleIds = [], isDisabled = false) => {
    userFormCategories.innerHTML = '';
    allCategories.forEach(cat => {
        const id = `cat-perm-${cat.id}`;
        const div = document.createElement('div');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = id;
        input.value = cat.id;
        if (visibleIds.includes(cat.id)) input.checked = true;
        
        // 【核心修改】根据传入的参数禁用勾选框
        input.disabled = isDisabled; 
        
        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = cat.name;

        // 如果禁用，同时改变标签的鼠标样式，提升用户体验
        if (isDisabled) {
            label.style.cursor = 'not-allowed';
        }

        div.append(input, label);
        userFormCategories.appendChild(div);
    });
};
    
    userFormClearBtn.addEventListener('click', clearUserForm);

    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const hiddenUsername = userForm.querySelector('#user-form-username-hidden').value;
        const isEditing = !!hiddenUsername;
        const username = userForm.querySelector('#user-form-username').value;
        const password = userForm.querySelector('#user-form-password').value;
        const errorEl = userForm.querySelector('.modal-error-message');
        errorEl.textContent = '';
        if (!isEditing && !password) {
            errorEl.textContent = '新用户必须设置密码';
            return;
        }
        const selectedRoles = Array.from(userFormRoles.querySelectorAll('input:checked')).map(cb => cb.value);
        const visibleCategories = Array.from(userFormCategories.querySelectorAll('input:checked')).map(cb => cb.value);
        const userData = {
            roles: selectedRoles,
            permissions: { visibleCategories }
        };
        if (password) userData.password = password;
        const endpoint = isEditing ? `users/${hiddenUsername}` : 'users';
        const method = isEditing ? 'PUT' : 'POST';
        if (!isEditing) userData.username = username;
        try {
            const updatedUser = await apiRequest(endpoint, method, userData);
            await loadData();
            if (isEditing) {
                const userToPopulate = allUsers.find(u => u.username === updatedUser.username);
                if (userToPopulate) populateUserForm(userToPopulate);
            } else {
                clearUserForm();
            }
        } catch(error) {
            errorEl.textContent = error.message;
        }
    });

   
// --- Bookmark Import Logic ---
    importBookmarksBtn.addEventListener('click', () => {
        if (!currentUser?.permissions?.canEditBookmarks) {
            alert('权限不足，无法导入书签。');
            return;
        }
        importFileInput.click();
    });

    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const content = event.target.result;
                await parseAndImport(content);
                alert('书签导入成功！');
            } catch (error) {
                console.error('导入失败:', error);
                alert(`导入失败: ${error.message}`);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

   const parseAndImport = async (htmlContent) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    let newCategories = [];
    let newBookmarks = [];
    let uncategorizedBookmarks = [];
    const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 代码二 (app.js) 的修改
const parseNode = (node, parentId) => {
    // 直接在当前<DL>下查找<DT>子元素
    const children = Array.from(node.children).filter(child => child.tagName === 'DT');
    
    for (const child of children) {
        const folderHeader = child.querySelector('h3');
        const link = child.querySelector('a');

        if (folderHeader) { // 这是一个文件夹
            const newCategoryId = generateId('cat');
            newCategories.push({
                id: newCategoryId,
                name: folderHeader.textContent.trim(),
                parentId: parentId
            });

            // 【BUG修复】健壮地查找子文件夹列表<DL>
            // 它可能是<DT>的下一个兄弟元素，也可能是<DT>的直接子元素（不规范但常见）
            let subList = child.nextElementSibling;
            if (!subList || subList.tagName !== 'DL') {
                subList = child.querySelector('dl');
            }
            
            if (subList) {
                parseNode(subList, newCategoryId);
            }

        } else if (link) { // 这是一个书签链接
            const bookmark = {
                id: generateId('bm'),
                name: link.textContent.trim(),
                url: link.href,
                categoryId: parentId,
                description: '',
                icon: link.getAttribute('icon') || ''
            };

            if (parentId) {
                newBookmarks.push(bookmark);
            } else {
                uncategorizedBookmarks.push(bookmark);
            }
        }
    }
};

    const root = doc.querySelector('dl');
    if (!root) throw new Error('无效的书签文件格式。');
    parseNode(root, null);

    if (uncategorizedBookmarks.length > 0) {
        let uncategorizedCat = allCategories.find(c => c.name === '未分类书签' && c.parentId === null);
        if (!uncategorizedCat) {
            uncategorizedCat = { id: generateId('cat'), name: '未分类书签', parentId: null };
            newCategories.push(uncategorizedCat);
        }
        uncategorizedBookmarks.forEach(bm => bm.categoryId = uncategorizedCat.id);
        newBookmarks.push(...uncategorizedBookmarks);
    }

    if (newCategories.length === 0 && newBookmarks.length === 0) {
        throw new Error('未在文件中找到可导入的书签或文件夹。');
    }

    // 将解析出的新分类和新书签添加到内存中
    allCategories.push(...newCategories);
    allBookmarks.push(...newBookmarks);
    
    // 【关键修复】调用 persistOrder 将合并后的完整数据保存到后端
    await persistOrder();
    
    // 保存成功后，重新加载一次数据以确保完全同步（可选，但推荐）
    await loadData();
};

    // --- Drag and Drop Logic ---
    const initSortables = () => {
        if (categorySortable) categorySortable.destroy();
        if (isGuestView || !currentUser?.permissions?.canEditCategories) return;
        
        categorySortable = new Sortable(categoryNav, {
            animation: 150,
            group: 'categories',
            onEnd: (evt) => {
                const itemId = evt.item.dataset.id;
                const toList = evt.to;
                const newIndex = evt.newIndex;
                
                const itemToMove = allCategories.find(c => c.id === itemId);
                if (!itemToMove) return;

                let newParentId = null;
                // Check if dropped onto another category (making it a child)
                const parentEl = toList.children[newIndex];
                if (evt.pullMode === 'clone' || (parentEl && parentEl.dataset.id !== itemId)) {
                    newParentId = parentEl ? parentEl.dataset.id : null;
                } else {
                     // Dropped in the root list
                     newParentId = null;
                }
                
                // If dropped on another item, it becomes a child of that item
                if (evt.to.children[newIndex-1] && newIndex > 0) {
                   const siblingEl = evt.to.children[newIndex-1];
                   if (siblingEl) {
                       newParentId = siblingEl.dataset.id;
                   }
                } else {
                    newParentId = null; // Dropped at the top level
                }
                
                // Create a flat representation of the new visual order
                const newOrder = Array.from(categoryNav.querySelectorAll('li')).map(li => li.dataset.id);

                // Update parentId
                itemToMove.parentId = newParentId;

                // Re-sort allCategories based on the new visual order
                allCategories = newOrder.map(id => allCategories.find(c => c.id === id)).filter(Boolean);
                
                // Optimistically re-render
                renderUI();

                // Persist the changes
                persistOrder();
            },
        });
    };

    // --- Initial Load ---
    applyTheme(localStorage.getItem('theme') || 'dark-theme');
    applySidebarState(localStorage.getItem('sidebarCollapsed') === 'true');
    checkLoginStatus();
});






