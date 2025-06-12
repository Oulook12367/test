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
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn'); // Desktop
    const mobileSidebarToggleBtn = document.getElementById('mobile-sidebar-toggle'); // Mobile
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
            const token = localStorage.getItem('jwt_token');

            if (!token) {
                 const publicData = await apiRequest('data');
                 if (publicData && publicData.isPublic) {
                    allCategories = publicData.categories || [];
                    allBookmarks = publicData.bookmarks || [];
                    currentUser = { roles: ['viewer'], defaultCategoryId: publicData.defaultCategoryId || 'all' };
                    updateHeader(true);
                    renderUI();
                    appLayout.style.display = 'flex';
                    return;
                 }
                 throw new Error("No token and not in public mode.");
            }
            
            let currentUsername = '';
            try {
                currentUsername = JSON.parse(atob(token.split('.')[1])).sub;
            } catch (e) {
                throw new Error("Invalid token.");
            }

            const data = await apiRequest('data');
            const userFromServer = data.users.find(u => u.username === currentUsername);

            if (!userFromServer) {
                throw new Error("Logged in user not found in data from server.");
            }
            
            allCategories = data.categories || [];
            allBookmarks = data.bookmarks || [];
            currentUser = userFromServer;
            updateHeader(false);
            
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
        const initialIdToRender = activeId || currentUser.defaultCategoryId || 'all';
        
        const isVisible = initialIdToRender === 'all' || allCategories.some(c => c.id === initialIdToRender);
        const finalIdToRender = isVisible ? initialIdToRender : 'all';

        renderBookmarks(finalIdToRender, localSearchInput.value);

        if (!activeId) {
            const defaultLi = document.querySelector(`.sidebar li[data-id="${finalIdToRender}"]`);
            if (defaultLi) {
                defaultLi.classList.add('active');
            } else {
                const allBookmarksLi = document.querySelector(`.sidebar li[data-id="all"]`);
                if(allBookmarksLi) allBookmarksLi.classList.add('active');
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
        
        const canSetDefault = currentUser && (currentUser.roles.includes('admin') || currentUser.roles.includes('editor'));

        const allLi = document.createElement('li');
        allLi.dataset.id = 'all';
        const allIsDefault = 'all' === currentUser.defaultCategoryId;
        let allStarHTML = '';
        if (canSetDefault) {
            allStarHTML = `<i class="star-icon ${allIsDefault ? 'fas fa-star is-default' : 'far fa-star'}" data-cat-id="all" title="设为默认"></i>`;
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
                    starHTML = `<i class="star-icon ${isDefault ? 'fas fa-star is-default' : 'far fa-star'}" data-cat-id="${node.id}" title="设为默认"></i>`;
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
        filteredBookmarks.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
        
        bookmarksGrid.innerHTML = '';
        if(filteredBookmarks.length === 0){
            bookmarksGrid.innerHTML = '<p class="empty-message">这里什么都没有...</p>';
            return;
        }
        bookmarksGrid.innerHTML = filteredBookmarks.map(bm => {
            let domain = '';
            try { domain = new URL(bm.url).hostname; } catch (e) {}
            const defaultIcon = `https://www.google.com/s2/favicons?sz=64&domain_url=${domain}`;
            return `<a href="${bm.url}" class="bookmark-card" target="_blank" rel="noopener noreferrer">
                        <h3><img src="${bm.icon || defaultIcon}" alt="" onerror="this.onerror=null;this.src='${defaultIcon}'"> ${escapeHTML(bm.name)}</h3>
                        <p>${escapeHTML(bm.description || '')}</p>
                    </a>`;
        }).join('');
    };

    // --- Event Listeners ---
    themeToggleButton.addEventListener('click', () => applyTheme(document.body.classList.contains('light-theme') ? 'dark-theme' : 'light-theme'));
    
    if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', () => applySidebarState(!appLayout.classList.contains('sidebar-collapsed')));
    
    // 【新增】移动端导航逻辑
    if (mobileSidebarToggleBtn) {
        mobileSidebarToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            appLayout.classList.toggle('sidebar-open');
        });
    }
    // 【新增】点击遮罩层关闭侧边栏
    appLayout.addEventListener('click', (e) => {
        if (e.target === appLayout) {
             appLayout.classList.remove('sidebar-open');
        }
    });


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

    document.querySelector('.sidebar').addEventListener('click', async (e) => {
        const star = e.target.closest('.star-icon');
        const li = e.target.closest('li[data-id]');

        if (star) {
            e.stopPropagation();
            const newDefaultId = star.dataset.catId;
            if (newDefaultId === currentUser.defaultCategoryId) return;

            try {
                await apiRequest('users/self', 'PUT', { defaultCategoryId: newDefaultId });
                currentUser.defaultCategoryId = newDefaultId;
                const currentActiveId = document.querySelector('.sidebar li.active')?.dataset.id;
                renderCategories();
                const activeLi = document.querySelector(`.sidebar li[data-id="${currentActiveId}"]`);
                if(activeLi) activeLi.classList.add('active');
            } catch (error) {
                alert('设置失败: ' + error.message);
            }
            return;
        }

        if (li) {
            appLayout.classList.remove('sidebar-open'); // 在移动端，点击后关闭侧边栏
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
