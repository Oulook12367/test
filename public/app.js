// --- 辅助函数 ---
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

    // --- State ---
    let allBookmarks = [], allCategories = [], allUsers = [], currentUser = null, isGuestView = false;
    let draggedItem = null;

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
        if (categoryManagementModal.style.display === 'flex') renderCategoryManagerList();
        if (userManagementModal.style.display === 'flex') renderUserManagementPanel();
    };
    
    // The rest of the file is identical to the previous complete version
    const renderCategories = () => {
        const activeId = categoryNav.querySelector('.active')?.dataset.id || 'all';
        categoryNav.innerHTML = '';
        
        const allLi = document.createElement('li');
        allLi.dataset.id = 'all';
        allLi.innerHTML = `<i class="fas fa-inbox"></i><span>全部书签</span>`;
        categoryNav.appendChild(allLi);

        allCategories.forEach(cat => {
            const li = document.createElement('li');
            li.dataset.id = cat.id;
            li.innerHTML = `<i class="fas fa-folder"></i><span>${escapeHTML(cat.name)}</span>`;
            if (!isGuestView && currentUser?.permissions?.canEditCategories) {
                li.draggable = true;
            }
            categoryNav.appendChild(li);
        });
        
        const newActiveLi = categoryNav.querySelector(`li[data-id="${activeId}"]`) || categoryNav.querySelector(`li[data-id="all"]`);
        newActiveLi.classList.add('active');
    };
    
    categoryNav.addEventListener('click', (e) => {
        const clickedLi = e.target.closest('li');
        if (!clickedLi || !categoryNav.contains(clickedLi)) return;
        
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
            
            if (!isGuestView && currentUser?.permissions?.canEditBookmarks) {
                card.draggable = true;
                card.dataset.id = bm.id;
            }

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

    addBookmarkBtn.addEventListener('click', () => {
        bookmarkModalTitle.textContent = '添加新书签';
        bookmarkForm.reset();
        bookmarkForm.querySelector('.modal-error-message').textContent = '';
        bookmarkForm.querySelector('#bm-id').value = '';
        const categorySelect = bookmarkForm.querySelector('#bm-category');
        categorySelect.innerHTML = '';
        
        const creatableCategories = allCategories.filter(cat => currentUser.permissions.visibleCategories.includes(cat.id));
        if (creatableCategories.length === 0) {
            alert('没有可添加书签的分类！请先创建分类，或在用户管理中获取分类权限。');
            return;
        }
        creatableCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            categorySelect.appendChild(option);
        });
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
        categorySelect.innerHTML = '';
        const creatableCategories = allCategories.filter(cat => currentUser.permissions.visibleCategories.includes(cat.id));
        creatableCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            if (cat.id === bookmark.categoryId) {
                option.selected = true;
            }
            categorySelect.appendChild(option);
        });
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
        usernameInput.value = '';
        usernameInput.readOnly = false;
        userForm.querySelector('#user-form-username-hidden').value = '';
        userForm.querySelector('#user-form-password').placeholder = "必填";
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
        ['admin', 'editor', 'viewer'].forEach(role => {
            const id = `role-${role}`;
            const div = document.createElement('div');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = id;
            input.value = role;
            if (activeRoles.includes(role)) input.checked = true;
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

    // --- Drag and Drop Logic ---
    const persistOrder = async () => {
        try {
            await apiRequest('data', 'PUT', {
                categories: allCategories,
                bookmarks: allBookmarks
            });
        } catch (error) {
            alert('顺序保存失败: ' + error.message);
            await loadData();
        }
    };

    const setupDragDrop = (container, itemSelector, itemsArray) => {
        container.addEventListener('dragstart', e => {
            if (e.target.matches(itemSelector)) {
                draggedItem = e.target;
                setTimeout(() => e.target.classList.add('dragging'), 0);
            }
        });

        container.addEventListener('dragend', e => {
            if (e.target.matches(itemSelector) && e.target.classList.contains('dragging')) {
                e.target.classList.remove('dragging');
                draggedItem = null;
            }
        });
        
        container.addEventListener('dragover', e => {
            e.preventDefault();
            const afterElement = getDragAfterElement(container, e.clientY);
            const currentGap = container.querySelector('.drag-over-gap');
            if (currentGap) currentGap.remove();

            const gap = document.createElement('div');
            gap.className = 'drag-over-gap';
            if (afterElement == null) {
                container.appendChild(gap);
            } else {
                container.insertBefore(gap, afterElement);
            }
        });
        
        container.addEventListener('dragleave', e => {
            if (e.relatedTarget && !container.contains(e.relatedTarget)) {
                const currentGap = container.querySelector('.drag-over-gap');
                if (currentGap) currentGap.remove();
            }
        });

        container.addEventListener('drop', async e => {
            e.preventDefault();
            const currentGap = container.querySelector('.drag-over-gap');
            if (currentGap) currentGap.remove();
            
            if (!draggedItem) return;

            const fromId = draggedItem.dataset.id;
            const fromIndex = itemsArray.findIndex(item => item.id === fromId);
            
            const afterElement = getDragAfterElement(container, e.clientY);
            const toId = afterElement ? afterElement.dataset.id : null;
            
            if(fromId === toId) return;

            const toIndex = toId ? itemsArray.findIndex(item => item.id === toId) : itemsArray.length;

            if (fromIndex > -1) {
                const [itemToMove] = itemsArray.splice(fromIndex, 1);
                const adjustedToIndex = (fromIndex < toIndex) ? toIndex - 1 : toIndex;
                itemsArray.splice(adjustedToIndex, 0, itemToMove);
                
                renderUI();
                await persistOrder();
            }
        });
    };
    
    const getDragAfterElement = (container, y) => {
        const draggableElements = [...container.querySelectorAll(`${container === bookmarksGrid ? 'a' : 'li'}[draggable="true"]`)];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    };
    
    setupDragDrop(categoryNav, 'li[draggable="true"]', allCategories);
    setupDragDrop(bookmarksGrid, 'a[draggable="true"]', allBookmarks);

    // --- Initial Load ---
    applyTheme(localStorage.getItem('theme') || 'light-theme');
    checkLoginStatus();
});
