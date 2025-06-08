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
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmText = document.getElementById('confirm-text');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');
    const adminPanelBtn = document.getElementById('admin-panel-btn');
    const adminPanel = document.getElementById('admin-panel');
    const adminPanelNav = document.querySelector('.admin-panel-nav');
    const adminTabContents = document.querySelectorAll('.admin-tab-content');

    // --- State ---
    let allBookmarks = [], allCategories = [], allUsers = [], currentUser = null, isGuestView = false;
    let tempCategories = [];

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
    
    // --- UI Flow, Theme, Modals ---
    const applyTheme = (theme) => {
        document.body.className = theme;
        themeToggleButton.innerHTML = theme === 'dark-theme' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
        localStorage.setItem('theme', theme);
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
    
    const showModal = (modal) => { modalBackdrop.style.display = 'flex'; modal.style.display = 'flex'; };
    const hideAllModals = () => { modalBackdrop.style.display = 'none'; document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); };
    const showConfirm = (title, text, onConfirm) => {
        confirmTitle.textContent = title;
        confirmText.textContent = text;
        showModal(confirmModal);
        confirmBtnYes.onclick = () => { hideAllModals(); onConfirm(); };
    };

    // --- Data Loading & Rendering ---
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
    };
    
    const updateButtonVisibility = () => {
        const isAdmin = !isGuestView && currentUser?.roles?.includes('admin');
        adminPanelBtn.style.display = isAdmin ? 'flex' : 'none';
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

        const sortedCategories = [...allCategories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        
        const categoryMap = new Map(sortedCategories.map(cat => [cat.id, { ...cat, children: [] }]));
        const tree = [];
        for (const cat of sortedCategories) {
            if (cat.parentId && categoryMap.has(cat.parentId)) {
                categoryMap.get(cat.parentId).children.push(categoryMap.get(cat.id));
            } else {
                tree.push(categoryMap.get(cat.id));
            }
        }

        const buildTreeUI = (nodes, container, level) => {
            for (const node of nodes) {
                const li = document.createElement('li');
                li.dataset.id = node.id;
                li.style.paddingLeft = `${15 + level * 20}px`;
                li.innerHTML = `<i class="fas fa-folder fa-fw"></i><span>${escapeHTML(node.name)}</span>`;
                container.appendChild(li);
                if (node.children.length > 0) {
                    buildTreeUI(node.children, container, level + 1);
                }
            }
        };

        buildTreeUI(tree, categoryNav, 0);

        const newActiveLi = document.querySelector(`.sidebar li[data-id="${activeId}"]`) || staticNav.querySelector(`li[data-id="all"]`);
        if(newActiveLi) newActiveLi.classList.add('active');
    };
    
    const renderBookmarks = (categoryId = 'all', searchTerm = '') => {
        bookmarksGrid.innerHTML = '';
        let categoryIdsToDisplay;
        if (categoryId === 'all') {
            categoryIdsToDisplay = new Set(allCategories.map(c => c.id));
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
            bookmarksGrid.appendChild(card);
        });
    };

    // --- Event Listeners ---
    themeToggleButton.addEventListener('click', () => applyTheme(document.body.classList.contains('light-theme') ? 'dark-theme' : 'light-theme'));
    
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

    logoutButton.addEventListener('click', () => isGuestView ? showLoginPage() : logoutAndReset());

    localSearchInput.addEventListener('keyup', (e) => {
        renderBookmarks(document.querySelector('.sidebar .active')?.dataset.id || 'all', e.target.value);
        if (e.key === 'Enter' && e.target.value.trim() !== '') {
            window.open(searchEngineSelect.value + encodeURIComponent(e.target.value.trim()), '_blank');
        }
    });

    document.querySelector('.sidebar').addEventListener('click', (e) => {
        const clickedLi = e.target.closest('li');
        if (!clickedLi) return;
        document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
        clickedLi.classList.add('active');
        renderBookmarks(clickedLi.dataset.id, localSearchInput.value);
    });

    modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) hideAllModals(); });
    document.getElementById('confirm-btn-no').onclick = hideAllModals;


    // --- ADMIN PANEL LOGIC ---
    adminPanelBtn.addEventListener('click', () => {
        renderCategoryAdminTab();
        renderUserAdminTab();
        renderBookmarkAdminTab();
        adminPanelNav.querySelector('.admin-tab-link').click(); // Activate first tab
        showModal(adminPanel);
    });
    
    document.querySelector('#admin-panel .close-btn').addEventListener('click', hideAllModals);

    adminPanelNav.addEventListener('click', (e) => {
        e.preventDefault();
        const link = e.target.closest('.admin-tab-link');
        if (!link) return;
        adminPanelNav.querySelectorAll('.admin-tab-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const tabId = link.dataset.tab;
        adminTabContents.forEach(content => {
            content.classList.toggle('active', content.id === tabId);
        });
    });

    // --- Tab 1: Category Management ---
    const renderCategoryAdminTab = () => {
        tempCategories = JSON.parse(JSON.stringify(allCategories));
        const listEl = document.getElementById('category-admin-list');
        listEl.innerHTML = '';
        tempCategories.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
            const li = document.createElement('li');
            li.dataset.id = cat.id;
            li.innerHTML = `
                <input type="number" class="cat-order-input" value="${cat.sortOrder || 0}">
                <input type="text" class="cat-name-input" value="${escapeHTML(cat.name)}">
                <select class="cat-parent-select"></select>
                <button class="delete-cat-btn secondary danger" title="删除"><i class="fas fa-trash-alt"></i></button>
            `;
            const parentSelect = li.querySelector('.cat-parent-select');
            parentSelect.innerHTML = '<option value="">-- 顶级分类 --</option>';
            tempCategories.forEach(p => {
                if (p.id !== cat.id) {
                    const option = document.createElement('option');
                    option.value = p.id;
                    option.textContent = p.name;
                    parentSelect.appendChild(option);
                }
            });
            parentSelect.value = cat.parentId || '';
            li.querySelector('.delete-cat-btn').onclick = () => {
                tempCategories = tempCategories.filter(c => c.id !== cat.id);
                renderCategoryAdminTab();
            };
            listEl.appendChild(li);
        });
    };

    document.getElementById('add-new-category-btn').addEventListener('click', () => {
        tempCategories.push({
            id: `new-${Date.now()}`,
            name: '新分类',
            parentId: null,
            sortOrder: (tempCategories.length > 0) ? Math.max(...tempCategories.map(c => c.sortOrder || 0)) + 10 : 0
        });
        renderCategoryAdminTab();
    });

    document.getElementById('save-categories-btn').addEventListener('click', async () => {
        const listItems = document.querySelectorAll('#category-admin-list li');
        let updatedCategories = [];
        let hasError = false;

        listItems.forEach(li => {
            const id = li.dataset.id;
            const name = li.querySelector('.cat-name-input').value.trim();
            if (!name) {
                alert('分类名称不能为空！');
                hasError = true;
            }
            updatedCategories.push({
                id: id.startsWith('new-') ? `cat-${Date.now()}-${Math.random()}`: id,
                sortOrder: parseInt(li.querySelector('.cat-order-input').value) || 0,
                name: name,
                parentId: li.querySelector('.cat-parent-select').value || null,
            });
        });

        if (hasError) return;

        try {
            await apiRequest('data', 'PUT', { categories: updatedCategories });
            alert('分类保存成功！');
            await loadData();
        } catch (error) {
            alert('保存失败: ' + error.message);
        }
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
            if (user.username !== currentUser?.username && user.username !== 'admin') {
                const delBtn = document.createElement('button');
                delBtn.className = 'danger';
                delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    showConfirm('删除用户', `确定删除用户 "${user.username}"?`, async () => {
                        try {
                            await apiRequest(`users/${user.username}`, 'DELETE');
                            await loadData();
                            renderUserAdminTab();
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
        renderUserFormCategories(user.permissions.visibleCategories, user.roles.includes('admin'));
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
        container.innerHTML = '';
        ['admin', 'editor', 'viewer'].forEach(role => {
            container.innerHTML += `
                <div>
                    <input type="checkbox" id="role-${role}" value="${role}" ${activeRoles.includes(role) ? 'checked' : ''}>
                    <label for="role-${role}">${role}</label>
                </div>`;
        });
    };

    const renderUserFormCategories = (visibleIds = [], isDisabled = false) => {
        const container = document.getElementById('user-form-categories');
        container.innerHTML = '';
        allCategories.forEach(cat => {
            container.innerHTML += `
                <div>
                    <input type="checkbox" id="cat-perm-${cat.id}" value="${cat.id}" ${visibleIds.includes(cat.id) ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                    <label for="cat-perm-${cat.id}">${escapeHTML(cat.name)}</label>
                </div>`;
        });
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
        if (!isEditing && !password) {
            errorEl.textContent = '新用户必须设置密码'; return;
        }
        const userData = {
            roles: Array.from(form.querySelectorAll('#user-form-roles input:checked')).map(cb => cb.value),
            permissions: { visibleCategories: Array.from(form.querySelectorAll('#user-form-categories input:checked')).map(cb => cb.value) }
        };
        if (password) userData.password = password;
        const endpoint = isEditing ? `users/${hiddenUsername}` : 'users';
        const method = isEditing ? 'PUT' : 'POST';
        if (!isEditing) userData.username = username;
        try {
            await apiRequest(endpoint, method, userData);
            await loadData();
            renderUserAdminTab();
        } catch(error) {
            errorEl.textContent = error.message;
        }
    };
    
    // --- Tab 3: Bookmark Management ---
    const renderBookmarkAdminTab = () => {
        const container = document.getElementById('bookmark-admin-list-container');
        const ul = document.createElement('ul');
        allBookmarks.forEach(bm => {
            const li = document.createElement('li');
            const category = allCategories.find(c => c.id === bm.categoryId);
            li.innerHTML = `
                <span class="bm-admin-name">${escapeHTML(bm.name)}</span>
                <span class="bm-admin-cat">${category ? escapeHTML(category.name) : '无分类'}</span>
                <div class="bm-admin-actions">
                    <button class="edit-bm-btn secondary" title="编辑"><i class="fas fa-pencil-alt"></i></button>
                    <button class="delete-bm-btn danger secondary" title="删除"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
            // Add event listeners for edit/delete here if needed
            ul.appendChild(li);
        });
        container.innerHTML = '';
        container.appendChild(ul);
    };


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
                const content = event.target.result;
                await parseAndImport(content);
                alert('书签导入成功！');
            } catch (error) {
                alert(`导入失败: ${error.message}`);
            }
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

        const parseNode = (node, parentId, sortOrder) => {
            const children = Array.from(node.children).filter(child => child.tagName === 'DT');
            let currentOrder = sortOrder;
            for (const child of children) {
                const folderHeader = child.querySelector('h3');
                const link = child.querySelector('a');

                if (folderHeader) {
                    const newCategoryId = generateId('cat');
                    importedCategories.push({
                        id: newCategoryId,
                        name: folderHeader.textContent.trim(),
                        parentId: parentId,
                        sortOrder: currentOrder++
                    });
                    const subList = child.nextElementSibling;
                    if (subList && subList.tagName === 'DL') {
                        parseNode(subList, newCategoryId, currentOrder);
                    }
                } else if (link) {
                    importedBookmarks.push({
                        id: generateId('bm'),
                        name: link.textContent.trim(),
                        url: link.href,
                        categoryId: parentId,
                        description: '',
                        icon: link.getAttribute('icon') || ''
                    });
                }
            }
        };

        const root = doc.querySelector('dl');
        if (root) parseNode(root, null, allCategories.length);
        
        if (importedCategories.length === 0 && importedBookmarks.length === 0) {
            throw new Error('未在文件中找到可导入的书签或文件夹。');
        }

        const finalCategories = [...allCategories, ...importedCategories];
        const finalBookmarks = [...allBookmarks, ...importedBookmarks];
        
        await apiRequest('data', 'PUT', { categories: finalCategories, bookmarks: finalBookmarks });
        await loadData();
    };

    // --- Initial Load ---
    applyTheme(localStorage.getItem('theme') || 'dark-theme');
    checkLoginStatus();
});
