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
    const logoutButton = document.getElementById('logout-btn');
    const modalBackdrop = document.getElementById('modal-backdrop');

    // Admin Elements
    const adminActions = document.getElementById('admin-actions');
    
    // Bookmark Modal Elements
    const bookmarkModal = document.getElementById('bookmark-modal');
    const bookmarkModalTitle = document.getElementById('bookmark-modal-title');
    const bookmarkForm = document.getElementById('bookmark-form');
    const addBookmarkBtn = document.getElementById('add-bookmark-btn');

    // Change Password Elements
    const changePasswordBtn = document.getElementById('change-password-btn');
    const changePasswordModal = document.getElementById('change-password-modal');
    const changePasswordForm = document.getElementById('change-password-form');
    
    // User Management Elements
    const userManagementBtn = document.getElementById('user-management-btn');
    const userManagementModal = document.getElementById('user-management-modal');
    const userList = document.getElementById('user-list');
    const userForm = document.getElementById('user-form');
    const userFormTitle = document.getElementById('user-form-title');
    const userFormClearBtn = document.getElementById('user-form-clear-btn');
    const userFormCategories = document.getElementById('user-form-categories');

    // Category Management Elements
    const manageCategoriesBtn = document.getElementById('manage-categories-btn');
    const categoryManagementModal = document.getElementById('category-management-modal');
    const categoryManagerList = document.getElementById('category-manager-list');
    const addCategoryForm = document.getElementById('add-category-form');

    // Confirm Dialog Elements
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmText = document.getElementById('confirm-text');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');
    const confirmBtnNo = document.getElementById('confirm-btn-no');

    // --- State ---
    let allBookmarks = [], allCategories = [], allUsers = [], currentUser = null;

    // --- API Helper ---
    const apiRequest = async (endpoint, method = 'GET', body = null) => {
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` };
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);
        const response = await fetch(endpoint, options);
        if (response.status === 204 || response.headers.get('content-length') === '0') return null;
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `请求失败: ${response.status}`);
        return result;
    };

    // --- Theme Logic ---
    const applyTheme = (theme) => {
        document.body.className = theme;
        themeToggleButton.innerHTML = theme === 'dark-theme' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
        localStorage.setItem('theme', theme);
    };
    themeToggleButton.addEventListener('click', () => {
        applyTheme(document.body.classList.contains('light-theme') ? 'dark-theme' : 'light-theme');
    });

    // --- Authentication ---
    const getToken = () => localStorage.getItem('jwt_token');

    const checkLoginStatus = async () => {
        if (getToken()) {
            loginContainer.style.display = 'none';
            appLayout.style.display = 'flex';
            // Simple decode to get user info without verification, for UI purposes only.
            try {
                const payload = JSON.parse(atob(getToken().split('.')[1]));
                currentUser = { username: payload.sub, roles: payload.roles };
            } catch (e) {
                console.error("Could not decode token", e);
                localStorage.removeItem('jwt_token');
                checkLoginStatus(); // Re-check to show login page
                return;
            }
            await loadData();
        } else {
            loginContainer.style.display = 'block';
            appLayout.style.display = 'none';
            currentUser = null;
        }
    };

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        try {
            const result = await apiRequest('/login', 'POST', {
                username: document.getElementById('username').value,
                password: document.getElementById('password').value,
                noExpiry: document.getElementById('no-expiry').checked
            });
            localStorage.setItem('jwt_token', result.token);
            currentUser = result.user;
            await checkLoginStatus();
        } catch (error) {
            loginError.textContent = error.message;
        }
    });
    
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwt_token');
        currentUser = null;
        checkLoginStatus();
    });

    // --- Data Loading & Rendering ---
    const loadData = async () => {
        try {
            const data = await apiRequest('/data');
            allCategories = data.categories || [];
            allBookmarks = data.bookmarks || [];
            
            if (currentUser?.roles.includes('admin')) {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
            } else {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            }
            renderCategories();
            renderBookmarks();
        } catch (error) {
            console.error('Data loading error:', error);
            if (error.message.includes('401')) { // Token expired or invalid
                localStorage.removeItem('jwt_token');
                checkLoginStatus();
            }
        }
    };

    const renderCategories = () => {
        categoryNav.innerHTML = '';
        const allLi = document.createElement('li');
        allLi.innerHTML = `<i class="fas fa-inbox"></i><span>全部书签</span>`;
        allLi.dataset.id = 'all';
        allLi.classList.add('active');
        categoryNav.appendChild(allLi);

        allCategories.forEach(cat => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="fas fa-folder"></i><span>${cat.name}</span>`;
            li.dataset.id = cat.id;
            categoryNav.appendChild(li);
        });

        categoryNav.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', () => {
                categoryNav.querySelector('.active')?.classList.remove('active');
                li.classList.add('active');
                renderBookmarks(li.dataset.id);
            });
        });
    };
    
    const renderBookmarks = (categoryId = 'all', searchTerm = '') => {
        bookmarksGrid.innerHTML = '';
        let filteredBookmarks = allBookmarks;
        if (categoryId !== 'all') filteredBookmarks = allBookmarks.filter(bm => bm.categoryId === categoryId);
        
        if (searchTerm) {
            const lowerCaseSearchTerm = searchTerm.toLowerCase();
            filteredBookmarks = filteredBookmarks.filter(bm => 
                bm.name.toLowerCase().includes(lowerCaseSearchTerm) || 
                bm.url.toLowerCase().includes(lowerCaseSearchTerm)
            );
        }

        filteredBookmarks.forEach(bm => {
            const card = document.createElement('a');
            card.href = bm.url;
            card.className = 'bookmark-card';
            card.target = '_blank';
            card.rel = 'noopener noreferrer';
            
            const defaultIcon = `https://www.google.com/s2/favicons?domain=${new URL(bm.url).hostname}`;
            let actionsHTML = '';
            if (currentUser?.roles.includes('admin')) {
                actionsHTML = `
                    <div class="bookmark-card-actions">
                        <button class="edit-btn" title="编辑"><i class="fas fa-pencil-alt"></i></button>
                        <button class="delete-btn" title="删除"><i class="fas fa-trash-alt"></i></button>
                    </div>`;
            }

            card.innerHTML = `
                ${actionsHTML}
                <h3><img src="${bm.icon || defaultIcon}" alt="" onerror="this.src='${defaultIcon}'; this.onerror=null;"> ${bm.name}</h3>
                <p>${bm.description || ''}</p>
            `;
            
            if (currentUser?.roles.includes('admin')) {
                card.querySelector('.edit-btn').addEventListener('click', (e) => { e.preventDefault(); handleEditBookmark(bm); });
                card.querySelector('.delete-btn').addEventListener('click', (e) => { e.preventDefault(); handleDeleteBookmark(bm); });
            }
            bookmarksGrid.appendChild(card);
        });
    };

    // --- Search Logic ---
    localSearchInput.addEventListener('keyup', (e) => {
        const searchTerm = e.target.value;
        const activeCategoryId = categoryNav.querySelector('.active')?.dataset.id || 'all';
        renderBookmarks(activeCategoryId, searchTerm);
        if (e.key === 'Enter' && searchTerm.trim() !== '') {
            const searchURL = searchEngineSelect.value + encodeURIComponent(searchTerm);
            window.open(searchURL, '_blank');
        }
    });

    // --- Modal Handling ---
    const showModal = (modalElement) => {
        modalBackdrop.style.display = 'block';
        modalElement.style.display = 'flex';
    };
    const hideAllModals = () => {
        modalBackdrop.style.display = 'none';
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    };
    modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) hideAllModals(); });
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', hideAllModals));

    const showConfirmDialog = (title, text) => {
        return new Promise((resolve) => {
            confirmTitle.textContent = title;
            confirmText.textContent = text;
            showModal(confirmModal);
            
            const yesHandler = () => { hideAllModals(); resolve(true); };
            const noHandler = () => { hideAllModals(); resolve(false); };
            
            confirmBtnYes.addEventListener('click', yesHandler, { once: true });
            confirmBtnNo.addEventListener('click', noHandler, { once: true });
        });
    };

    // --- Feature Logic: Bookmarks ---
    const handleEditBookmark = (bookmark) => {
        bookmarkModalTitle.textContent = '编辑书签';
        bookmarkForm.querySelector('.modal-error-message').textContent = '';
        bookmarkForm.querySelector('#bm-id').value = bookmark.id;
        bookmarkForm.querySelector('#bm-name').value = bookmark.name;
        bookmarkForm.querySelector('#bm-url').value = bookmark.url;
        bookmarkForm.querySelector('#bm-desc').value = bookmark.description || '';
        bookmarkForm.querySelector('#bm-icon').value = bookmark.icon || '';
        
        const categorySelect = bookmarkForm.querySelector('#bm-category');
        categorySelect.innerHTML = '';
        allCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            option.selected = cat.id === bookmark.categoryId;
            categorySelect.appendChild(option);
        });
        showModal(bookmarkModal);
    };

    const handleDeleteBookmark = async (bookmark) => {
        const confirmed = await showConfirmDialog('确认删除', `您确定要删除书签 "${bookmark.name}" 吗？此操作无法撤销。`);
        if (confirmed) {
            try {
                await apiRequest(`/bookmarks/${bookmark.id}`, 'DELETE');
                await loadData();
            } catch (error) {
                alert(`删除失败: ${error.message}`);
            }
        }
    };

    addBookmarkBtn.addEventListener('click', () => {
        bookmarkModalTitle.textContent = '添加新书签';
        bookmarkForm.reset();
        bookmarkForm.querySelector('.modal-error-message').textContent = '';
        bookmarkForm.querySelector('#bm-id').value = '';
        
        const categorySelect = bookmarkForm.querySelector('#bm-category');
        categorySelect.innerHTML = '';
        allCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            categorySelect.appendChild(option);
        });
        showModal(bookmarkModal);
    });

    bookmarkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = bookmarkForm.querySelector('#bm-id').value;
        const method = id ? 'PUT' : 'POST';
        const endpoint = id ? `/bookmarks/${id}` : '/bookmarks';
        const bookmarkData = {
            name: bookmarkForm.querySelector('#bm-name').value,
            url: bookmarkForm.querySelector('#bm-url').value,
            description: bookmarkForm.querySelector('#bm-desc').value,
            icon: bookmarkForm.querySelector('#bm-icon').value,
            categoryId: bookmarkForm.querySelector('#bm-category').value,
        };
        try {
            await apiRequest(endpoint, method, bookmarkData);
            hideAllModals();
            await loadData();
        } catch (error) {
            bookmarkForm.querySelector('.modal-error-message').textContent = error.message;
        }
    });

    // --- Feature Logic: Change Password ---
    changePasswordBtn.addEventListener('click', () => {
        changePasswordForm.reset();
        changePasswordForm.querySelector('.modal-error-message').textContent = '';
        showModal(changePasswordModal);
    });

    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const passwordData = {
            oldPassword: changePasswordForm.querySelector('#old-password').value,
            newPassword: changePasswordForm.querySelector('#new-password').value,
        };
        try {
            await apiRequest('/change-password', 'POST', passwordData);
            hideAllModals();
            alert('密码修改成功！');
        } catch (error) {
            changePasswordForm.querySelector('.modal-error-message').textContent = error.message;
        }
    });

    // --- Feature Logic: User Management ---
    userManagementBtn.addEventListener('click', async () => {
        showModal(userManagementModal);
        await renderUserManagementPanel();
    });

    const renderUserManagementPanel = async () => {
        try {
            allUsers = await apiRequest('/users');
            userList.innerHTML = '';
            allUsers.forEach(user => {
                const li = document.createElement('li');
                li.dataset.username = user.username;
                li.innerHTML = `
                    <span>${user.username} ${user.roles.includes('admin') ? ' (Admin)' : ''}</span>
                    <div class="user-list-actions">
                        ${user.username !== 'admin' ? `<button class="delete-user-btn" title="删除用户"><i class="fas fa-trash-alt"></i></button>` : ''}
                    </div>
                `;
                li.addEventListener('click', () => populateUserForm(user));
                if (user.username !== 'admin') {
                    li.querySelector('.delete-user-btn').addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (await showConfirmDialog('确认删除用户', `确定要删除用户 "${user.username}" 吗？`)) {
                           await apiRequest(`/users/${user.username}`, 'DELETE');
                           await renderUserManagementPanel();
                        }
                    });
                }
                userList.appendChild(li);
            });
            clearUserForm();
        } catch(error) {
            userForm.querySelector('.modal-error-message').textContent = error.message;
        }
    };
    
    const populateUserForm = (user) => {
        userList.querySelector('.selected')?.classList.remove('selected');
        userList.querySelector(`li[data-username="${user.username}"]`).classList.add('selected');
        userFormTitle.textContent = '编辑用户';
        userForm.querySelector('.modal-error-message').textContent = '';
        userForm.querySelector('#user-form-username-hidden').value = user.username;
        const usernameInput = userForm.querySelector('#user-form-username');
        usernameInput.value = user.username;
        usernameInput.readOnly = true;
        const passwordInput = userForm.querySelector('#user-form-password');
        passwordInput.value = '';
        passwordInput.placeholder = "留空则不修改";

        userFormCategories.innerHTML = '';
        allCategories.forEach(cat => {
            const isChecked = user.permissions?.visibleCategories?.includes(cat.id);
            userFormCategories.innerHTML += `<div><input type="checkbox" id="cat-perm-${cat.id}" value="${cat.id}" ${isChecked ? 'checked' : ''}><label for="cat-perm-${cat.id}">${cat.name}</label></div>`;
        });
    };

    const clearUserForm = () => {
        userList.querySelector('.selected')?.classList.remove('selected');
        userForm.reset();
        userFormTitle.textContent = '添加新用户';
        userForm.querySelector('.modal-error-message').textContent = '';
        userForm.querySelector('#user-form-username-hidden').value = '';
        const usernameInput = userForm.querySelector('#user-form-username');
        usernameInput.readOnly = false;
        usernameInput.placeholder = "新用户名";
        userForm.querySelector('#user-form-password').placeholder = "必填";
        
        userFormCategories.innerHTML = '';
        allCategories.forEach(cat => {
            userFormCategories.innerHTML += `<div><input type="checkbox" id="cat-perm-${cat.id}" value="${cat.id}"><label for="cat-perm-${cat.id}">${cat.name}</label></div>`;
        });
    };
    userFormClearBtn.addEventListener('click', clearUserForm);

    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = userForm.querySelector('#user-form-username').value;
        const hiddenUsername = userForm.querySelector('#user-form-username-hidden').value;
        const isEditing = !!hiddenUsername;
        const password = userForm.querySelector('#user-form-password').value;
        
        if (!isEditing && !password) {
            userForm.querySelector('.modal-error-message').textContent = '新用户必须设置密码';
            return;
        }

        const visibleCategories = Array.from(userFormCategories.querySelectorAll('input:checked')).map(cb => cb.value);
        const userData = { permissions: { visibleCategories } };
        if (password) userData.password = password;

        const endpoint = isEditing ? `/users/${hiddenUsername}` : `/users`;
        const method = isEditing ? 'PUT' : 'POST';
        if (!isEditing) userData.username = username;

        try {
            await apiRequest(endpoint, method, userData);
            await renderUserManagementPanel();
        } catch(error) {
            userForm.querySelector('.modal-error-message').textContent = error.message;
        }
    });

    // --- Feature Logic: Category Management ---
    manageCategoriesBtn.addEventListener('click', () => {
        renderCategoryManagerList();
        showModal(categoryManagementModal);
    });

    const renderCategoryManagerList = () => {
        categoryManagerList.innerHTML = '';
        allCategories.forEach(cat => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="category-name">${cat.name}</span><div class="category-item-actions"><button class="edit-cat-btn" title="编辑"><i class="fas fa-pencil-alt"></i></button><button class="delete-cat-btn" title="删除"><i class="fas fa-trash-alt"></i></button></div>`;
            li.querySelector('.edit-cat-btn').addEventListener('click', () => handleEditCategory(cat));
            li.querySelector('.delete-cat-btn').addEventListener('click', () => handleDeleteCategory(cat));
            categoryManagerList.appendChild(li);
        });
    };

    addCategoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('new-category-name');
        const name = input.value.trim();
        if (name) {
            try {
                await apiRequest('/categories', 'POST', { name });
                input.value = '';
                const data = await apiRequest('/data');
                allCategories = data.categories || [];
                renderCategoryManagerList();
                renderCategories();
            } catch (error) {
                alert(`添加失败: ${error.message}`);
            }
        }
    });

    const handleEditCategory = async (category) => {
        const newName = prompt('输入新的分类名称:', category.name);
        if (newName && newName.trim() !== '' && newName.trim() !== category.name) {
            try {
                await apiRequest(`/categories/${category.id}`, 'PUT', { name: newName.trim() });
                const data = await apiRequest('/data');
                allCategories = data.categories || [];
                renderCategoryManagerList();
                renderCategories();
            } catch (error) {
                alert(`编辑失败: ${error.message}`);
            }
        }
    };
    
    const handleDeleteCategory = async (category) => {
        if (await showConfirmDialog('确认删除分类', `确定要删除分类 "${category.name}" 吗？`)) {
            try {
                await apiRequest(`/categories/${category.id}`, 'DELETE');
                const data = await apiRequest('/data');
                allCategories = data.categories || [];
                renderCategoryManagerList();
                renderCategories();
            } catch (error) {
                alert(`删除失败: ${error.message}`);
            }
        }
    };

    // --- Initial Load ---
    applyTheme(localStorage.getItem('theme') || 'light-theme');
    checkLoginStatus();
});
