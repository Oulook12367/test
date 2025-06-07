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
    const adminActions = document.getElementById('admin-actions');
    const bookmarkModal = document.getElementById('bookmark-modal');
    const bookmarkModalTitle = document.getElementById('bookmark-modal-title');
    const bookmarkForm = document.getElementById('bookmark-form');
    const addBookmarkBtn = document.getElementById('add-bookmark-btn');
    const changePasswordBtn = document.getElementById('change-password-btn');
    const changePasswordModal = document.getElementById('change-password-modal');
    const changePasswordForm = document.getElementById('change-password-form');
    const userManagementBtn = document.getElementById('user-management-btn');
    const userManagementModal = document.getElementById('user-management-modal');
    const userList = document.getElementById('user-list');
    const userForm = document.getElementById('user-form');
    const userFormTitle = document.getElementById('user-form-title');
    const userFormClearBtn = document.getElementById('user-form-clear-btn');
    const userFormCategories = document.getElementById('user-form-categories');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmText = document.getElementById('confirm-text');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');
    const confirmBtnNo = document.getElementById('confirm-btn-no');

    // Category Management Elements
    const manageCategoriesBtn = document.getElementById('manage-categories-btn');
    const categoryManagementModal = document.getElementById('category-management-modal');
    const categoryManagerList = document.getElementById('category-manager-list');
    const addCategoryForm = document.getElementById('add-category-form');

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
    const applyTheme = (theme) => { /* ... existing logic ... */ };
    themeToggleButton.addEventListener('click', () => { /* ... existing logic ... */ });

    // --- Authentication ---
    const getToken = () => localStorage.getItem('jwt_token');
    const checkLoginStatus = async () => {
        if (getToken()) {
            loginContainer.style.display = 'none';
            appLayout.style.display = 'flex';
            await loadData();
        } else {
            loginContainer.style.display = 'block';
            appLayout.style.display = 'none';
            currentUser = null;
        }
    };
    loginForm.addEventListener('submit', async (e) => { /* ... existing logic ... */ });
    logoutButton.addEventListener('click', () => { /* ... existing logic ... */ });

    // --- Data Loading & Rendering ---
    const loadData = async () => {
        try {
            const data = await apiRequest('/data');
            allCategories = data.categories || [];
            allBookmarks = data.bookmarks || [];
            if (currentUser && currentUser.roles.includes('admin')) {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
            } else {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            }
            renderCategories();
            renderBookmarks();
        } catch (error) { /* ... existing logic ... */ }
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

    const renderBookmarks = (categoryId = 'all', searchTerm = '') => { /* ... existing logic ... */ };
    
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
    const showModal = (modalElement) => { /* ... existing logic ... */ };
    const hideAllModals = () => { /* ... existing logic ... */ };
    modalBackdrop.addEventListener('click', (e) => { /* ... existing logic ... */ });
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', hideAllModals));
    const showConfirmDialog = (title, text) => { /* ... existing logic ... */ };

    // --- Feature Logic: Bookmarks ---
    const handleEditBookmark = (bookmark) => { /* ... existing logic ... */ };
    const handleDeleteBookmark = async (bookmark) => { /* ... existing logic ... */ };
    addBookmarkBtn.addEventListener('click', () => { /* ... existing logic ... */ });
    bookmarkForm.addEventListener('submit', async (e) => { /* ... existing logic ... */ });

    // --- Feature Logic: Change Password ---
    changePasswordBtn.addEventListener('click', () => { /* ... existing logic ... */ });
    changePasswordForm.addEventListener('submit', async (e) => { /* ... existing logic ... */ });

    // --- Feature Logic: User Management ---
    userManagementBtn.addEventListener('click', async () => { /* ... existing logic ... */ });
    const renderUserManagementPanel = async () => { /* ... existing logic ... */ };
    const populateUserForm = (user) => { /* ... existing logic ... */ };
    const clearUserForm = () => { /* ... existing logic ... */ };
    userFormClearBtn.addEventListener('click', clearUserForm);
    userForm.addEventListener('submit', async (e) => { /* ... existing logic ... */ });

    // --- Feature Logic: Category Management ---
    manageCategoriesBtn.addEventListener('click', () => {
        renderCategoryManagerList();
        showModal(categoryManagementModal);
    });

    const renderCategoryManagerList = () => {
        categoryManagerList.innerHTML = '';
        allCategories.forEach(cat => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="category-name">${cat.name}</span>
                <div class="category-item-actions">
                    <button class="edit-cat-btn" title="编辑"><i class="fas fa-pencil-alt"></i></button>
                    <button class="delete-cat-btn" title="删除"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
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
        const confirmed = await showConfirmDialog('确认删除分类', `确定要删除分类 "${category.name}" 吗？`);
        if (confirmed) {
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
    checkLoginStatus();
});
