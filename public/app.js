document.addEventListener('DOMContentLoaded', () => {
    // --- 辅助函数 ---
    const escapeHTML = (str) => {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, (match) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[match]));
    };
    
    // --- Element Selectors ---
    const staticNav = document.getElementById('static-nav');
    const loginContainer = document.getElementById('login-container');
    const appLayout = document.getElementById('app-layout');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const themeToggleButton = document.getElementById('theme-toggle');
    const localSearchInput = document.getElementById('local-search');
    const searchEngineSelect = document.getElementById('search-engine');
    const bookmarksGrid = document.getElementById('bookmarks-grid');
    const categoryNav = document.getElementById('category-nav');
    const logoutButton = document.getElementById('logout-btn');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const addBookmarkBtn = document.getElementById('add-bookmark-btn');
    const userManagementBtn = document.getElementById('user-management-btn');
    const manageCategoriesBtn = document.getElementById('manage-categories-btn');
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
    const importBookmarksBtn = document.getElementById('import-bookmarks-btn');
    const importFileInput = document.getElementById('import-file-input');

   // --- State ---
    let allBookmarks = [], allCategories = [], allUsers = [], currentUser = null, isGuestView = false;
    let categorySortable, bookmarkSortable;


// --- API Helper ---
    const apiRequest = async (endpoint, method = 'GET', body = null) => {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('jwt_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const options = { method, headers };
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

     const persistData = async () => {
        try {
            await apiRequest('data', 'PUT', {
                categories: allCategories,
                bookmarks: allBookmarks
            });
        } catch (error) {
            alert('数据保存失败: ' + error.message);
            await loadData();
        }
    };

    
  // --- Theme Logic ---
  const applyTheme = (theme) => {
        const currentClass = document.body.className;
        document.body.className = theme;
        if(currentClass.includes('is-loading')) {
            document.body.classList.add('is-loading');
        }
        themeToggleButton.innerHTML = theme === 'dark-theme' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
        localStorage.setItem('theme', theme);
    };
    themeToggleButton.addEventListener('click', () => {
        const newTheme = document.body.classList.contains('light-theme') ? 'dark-theme' : 'light-theme';
        applyTheme(newTheme);
    });

    manageMenu.addEventListener('click', (e) => {
        if(e.target.closest('.dropdown-toggle')) {
            manageMenu.classList.toggle('open');
        }
    });
    document.addEventListener('click', (e) => {
        if (!manageMenu.contains(e.target)) {
            manageMenu.classList.remove('open');
        }
    });

   // --- Authentication & UI Flow ---
 const showLoginPage = () => {
        appLayout.style.display = 'none';
        loginContainer.style.display = 'block';
    };

    const checkLoginStatus = async () => {
        try {
            await loadData();
            loginContainer.style.display = 'none';
            appLayout.style.display = 'flex';
        } catch (error) {
            console.error("Data loading failed (might be expected for guests):", error.message);
            showLoginPage();
        } finally {
            document.body.classList.remove('is-loading');
        }
    };

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
        if (isGuestView) {
            showLoginPage();
        } else {
            localStorage.removeItem('jwt_token');
            checkLoginStatus();
        }
    });


     // --- Data Loading & UI Rendering ---
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
        renderBookmarks(categoryNav.querySelector('.active')?.dataset.id || 'all', localSearchInput.value);
        initSortables();
        if (categoryManagementModal.style.display === 'flex') renderCategoryManagerList();
        if (userManagementModal.style.display === 'flex') renderUserManagementPanel();
    };

    const updateButtonVisibility = () => {
        addBookmarkBtn.style.display = !isGuestView && currentUser?.permissions?.canEditBookmarks ? 'flex' : 'none';
        manageMenu.style.display = !isGuestView && (currentUser?.permissions?.canEditCategories || currentUser?.permissions?.canEditUsers) ? 'inline-block' : 'none';
        if (manageMenu.style.display !== 'none') {
            document.getElementById('manage-categories-btn').style.display = currentUser.permissions.canEditCategories ? 'block' : 'none';
            document.getElementById('user-management-btn').style.display = currentUser.permissions.canEditUsers ? 'block' : 'none';
            document.getElementById('import-bookmarks-btn').style.display = currentUser.permissions.canEditBookmarks ? 'block' : 'none';
        }
        if (isGuestView) {
            logoutButton.innerHTML = '<i class="fas fa-key"></i>';
            logoutButton.title = '登录';
        } else {
            logoutButton.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
            logoutButton.title = '退出登录';
        }
    };


const renderCategories = () => {
    const activeId = categoryNav.querySelector('.active')?.dataset.id || staticNav.querySelector('.active')?.dataset.id || 'all';

    // 分别清空两个列表
    categoryNav.innerHTML = '';
    staticNav.innerHTML = '';
        
        const allLi = document.createElement('li');
    allLi.dataset.id = 'all';
    allLi.innerHTML = `<i class="fas fa-inbox"></i><span>全部书签</span>`;
    // 【重要】将“全部书签”添加到新的 staticNav 容器中
    staticNav.appendChild(allLi);

        const buildTree = (parentId, level) => {
            allCategories
                .filter(cat => cat.parentId === parentId)
                .forEach(cat => {
                    const li = document.createElement('li');
                    li.dataset.id = cat.id;
                    li.style.paddingLeft = `${level * 20}px`;
                    li.innerHTML = `<i class="fas fa-folder"></i><span>${escapeHTML(cat.name)}</span>`;
                    if (!isGuestView && currentUser?.permissions?.canEditCategories) {
                        li.draggable = true;
                    }
                    categoryNav.appendChild(li);
                    buildTree(cat.id, level + 1);
                });
        };
        buildTree(null, 1);

          const newActiveLi = document.querySelector(`.sidebar li[data-id="${activeId}"]`) || staticNav.querySelector(`li[data-id="all"]`);
    if(newActiveLi) newActiveLi.classList.add('active');
};
    
    categoryNav.addEventListener('click', (e) => {
        const clickedLi = e.target.closest('li');
        if (!clickedLi || !categoryNav.contains(clickedLi) || clickedLi.classList.contains('sortable-ghost')) return;
        categoryNav.querySelector('.active')?.classList.remove('active');
        clickedLi.classList.add('active');
        renderBookmarks(clickedLi.dataset.id, localSearchInput.value);
    });


    const renderBookmarks = (categoryId = 'all', searchTerm = '') => {
        bookmarksGrid.innerHTML = '';
        let filteredBookmarks = categoryId === 'all' 
            ? allBookmarks 
            : allBookmarks.filter(bm => bm.categoryId === categoryId);
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
            const img = document.createElement('img');
            img.src = bm.icon || defaultIcon;
            img.alt = "";
            img.onerror = function() { this.src=defaultIcon; this.onerror=null; };
            const h3 = document.createElement('h3');
            h3.append(img, document.createTextNode(' ' + bm.name));
            const p = document.createElement('p');
            p.textContent = bm.description || '';
            card.append(h3, p);
            if (!isGuestView && currentUser?.permissions?.canEditBookmarks) {
                const actions = document.createElement('div');
                actions.className = 'bookmark-card-actions';
                const editBtn = document.createElement('button');
                editBtn.title = '编辑';
                editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
                editBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleEditBookmark(bm);
                });
                const deleteBtn = document.createElement('button');
                deleteBtn.title = '删除';
                deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                deleteBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteBookmark(bm);
                });
                actions.append(editBtn, deleteBtn);
                card.appendChild(actions);
            }
            bookmarksGrid.appendChild(card);
        });
    };
    
    localSearchInput.addEventListener('keyup', (e) => {
        const term = e.target.value;
        const activeCatId = categoryNav.querySelector('.active')?.dataset.id || 'all';
        renderBookmarks(activeCatId, term);
        if (e.key === 'Enter' && term.trim() !== '') {
            window.open(searchEngineSelect.value + encodeURIComponent(term), '_blank');
        }
    });

    const showModal = (modal) => { modalBackdrop.style.display = 'flex'; modal.style.display = 'flex'; };
    const hideAllModals = () => { modalBackdrop.style.display = 'none'; document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); };
    modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) hideAllModals(); });
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', hideAllModals));
    const showConfirm = (title, text, onConfirm) => {
        confirmTitle.textContent = title;
        confirmText.textContent = text;
        showModal(confirmModal);
        const yesHandler = () => { hideAllModals(); onConfirm(); };
        confirmBtnYes.onclick = yesHandler;
    };
    document.getElementById('confirm-btn-no').onclick = hideAllModals;

   const populateCategoryDropdown = (selectElement, selectedId = null) => {
        selectElement.innerHTML = '';
        const buildOptions = (parentId, level) => {
            allCategories
                .filter(cat => cat.parentId === parentId)
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

    addBookmarkBtn.addEventListener('click', () => {
        bookmarkModalTitle.textContent = '添加新书签';
        bookmarkForm.reset();
        bookmarkForm.querySelector('.modal-error-message').textContent = '';
        bookmarkForm.querySelector('#bm-id').value = '';
        const categorySelect = bookmarkForm.querySelector('#bm-category');
        populateCategoryDropdown(categorySelect);
        if (categorySelect.options.length === 0) {
            alert('没有可添加书签的分类！请先创建分类。');
            return;
        }
        showModal(bookmarkModal);
    });

    const handleEditBookmark = (bookmark) => {
        bookmarkModalTitle.textContent = '编辑书签';
        bookmarkForm.reset();
        bookmarkForm.querySelector('.modal-error-message').textContent = '';
        bookmarkForm.querySelector('#bm-id').value = bookmark.id;
        bookmarkForm.querySelector('#bm-name').value = bookmark.name;
        bookmarkForm.querySelector('#bm-url').value = bookmark.url;
        bookmarkForm.querySelector('#bm-desc').value = bookmark.description || '';
        bookmarkForm.querySelector('#bm-icon').value = bookmark.icon || '';
       const categorySelect = bookmarkForm.querySelector('#bm-category');
        populateCategoryDropdown(categorySelect, bookmark.categoryId);
        showModal(bookmarkModal);
    };

    const handleDeleteBookmark = (bookmark) => {
        showConfirm('确认删除', `您确定要删除书签 "${escapeHTML(bookmark.name)}" 吗？`, async () => {
            try {
                await apiRequest(`bookmarks/${bookmark.id}`, 'DELETE');
                await loadData();
            } catch (error) { alert(`删除失败: ${error.message}`); }
        });
    };

    bookmarkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = bookmarkForm.querySelector('#bm-id').value;
        const method = id ? 'PUT' : 'POST';
        const endpoint = id ? `bookmarks/${id}` : 'bookmarks';
        const data = {
            name: bookmarkForm.querySelector('#bm-name').value,
            url: bookmarkForm.querySelector('#bm-url').value,
            description: bookmarkForm.querySelector('#bm-desc').value,
            icon: bookmarkForm.querySelector('#bm-icon').value,
            categoryId: bookmarkForm.querySelector('#bm-category').value,
        };
        try {
            await apiRequest(endpoint, method, data);
            hideAllModals();
            await loadData();
        } catch (error) {
            bookmarkForm.querySelector('.modal-error-message').textContent = error.message;
        }
    });

    manageCategoriesBtn.addEventListener('click', () => {
        document.getElementById('category-error-message').textContent = '';
        renderCategoryManagerList();
        showModal(categoryManagementModal);
    });

    const renderCategoryManagerList = () => {
        categoryManagerList.innerHTML = '';
        allCategories.forEach(cat => {
            const li = document.createElement('li');
            li.dataset.id = cat.id;
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `del-cat-${cat.id}`;
            checkbox.dataset.id = cat.id;
            const span = document.createElement('span');
            span.className = 'category-name';
            span.textContent = cat.name;
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-cat-btn';
            editBtn.title = '编辑名称';
            editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
            editBtn.onclick = () => handleEditCategory(li, cat);
            li.append(checkbox, span, editBtn);
            categoryManagerList.appendChild(li);
        });
    };

    const handleEditCategory = (liElement, category) => {
        const nameSpan = liElement.querySelector('.category-name');
        const editBtn = liElement.querySelector('.edit-cat-btn');
        if(!nameSpan || !editBtn || liElement.querySelector('.inline-edit-input')) return;
        const originalName = category.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalName;
        input.className = 'inline-edit-input';
        nameSpan.style.display = 'none';
        editBtn.style.display = 'none';
        liElement.insertBefore(input, editBtn);
        input.focus();
        input.select();
        const finishEditing = async () => {
            const newName = input.value.trim();
            nameSpan.style.display = '';
            editBtn.style.display = '';
            input.remove();
            if (newName && newName !== originalName) {
                const errorEl = document.getElementById('category-error-message');
                errorEl.textContent = '';
                try {
                    await apiRequest(`categories/${category.id}`, 'PUT', { name: newName });
                    await loadData();
                } catch (error) {
                    errorEl.textContent = error.message;
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
        const checkedBoxes = categoryManagerList.querySelectorAll('input[type="checkbox"]:checked');
        const idsToDelete = Array.from(checkedBoxes).map(cb => cb.dataset.id);
        if (idsToDelete.length === 0) {
            alert('请先选择要删除的分类。');
            return;
        }
        showConfirm('确认强制删除', `确定要删除选中的 ${idsToDelete.length} 个分类吗？分类下的所有书签也将被一并删除！`, async () => {
            const errorEl = document.getElementById('category-error-message');
            errorEl.textContent = '';
            try {
                await apiRequest('categories', 'DELETE', { ids: idsToDelete });
                await loadData();
            } catch (error) {
                errorEl.textContent = error.message;
            }
        });
    });

    addCategoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('new-category-name');
        const errorEl = document.getElementById('category-error-message');
        errorEl.textContent = '';
        try {
            await apiRequest('categories', 'POST', { name: input.value.trim() });
            input.value = '';
            await loadData();
        } catch (error) { errorEl.textContent = error.message; }
    });

    userManagementBtn.addEventListener('click', () => {
        renderUserManagementPanel();
        showModal(userManagementModal);
    });

    const renderUserManagementPanel = () => {
        userList.innerHTML = '';
        allUsers.forEach(user => {
            const li = document.createElement('li');
            li.dataset.username = user.username;
            const span = document.createElement('span');
            span.textContent = `${user.username} (${user.roles.join(', ')})`;
            li.appendChild(span);
            if (user.username !== currentUser?.username) {
                const actions = document.createElement('div');
                actions.className = 'user-list-actions';
                const deleteBtn = document.createElement('button');
                deleteBtn.title = '删除用户';
                deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    showConfirm('确认删除用户', `确定删除用户 "${escapeHTML(user.username)}"?`, async () => {
                        try {
                            await apiRequest(`users/${user.username}`, 'DELETE');
                            await loadData();
                        } catch (error) { alert(error.message); }
                    });
                };
                actions.appendChild(deleteBtn);
                li.appendChild(actions);
            }
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

    const populateUserForm = (user) => {
        userList.querySelectorAll('li').forEach(li => li.classList.remove('selected'));
        userList.querySelector(`li[data-username="${user.username}"]`).classList.add('selected');
        userForm.reset();
        userFormTitle.textContent = `编辑用户: ${user.username}`;
        userForm.querySelector('.modal-error-message').textContent = '';
        const usernameInput = userForm.querySelector('#user-form-username');
        const passwordInput = userForm.querySelector('#user-form-password');
        usernameInput.value = user.username;
        usernameInput.readOnly = true;
        userForm.querySelector('#user-form-username-hidden').value = user.username;
        if (user.username === 'public') {
            passwordInput.disabled = true;
            passwordInput.placeholder = '虚拟账户，无法设置密码';
            renderUserFormRoles(user.roles, true);
        } else {
            passwordInput.disabled = false;
            passwordInput.placeholder = "留空则不修改";
            renderUserFormRoles(user.roles, false);
        }
        renderUserFormCategories(user.permissions.visibleCategories);
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

    const renderUserFormCategories = (visibleIds = []) => {
        userFormCategories.innerHTML = '';
        allCategories.forEach(cat => {
            const id = `cat-perm-${cat.id}`;
            const div = document.createElement('div');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = id;
            input.value = cat.id;
            if (visibleIds.includes(cat.id)) input.checked = true;
            const label = document.createElement('label');
            label.htmlFor = id;
            label.textContent = cat.name;
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

        const parseNode = (node, parentId) => {
            const children = Array.from(node.children).filter(c => c.tagName === 'DT');
            for (const child of children) {
                const folderHeader = child.querySelector('h3');
                const link = child.querySelector('a');
                if (folderHeader) {
                    const newCategoryId = generateId('cat');
                    newCategories.push({ id: newCategoryId, name: folderHeader.textContent.trim(), parentId: parentId });
                    const subList = child.nextElementSibling;
                    if (subList && subList.tagName === 'DL') {
                        parseNode(subList, newCategoryId);
                    }
                } else if (link) {
                    const bookmark = { id: generateId('bm'), name: link.textContent.trim(), url: link.href, categoryId: parentId, description: '', icon: link.getAttribute('icon') || '' };
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

        allCategories.push(...newCategories);
        allBookmarks.push(...newBookmarks);
        await persistOrder();
        await loadData();
    };

    
    // --- Drag and Drop Logic ---
    const destroySortables = () => {
        if (categorySortable) categorySortable.destroy();
        if (bookmarkSortable) bookmarkSortable.destroy();
    };
    
    const initSortables = () => {
        destroySortables(); // 销毁旧实例，防止内存泄漏

        if (isGuestView || !currentUser) return; // 公共模式或未登录，不启用拖拽

        if (currentUser.permissions.canEditCategories) {
            categorySortable = new Sortable(categoryNav, {
                animation: 150,
                filter: '[data-id="all"]', // “全部书签”项不可拖动
                onEnd: (evt) => {
                    if (evt.oldIndex === evt.newIndex) return;
                    // old/newIndex - 1 是因为要排除掉“全部书签”这一项
                    const itemToMove = allCategories.splice(evt.oldIndex - 1, 1)[0];
                    allCategories.splice(evt.newIndex - 1, 0, itemToMove);
                    persistOrder();
                },
            });
        }
        
        if (currentUser.permissions.canEditBookmarks) {
            bookmarkSortable = new Sortable(bookmarksGrid, {
                animation: 150,
                onEnd: (evt) => {
                    if (evt.oldIndex === evt.newIndex) return;

                    const activeCategoryId = categoryNav.querySelector('.active')?.dataset.id || 'all';
                    
                    // 获取当前视图的书签ID顺序
                    const currentIdOrder = Array.from(evt.from.children).map(el => el.dataset.id);

                    // 从旧的DOM顺序中找到被移动的书签ID
                    const movedItemId = evt.item.dataset.id;
                    
                    // 创建一个新的ID顺序
                    currentIdOrder.splice(evt.oldIndex, 1);
                    currentIdOrder.splice(evt.newIndex, 0, movedItemId);

                    // 根据新的ID顺序来重排 allBookmarks 数组
                    // 这是一个稳定的排序，可以处理任何视图（全部或分类）
                    allBookmarks.sort((a, b) => {
                        let indexA = currentIdOrder.indexOf(a.id);
                        let indexB = currentIdOrder.indexOf(b.id);
                        // 如果某项不在当前视图中，则保持其相对顺序
                        if (indexA === -1) indexA = Infinity;
                        if (indexB === -1) indexB = Infinity;
                        return indexA - indexB;
                    });
                    
                    persistOrder();
                },
            });
        }
    };

    // --- Initial Load ---
    applyTheme(localStorage.getItem('theme') || 'light-theme');
    checkLoginStatus();
});

