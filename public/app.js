document.addEventListener('DOMContentLoaded', () => {
    // --- (新增) 辅助函数 ---
    const escapeHTML = (str) => {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, (match) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[match]));
    };
    
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
    const logoutButton = document.getElementById('logout-btn');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const addBookmarkBtn = document.getElementById('add-bookmark-btn');
    const userManagementBtn = document.getElementById('user-management-btn');
    const manageCategoriesBtn = document.getElementById('manage-categories-btn');
    
    // Modals & Forms
    const bookmarkModal = document.getElementById('bookmark-modal');
    const userManagementModal = document.getElementById('user-management-modal');
    const categoryManagementModal = document.getElementById('category-management-modal');
    const confirmModal = document.getElementById('confirm-modal');
    const bookmarkForm = document.getElementById('bookmark-form');
    const userForm = document.getElementById('user-form');
    const addCategoryForm = document.getElementById('add-category-form');

    // Modal Internals
    const bookmarkModalTitle = document.getElementById('bookmark-modal-title');
    const userList = document.getElementById('user-list');
    const userFormTitle = document.getElementById('user-form-title');
    const userFormClearBtn = document.getElementById('user-form-clear-btn');
    const userFormRoles = document.getElementById('user-form-permissions'); // Corrected variable name
    const userFormCategories = document.getElementById('user-form-categories');
    const categoryManagerList = document.getElementById('category-manager-list');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmText = document.getElementById('confirm-text');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');

    // --- State ---
    let allBookmarks = [], allCategories = [], allUsers = [], currentUser = null;

    // --- (已修复) API Helper ---
    const apiRequest = async (endpoint, method = 'GET', body = null) => {
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('jwt_token')}` };
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

    // --- Theme Logic ---
    const applyTheme = (theme) => {
        document.body.className = theme;
        if (document.body.classList.contains('is-loading')) {
            document.body.classList.remove('is-loading');
        }
        themeToggleButton.innerHTML = theme === 'dark-theme' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
        localStorage.setItem('theme', theme);
    };
    themeToggleButton.addEventListener('click', () => {
        const currentTheme = document.body.classList.contains('dark-theme') ? 'dark-theme' : 'light-theme';
        const newTheme = currentTheme === 'light-theme' ? 'dark-theme' : 'light-theme';
        applyTheme(newTheme);
    });

    // --- Authentication ---
    const checkLoginStatus = async () => {
        try {
            const token = localStorage.getItem('jwt_token');
            if (token) {
                loginContainer.style.display = 'none';
                appLayout.style.display = 'flex';
                await loadData();
            } else {
                loginContainer.style.display = 'block';
                appLayout.style.display = 'none';
                currentUser = null;
            }
        } catch (error) {
            console.error("Authentication check failed:", error);
            loginContainer.style.display = 'block';
            appLayout.style.display = 'none';
            currentUser = null;
        } finally {
            const theme = localStorage.getItem('theme') || 'light-theme';
            applyTheme(theme);
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
            if (!result || !result.token) throw new Error('从服务器返回的响应无效');
            localStorage.setItem('jwt_token', result.token);
            await checkLoginStatus();
        } catch (error) {
            loginError.textContent = error.message;
        }
    });
    
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwt_token');
        checkLoginStatus();
    });

    // --- Data Loading & UI Rendering ---
    const loadData = async () => {
        try {
            const data = await apiRequest('data');
            const tokenPayload = JSON.parse(atob(localStorage.getItem('jwt_token').split('.')[1]));
            
            allCategories = data.categories || [];
            allBookmarks = data.bookmarks || [];
            allUsers = data.users || [];
            currentUser = allUsers.find(u => u.username === tokenPayload.sub);
            
            if (!currentUser) throw new Error("无法验证当前用户身份。");

            renderUI();
        } catch (error) {
            console.error('数据加载错误:', error);
            if (error.message.includes('401') || error.message.includes('无法验证')) {
                localStorage.removeItem('jwt_token');
                checkLoginStatus();
            }
        }
    };
    
    const renderUI = () => {
        renderCategories();
        renderBookmarks();
        updateButtonVisibility();
        // If modals are open, refresh their content
        if (categoryManagementModal.style.display === 'flex') renderCategoryManagerList();
        if (userManagementModal.style.display === 'flex') renderUserManagementPanel();
    };

    const updateButtonVisibility = () => {
        addBookmarkBtn.style.display = currentUser?.permissions?.canEditBookmarks ? 'flex' : 'none';
        manageCategoriesBtn.style.display = currentUser?.permissions?.canEditCategories ? 'block' : 'none';
        userManagementBtn.style.display = currentUser?.permissions?.canEditUsers ? 'flex' : 'none';
    };

    // ... (renderCategories and renderBookmarks functions are unchanged, they can be copied from previous response)
    const renderCategories = () => {
        categoryNav.innerHTML = '';
        const allLi = document.createElement('li');
        allLi.innerHTML = `<i class="fas fa-inbox"></i><span>全部书签</span>`;
        allLi.dataset.id = 'all';
        allLi.classList.add('active');
        categoryNav.appendChild(allLi);

        allCategories.forEach(cat => {
            const li = document.createElement('li');
            li.dataset.id = cat.id;
            const icon = document.createElement('i');
            icon.className = 'fas fa-folder';
            const span = document.createElement('span');
            span.textContent = cat.name; // 安全
            li.appendChild(icon);
            li.appendChild(span);
            categoryNav.appendChild(li);
        });
        
        categoryNav.querySelectorAll('li').forEach(li => li.addEventListener('click', (e) => {
            categoryNav.querySelector('.active')?.classList.remove('active');
            e.currentTarget.classList.add('active');
            renderBookmarks(e.currentTarget.dataset.id);
        }));
    };
    
    const renderBookmarks = (categoryId = 'all', searchTerm = '') => {
        bookmarksGrid.innerHTML = '';
        let filteredBookmarks = categoryId === 'all' ? allBookmarks : allBookmarks.filter(bm => bm.categoryId === categoryId);
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filteredBookmarks = filteredBookmarks.filter(bm => bm.name.toLowerCase().includes(lower) || bm.url.toLowerCase().includes(lower));
        }

        filteredBookmarks.forEach(bm => {
            const card = document.createElement('a');
            card.href = bm.url;
            card.className = 'bookmark-card';
            card.target = '_blank';
            card.rel = 'noopener noreferrer';

            const defaultIcon = `https://www.google.com/s2/favicons?domain=${new URL(bm.url).hostname}`;
            
            const img = document.createElement('img');
            img.src = bm.icon || defaultIcon;
            img.alt = "";
            img.onerror = function() { this.src=defaultIcon; this.onerror=null; };
            
            const h3 = document.createElement('h3');
            h3.appendChild(img);
            h3.appendChild(document.createTextNode(' ' + bm.name)); // 安全

            const p = document.createElement('p');
            p.textContent = bm.description || ''; // 安全

            card.append(h3, p);

            if (currentUser?.permissions?.canEditBookmarks) {
                const actions = document.createElement('div');
                actions.className = 'bookmark-card-actions';
                const editBtn = document.createElement('button');
                editBtn.title = '编辑';
                editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
                editBtn.addEventListener('click', (e) => { e.preventDefault(); /* handleEditBookmark(bm); */ });
                const deleteBtn = document.createElement('button');
                deleteBtn.title = '删除';
                deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                deleteBtn.addEventListener('click', (e) => { e.preventDefault(); handleDeleteBookmark(bm); });
                actions.append(editBtn, deleteBtn);
                card.appendChild(actions);
            }
            bookmarksGrid.appendChild(card);
        });
    };
    // --- End of unchanged render functions ---

    // --- Search Logic ---
    localSearchInput.addEventListener('keyup', (e) => {
        const term = e.target.value;
        const activeCatId = categoryNav.querySelector('.active')?.dataset.id || 'all';
        renderBookmarks(activeCatId, term);
        if (e.key === 'Enter' && term.trim() !== '') {
            window.open(searchEngineSelect.value + encodeURIComponent(term), '_blank');
        }
    });

    // --- Modal Handling ---
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

    // --- Category Management ---
    manageCategoriesBtn.addEventListener('click', () => {
        renderCategoryManagerList();
        showModal(categoryManagementModal);
    });

    const renderCategoryManagerList = () => {
        categoryManagerList.innerHTML = '';
        allCategories.forEach(cat => {
            const li = document.createElement('li');
            const span = document.createElement('span');
            span.className = 'category-name';
            span.textContent = cat.name;
            
            const actions = document.createElement('div');
            actions.className = 'category-item-actions';
            const deleteBtn = document.createElement('button');
            deleteBtn.title = '删除';
            deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            deleteBtn.onclick = () => handleDeleteCategory(cat);
            
            actions.appendChild(deleteBtn);
            li.append(span, actions);
            categoryManagerList.appendChild(li);
        });
    };

    addCategoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('new-category-name');
        try {
            await apiRequest('categories', 'POST', { name: input.value.trim() });
            input.value = '';
            await loadData();
        } catch (error) { alert(`添加失败: ${error.message}`); }
    });
    
    const handleDeleteCategory = (category) => {
        showConfirm('确认删除分类', `确定要删除分类 "${escapeHTML(category.name)}" 吗？`, async () => {
            try {
                await apiRequest(`categories/${category.id}`, 'DELETE');
                await loadData();
            } catch (error) { alert(`删除失败: ${error.message}`); }
        });
    };

    // --- User Management (Fully Implemented) ---
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
            if (user.username !== 'admin' && user.username !== currentUser.username) {
                const actions = document.createElement('div');
                actions.className = 'user-list-actions';
                const deleteBtn = document.createElement('button');
                deleteBtn.title = '删除用户';
                deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    showConfirm('确认删除用户', `确定删除用户 "${escapeHTML(user.username)}"?`, async () => {
                        await apiRequest(`users/${user.username}`, 'DELETE');
                        await loadData();
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
        usernameInput.value = '';
        usernameInput.readOnly = false;
        userForm.querySelector('#user-form-username-hidden').value = '';
        userForm.querySelector('#user-form-password').placeholder = "必填";
        
        // Render roles and categories for a new user
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
        usernameInput.value = user.username;
        usernameInput.readOnly = true;
        userForm.querySelector('#user-form-username-hidden').value = user.username;
        userForm.querySelector('#user-form-password').placeholder = "留空则不修改";

        renderUserFormRoles(user.roles);
        renderUserFormCategories(user.permissions.visibleCategories);
    };

    const renderUserFormRoles = (activeRoles = []) => {
        userFormRoles.innerHTML = '';
        const availableRoles = ['admin', 'editor', 'viewer'];
        availableRoles.forEach(role => {
            const id = `role-${role}`;
            const div = document.createElement('div');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = id;
            input.value = role;
            if (activeRoles.includes(role)) input.checked = true;
            const label = document.createElement('label');
            label.htmlFor = id;
            label.textContent = role.charAt(0).toUpperCase() + role.slice(1); // Capitalize
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
            await apiRequest(endpoint, method, userData);
            await loadData(); // Reload all data to ensure consistency
            if (isEditing) {
                // After editing, re-populate the form with updated data
                const updatedUser = allUsers.find(u => u.username === hiddenUsername);
                if(updatedUser) populateUserForm(updatedUser);
            } else {
                clearUserForm();
            }
        } catch(error) {
            errorEl.textContent = error.message;
        }
    });

    // --- Initial Load ---
    checkLoginStatus();
});
