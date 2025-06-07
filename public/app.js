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
    const userFormPermissions = document.getElementById('user-form-permissions');
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
        themeToggleButton.innerHTML = theme === 'dark-theme' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
        localStorage.setItem('theme', theme);
    };
    themeToggleButton.addEventListener('click', () => applyTheme(document.body.classList.contains('light-theme') ? 'dark-theme' : 'light-theme'));

    // --- Authentication ---
    const checkLoginStatus = async () => {
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
    };

    const updateButtonVisibility = () => {
        addBookmarkBtn.style.display = currentUser?.permissions?.canEditBookmarks ? 'flex' : 'none';
        manageCategoriesBtn.style.display = currentUser?.permissions?.canEditCategories ? 'block' : 'none';
        userManagementBtn.style.display = currentUser?.permissions?.canEditUsers ? 'flex' : 'none';
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
                editBtn.addEventListener('click', (e) => { e.preventDefault(); handleEditBookmark(bm); });
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
    const showModal = (modal) => { modalBackdrop.style.display = 'block'; modal.style.display = 'flex'; };
    const hideAllModals = () => { modalBackdrop.style.display = 'none'; document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); };
    modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) hideAllModals(); });
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', hideAllModals));
    const showConfirm = (title, text, onConfirm) => {
        confirmTitle.textContent = title;
        confirmText.textContent = text;
        showModal(confirmModal);
        confirmBtnYes.onclick = async () => { hideAllModals(); await onConfirm(); };
    };
    document.getElementById('confirm-btn-no').onclick = hideAllModals;

    // --- Bookmark Logic ---
    addBookmarkBtn.addEventListener('click', () => {
        bookmarkModalTitle.textContent = '添加新书签';
        bookmarkForm.reset();
        bookmarkForm.querySelector('.modal-error-message').textContent = '';
        bookmarkForm.querySelector('#bm-id').value = '';
        const categorySelect = bookmarkForm.querySelector('#bm-category');
        categorySelect.innerHTML = '';
        const creatableCategories = allCategories.filter(cat => currentUser.permissions.visibleCategories.includes(cat.id));
        if (creatableCategories.length === 0) { alert('没有可添加书签的分类！'); return; }
        creatableCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            categorySelect.appendChild(option);
        });
        showModal(bookmarkModal);
    });

    const handleEditBookmark = (bookmark) => {
        // (Logic is similar to add, omitted for brevity but should be implemented)
    };
    
    const handleDeleteBookmark = async (bookmark) => {
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

    // --- Category Management ---
    manageCategoriesBtn.addEventListener('click', async () => {
        await renderCategoryManagerList();
        showModal(categoryManagementModal);
    });

    const renderCategoryManagerList = () => {
        categoryManagerList.innerHTML = '';
        allCategories.forEach(cat => {
            const li = document.createElement('li');
            const span = document.createElement('span');
            span.className = 'category-name';
            span.textContent = cat.name; // 安全
            
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
            await loadData(); // 重新加载所有数据以更新UI
            await renderCategoryManagerList(); // 重新渲染分类管理器列表
        } catch (error) { alert(`添加失败: ${error.message}`); }
    });
    
    const handleDeleteCategory = (category) => {
        showConfirm('确认删除分类', `确定要删除分类 "${escapeHTML(category.name)}" 吗？`, async () => {
            try {
                await apiRequest(`categories/${category.id}`, 'DELETE');
                await loadData(); // 重新加载所有数据
                // 检查模态框是否仍然可见，如果可见则重新渲染
                if(categoryManagementModal.style.display === 'flex'){
                    await renderCategoryManagerList();
                }
            } catch (error) { alert(`删除失败: ${error.message}`); }
        });
    };

    // --- User Management ---
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
                deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    showConfirm('确认删除用户', `确定删除用户 "${escapeHTML(user.username)}"?`, async () => {
                        await apiRequest(`users/${user.username}`, 'DELETE');
                        await loadData();
                        renderUserManagementPanel();
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

    const populateUserForm = (user) => {
        // ... (Implementation for populating user form based on selected user)
        // This part needs careful implementation of checkbox states for roles and categories
    };
    
    const clearUserForm = () => {
        userForm.reset();
        // ... (Implementation to clear the form for adding a new user)
    };

    userForm.addEventListener('submit', async (e) => {
        // ... (Submit logic for adding/updating users, similar to bookmarks/categories)
    });

    // --- Initial Load ---
    applyTheme(localStorage.getItem('theme') || 'light-theme');
    checkLoginStatus();
});
