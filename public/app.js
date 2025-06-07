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
// 【新增】用于存储折叠状态的 Set，并从 localStorage 初始化
const savedCollapsedState = localStorage.getItem('collapsedCategories');
let collapsedCategories = savedCollapsedState ? new Set(JSON.parse(savedCollapsedState)) : new Set();



// 【新增】递归获取所有子分类ID的辅助函数
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
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const options = { 
        method, 
        headers,
        cache: 'no-cache', // 【重要】新增此行，禁止浏览器缓存API请求
    };
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
        await apiRequest('data', 'PUT', {
            categories: allCategories,
            bookmarks: allBookmarks
        });
    } catch (error) {
        alert('顺序保存失败: ' + error.message);
        // 如果保存失败，重新加载服务器数据以恢复同步
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
    
   
/**
 * @description 登出并彻底重置应用状态
 */
const logoutAndReset = () => {
    // 1. 清除存储的凭证
    localStorage.removeItem('jwt_token');

    // 2. 清除所有内存中的状态变量
    allBookmarks = [];
    allCategories = [];
    allUsers = [];
    currentUser = null;
    isGuestView = false;

    // 3. 强制将UI重置到登录页面，而不是依赖 checkLoginStatus 去判断
    //    这确保了用户登出后总能回到一个确定的、干净的起点。
    showLoginPage(); 
};

logoutButton.addEventListener('click', () => {
    // 当处于公共访客视图时，此按钮的功能是“去登录”
    if (isGuestView) {
        showLoginPage();
    } else {
        // 当处于登录状态时，此按钮的功能是“退出登录”
        logoutAndReset();
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


// 代码二 (app.js) 的修改

const renderCategories = () => {
    const activeId = document.querySelector('.sidebar .active')?.dataset.id || 'all';
    
    categoryNav.innerHTML = '';
    staticNav.innerHTML = ''; // 假设您已采纳了上一轮“按钮置底”的修改

    // --- “全部书签”按钮的逻辑 ---
    const allLi = document.createElement('li');
    allLi.dataset.id = 'all';
    allLi.innerHTML = `<i class="fas fa-inbox"></i><span>全部书签</span>`;
    staticNav.appendChild(allLi);

    // --- 渲染可折叠的分类树 ---
    // 1. 预先计算出哪些分类拥有子分类
    const categoriesWithChildren = new Set(allCategories.map(cat => cat.parentId).filter(id => id !== null));

    const buildTree = (parentId, level) => {
        allCategories
            .filter(cat => cat.parentId === parentId)
            .forEach(cat => {
                const li = document.createElement('li');
                li.dataset.id = cat.id;
                li.style.paddingLeft = `${level * 20}px`;

                let iconHtml = '';
                const isParent = categoriesWithChildren.has(cat.id);
                const isCollapsed = collapsedCategories.has(cat.id);

                // 2. 如果是父分类，则添加可点击的折叠/展开箭头
                if (isParent) {
                    const iconClass = isCollapsed ? 'fa-caret-right' : 'fa-caret-down';
                    iconHtml = `<i class="fas ${iconClass} category-toggle"></i>`;
                } else {
                    // 为非父分类添加一个占位符，以保持对齐
                    iconHtml = `<span class="category-toggle-placeholder"></span>`;
                }

                li.innerHTML = `
                    ${iconHtml}
                    <i class="fas fa-folder"></i>
                    <span>${escapeHTML(cat.name)}</span>
                `;
                
                categoryNav.appendChild(li);

                // 3. 如果当前分类是展开状态，则递归渲染其子分类
                if (isParent && !isCollapsed) {
                    buildTree(cat.id, level + 1);
                }
            });
    };
    buildTree(null, 1); // 从根节点开始构建

    // --- 恢复激活状态 ---
    const newActiveLi = document.querySelector(`.sidebar li[data-id="${activeId}"]`) || staticNav.querySelector(`li[data-id="all"]`);
    if(newActiveLi) newActiveLi.classList.add('active');
};
    


// 找到旧的 document.querySelector('.sidebar').addEventListener... 并完整替换
document.querySelector('.sidebar').addEventListener('click', (e) => {
    const clickedLi = e.target.closest('li');
    if (!clickedLi || !clickedLi.closest('.category-nav') || clickedLi.classList.contains('sortable-ghost')) return;

    // 判断点击的是否是折叠/展开箭头
    if (e.target.classList.contains('category-toggle')) {
        e.stopPropagation(); // 阻止事件冒泡，避免触发分类选择
        const catId = clickedLi.dataset.id;
        
        // 更新折叠状态
        if (collapsedCategories.has(catId)) {
            collapsedCategories.delete(catId);
        } else {
            collapsedCategories.add(catId);
        }

        // 将新状态保存到 localStorage
        localStorage.setItem('collapsedCategories', JSON.stringify(Array.from(collapsedCategories)));
        
        // 重新渲染分类列表以应用折叠/展开效果
        renderCategories();

    } else {
        // 如果点击的不是箭头，则执行原有的“选择分类”逻辑
        document.querySelectorAll('.sidebar .category-nav li').forEach(li => li.classList.remove('active'));
        clickedLi.classList.add('active');
        renderBookmarks(clickedLi.dataset.id, localSearchInput.value);
    }
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

 // 代码二 (app.js) 的修改
// 代码二 (app.js) 的修改
const handleDeleteBookmark = (bookmark) => {
    showConfirm('确认删除', `您确定要删除书签 "${escapeHTML(bookmark.name)}" 吗？`, async () => {
        const bookmarkIdToDelete = bookmark.id;
        
        // 【乐观更新 - 步骤1】备份当前状态，以备回滚
        const originalBookmarks = [...allBookmarks];

        // 【乐观更新 - 步骤2】立即从内存中移除书签，并刷新UI，界面瞬间变化
        allBookmarks = allBookmarks.filter(bm => bm.id !== bookmarkIdToDelete);
        renderUI();

        try {
            // 【乐观更新 - 步骤3】在后台发送API请求
            await apiRequest(`bookmarks/${bookmarkIdToDelete}`, 'DELETE');
            // 成功则万事大吉
        } catch (error) {
            // 【乐观更新 - 步骤4】如果API请求失败，回滚UI
            alert(`删除失败: ${error.message}`);
            allBookmarks = originalBookmarks; // 恢复备份
            renderUI(); // 再次刷新UI，让书签“回来”
        }
    });
};

   // 代码二 (app.js) 的修改
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

    hideAllModals();

    if (id) {
        // --- 编辑书签的乐观更新 ---
        const originalBookmarks = JSON.parse(JSON.stringify(allBookmarks)); // 深拷贝备份
        const bookmarkIndex = allBookmarks.findIndex(bm => bm.id === id);
        
        if (bookmarkIndex > -1) {
            allBookmarks[bookmarkIndex] = { ...allBookmarks[bookmarkIndex], ...data };
            renderUI(); // 立即应用编辑
        }

        try {
            await apiRequest(`bookmarks/${id}`, 'PUT', data);
        } catch (error) {
            errorEl.textContent = error.message;
            allBookmarks = originalBookmarks; // 编辑失败，回滚
            renderUI();
            showModal(bookmarkModal); // 重新打开模态框让用户看到错误
        }

    } else {
        // --- 添加新书签的乐观更新 ---
        const tempId = `temp-${Date.now()}`; // 创建一个临时ID
        const newBookmark = { ...data, id: tempId };
        allBookmarks.push(newBookmark);
        renderUI(); // 立即显示新书签

        try {
            const savedBookmark = await apiRequest('bookmarks', 'POST', data);
            // 成功后，用服务器返回的真实数据（包含真实ID）替换掉临时书签
            const tempIndex = allBookmarks.findIndex(bm => bm.id === tempId);
            if (tempIndex > -1) {
                allBookmarks[tempIndex] = savedBookmark;
                // 可以在这里再次调用 renderUI() 来更新ID，但通常不影响显示，所以可选
            }
        } catch (error) {
            errorEl.textContent = error.message;
            // 添加失败，从UI中移除这个临时书签
            allBookmarks = allBookmarks.filter(bm => bm.id !== tempId);
            renderUI();
            showModal(bookmarkModal); // 重新打开模态框
        }
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
        
        // 先移除输入框，恢复显示
        nameSpan.style.display = '';
        editBtn.style.display = '';
        input.remove();

        if (newName && newName !== originalName) {
            const errorEl = document.getElementById('category-error-message');
            errorEl.textContent = '';
            
            // --- 编辑分类的乐观更新 ---
            const originalCategories = JSON.parse(JSON.stringify(allCategories)); // 备份
            const categoryToUpdate = allCategories.find(c => c.id === category.id);
            if(categoryToUpdate) {
                categoryToUpdate.name = newName; // 立即更新内存数据
                renderUI(); // 立即刷新UI
            }

            try {
                await apiRequest(`categories/${category.id}`, 'PUT', { name: newName });
            } catch (error) {
                errorEl.textContent = error.message;
                allCategories = originalCategories; // 失败，回滚
                renderUI();
            }
        }
    };

        
        input.addEventListener('blur', finishEditing);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finishEditing(); }
            else if (e.key === 'Escape') { nameSpan.style.display = ''; editBtn.style.display = ''; input.remove(); }
        });
    };

// 代码二 (app.js) 的修改
// 代码二 (app.js) 的修改
bulkDeleteCatBtn.addEventListener('click', () => {
    const checkedBoxes = categoryManagerList.querySelectorAll('input[type="checkbox"]:checked');
    const idsToDelete = Array.from(checkedBoxes).map(cb => cb.dataset.id);

    if (idsToDelete.length === 0) {
        return alert('请先选择要删除的分类。');
    }
    
    showConfirm('确认强制删除', `确定要删除选中的 ${idsToDelete.length} 个分类及其所有子分类吗？其下的所有书签也将被一并删除！`, async () => {
        const errorEl = document.getElementById('category-error-message');
        errorEl.textContent = '';

        // --- 【修改】乐观更新逻辑 ---
        const originalCategories = [...allCategories];
        const originalBookmarks = [...allBookmarks];

        // 1. 【重要】调用辅助函数，获取包含所有子孙后代的完整ID列表
        const allIdsToDeleteSet = getRecursiveCategoryIds(idsToDelete);

        // 2. 使用完整的ID Set来执行过滤，确保所有相关项都被移除
        allCategories = allCategories.filter(c => !allIdsToDeleteSet.has(c.id));
        allBookmarks = allBookmarks.filter(bm => !allIdsToDeleteSet.has(bm.categoryId));
        
        // 3. 立即刷新UI
        renderUI(); 
        hideAllModals();

        try {
            // API请求只发送用户最初选择的ID，后端会处理递归
            await apiRequest('categories', 'DELETE', { ids: idsToDelete });
        } catch (error) {
            // 如果失败，则回滚前端状态
            alert(`删除失败: ${error.message}`);
            allCategories = originalCategories;
            allBookmarks = originalBookmarks;
            renderUI();
        }
    });
});

   // 代码二 (app.js) 的修改
addCategoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('new-category-name');
    const name = input.value.trim();
    const errorEl = document.getElementById('category-error-message');
    errorEl.textContent = '';
    
    if(!name) {
        errorEl.textContent = '分类名称不能为空';
        return;
    }
    
    input.value = ''; // 立即清空输入框

    // --- 添加分类的乐观更新 ---
    const tempId = `temp-cat-${Date.now()}`;
    const newCategory = { id: tempId, name, parentId: null };
    allCategories.push(newCategory);
    renderUI(); // 立即刷新UI显示新分类

    try {
        const savedCategory = await apiRequest('categories', 'POST', { name });
        // 成功后，用服务器返回的真实ID替换临时ID
        const tempCat = allCategories.find(c => c.id === tempId);
        if(tempCat) tempCat.id = savedCategory.id;
    } catch (error) {
        errorEl.textContent = error.message;
        // 失败，从内存中移除临时分类
        allCategories = allCategories.filter(c => c.id !== tempId);
        renderUI();
    }
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

