document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const appLayout = document.getElementById('app-layout');
    const themeToggleButton = document.getElementById('theme-toggle');
    const localSearchInput = document.getElementById('local-search');
    const searchEngineSelect = document.getElementById('search-engine');
    const bookmarksGrid = document.getElementById('bookmarks-grid');
    const categoryNav = document.getElementById('category-nav');
    const sidebarFooterNav = document.getElementById('sidebar-footer-nav');
    const logoutButton = document.getElementById('logout-btn');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const actionBtn = document.getElementById('action-btn');

    // --- State ---
    let allBookmarks = [], allCategories = [], currentUser = null;

    // --- Helpers ---
    const getRecursiveCategoryIds = (initialIds, categories) => {
        const fullIdSet = new Set(initialIds);
        const queue = [...initialIds];
        while (queue.length > 0) {
            const parentId = queue.shift();
            const children = categories.filter(c => c.parentId === parentId);
            for (const child of children) {
                if (!fullIdSet.has(child.id)) {
                    fullIdSet.add(child.id);
                    queue.push(child.id);
                }
            }
        }
        return fullIdSet;
    };
    
    // --- UI Flow & Theme ---
    const applyTheme = (theme) => {
        document.body.className = theme;
        themeToggleButton.innerHTML = theme === 'dark-theme' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
        localStorage.setItem('theme', theme);
    };

    const applySidebarState = (isCollapsed) => {
        appLayout.classList.toggle('sidebar-collapsed', isCollapsed);
        const iconClass = isCollapsed ? 'fa-angle-double-right' : 'fa-angle-double-left';
        if (sidebarToggleBtn) sidebarToggleBtn.innerHTML = `<i class="fas ${iconClass}"></i>`;
        localStorage.setItem('sidebarCollapsed', isCollapsed);
    };

    // --- Data Loading & Rendering ---
    async function initializePage() {
        try {
            const data = await apiRequest('data');
            
            if (data.isPublic) { // Public mode
                allCategories = data.categories || [];
                allBookmarks = data.bookmarks || [];
                currentUser = { roles: ['viewer'], defaultCategoryId: 'all' }; // Mock user for public
                updateHeader(true);
            } else { // Logged-in user
                allCategories = data.categories || [];
                allBookmarks = data.bookmarks || [];
                currentUser = data.users[0]; // API returns a single user array
                updateHeader(false);
            }
            
            renderUI();
            appLayout.style.display = 'flex';

        } catch (error) {
            localStorage.removeItem('jwt_token');
            window.location.href = 'login.html';
        } finally {
            document.body.classList.remove('is-loading');
        }
    }

    const renderUI = () => {
        renderCategories();
        
        const activeId = document.querySelector('.sidebar .active')?.dataset.id;
        // 如果没有活动的项（首次加载），则使用用户的默认设置
        const initialIdToRender = activeId || currentUser.defaultCategoryId || 'all';
        renderBookmarks(initialIdToRender, localSearchInput.value);

        // 如果是首次加载，确保默认项被高亮
        if (!activeId) {
            const defaultLi = document.querySelector(`.sidebar li[data-id="${initialIdToRender}"]`);
            if (defaultLi) {
                defaultLi.classList.add('active');
            } else { // 如果默认分类不存在，则高亮“全部书签”
                document.querySelector(`.sidebar li[data-id="all"]`)?.classList.add('active');
            }
        }
    };
    
    function updateHeader(isPublic) {
        if (isPublic) {
            actionBtn.innerHTML = '<i class="fas fa-key"></i> 登录';
            actionBtn.onclick = () => window.location.href = 'login.html';
            actionBtn.style.display = 'inline-flex';
            logoutButton.style.display = 'none';
        } else {
            if(currentUser && currentUser.roles.includes('admin')) {
                actionBtn.innerHTML = '<i class="fas fa-cogs"></i> 管理后台';
                actionBtn.onclick = () => window.location.href = 'admin.html';
                actionBtn.style.display = 'inline-flex';
            } else {
                actionBtn.style.display = 'none';
            }
            logoutButton.style.display = 'inline-flex';
        }
    }

    const renderCategories = () => {
        categoryNav.innerHTML = '';
        sidebarFooterNav.innerHTML = '';
        
        // Render "All Bookmarks" to the footer
        const allLi = document.createElement('li');
        allLi.dataset.id = 'all';
        // 【修改】为“全部书签”也添加星星
        const allIsDefault = 'all' === currentUser.defaultCategoryId;
        const canSetDefault = currentUser.roles.includes('admin') || currentUser.roles.includes('editor');
        let allStarHTML = '';
        if (canSetDefault) {
            allStarHTML = `<i class="star-icon ${allIsDefault ? 'fas fa-star is-default' : 'far fa-star'}" data-cat-id="all"></i>`;
        }
        allLi.innerHTML = `<i class="fas fa-inbox fa-fw"></i><span>全部书签</span>${allStarHTML}`;
        sidebarFooterNav.appendChild(allLi);

        const sortedCategories = [...allCategories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
        
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

                let starHTML = '';
                if (canSetDefault) {
                    const isDefault = node.id === currentUser.defaultCategoryId;
                    starHTML = `<i class="star-icon ${isDefault ? 'fas fa-star is-default' : 'far fa-star'}" data-cat-id="${node.id}"></i>`;
                }

                li.innerHTML = `<i class="fas fa-folder fa-fw"></i><span>${escapeHTML(node.name)}</span>${starHTML}`;
                container.appendChild(li);
                if (node.children.length > 0) buildTreeUI(node.children, container, level + 1);
            }
        };

        buildTreeUI(tree, categoryNav, 0);
    };
    
    const renderBookmarks = (categoryId = 'all', searchTerm = '') => {
        let categoryIdsToDisplay;
        if (categoryId === 'all') {
            categoryIdsToDisplay = new Set(allCategories.map(c => c.id));
        } else {
            categoryIdsToDisplay = getRecursiveCategoryIds( [categoryId], allCategories);
        }
        let filteredBookmarks = allBookmarks.filter(bm => categoryIdsToDisplay.has(bm.categoryId));
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filteredBookmarks = filteredBookmarks.filter(bm => bm.name.toLowerCase().includes(lower) || bm.url.toLowerCase().includes(lower));
        }
        filteredBookmarks.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        
        bookmarksGrid.innerHTML = '';
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
            const defaultIcon = `https://www.google.com/s2/favicons?domain=${new URL(bm.url).hostname}`;
            card.innerHTML = `<h3><img src="${bm.icon || defaultIcon}" alt="" onerror="this.onerror=null;this.src='${defaultIcon}'"> ${escapeHTML(bm.name)}</h3><p>${escapeHTML(bm.description || '')}</p>`;
            bookmarksGrid.appendChild(card);
        });
    };

    // --- Event Listeners ---
    themeToggleButton.addEventListener('click', () => applyTheme(document.body.classList.contains('light-theme') ? 'dark-theme' : 'light-theme'));
    
    const toggleSidebar = () => applySidebarState(!appLayout.classList.contains('sidebar-collapsed'));
    if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);

    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwt_token');
        window.location.href = 'login.html';
    });
    
    localSearchInput.addEventListener('keyup', debounce((e) => {
        renderBookmarks(document.querySelector('.sidebar .active')?.dataset.id || 'all', e.target.value);
    }, 250));
    
    localSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.value.trim() !== '') {
            window.open(searchEngineSelect.value + encodeURIComponent(e.target.value.trim()), '_blank');
        }
    });

    // 【修改】统一处理侧边栏点击事件
    document.querySelector('.sidebar').addEventListener('click', async (e) => {
        const star = e.target.closest('.star-icon');
        const li = e.target.closest('li[data-id]');

        // 如果点击的是星星
        if (star) {
            e.stopPropagation(); // 阻止li的点击事件触发
            const newDefaultId = star.dataset.catId;
            if (newDefaultId === currentUser.defaultCategoryId) return; // 如果已经是默认，则不操作

            try {
                await apiRequest('users/self', 'PUT', { defaultCategoryId: newDefaultId });
                // 更新本地的用户对象，并重绘侧边栏以更新星星状态
                currentUser.defaultCategoryId = newDefaultId;
                renderCategories();
                // 重新高亮当前活动的项
                const activeLi = document.querySelector(`.sidebar li[data-id="${li.dataset.id}"]`);
                if(activeLi) activeLi.classList.add('active');
            } catch (error) {
                alert('设置失败: ' + error.message);
            }
            return;
        }

        // 如果点击的是列表项
        if (li) {
            document.querySelectorAll('.sidebar li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            renderBookmarks(li.dataset.id, localSearchInput.value);
        }
    });

    // --- Initial Load ---
    applyTheme(localStorage.getItem('theme') || 'dark-theme');
    applySidebarState(localStorage.getItem('sidebarCollapsed') === 'true');
    initializePage();
});
