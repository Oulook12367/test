document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const appLayout = document.getElementById('app-layout');
    const themeToggleButton = document.getElementById('theme-toggle');
    const localSearchInput = document.getElementById('local-search');
    const searchEngineSelect = document.getElementById('search-engine');
    const bookmarksGrid = document.getElementById('bookmarks-grid');
    const categoryNav = document.getElementById('category-nav');
    const staticNav = document.getElementById('static-nav');
    const logoutButton = document.getElementById('logout-btn');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const mobileSidebarToggleBtn = document.getElementById('mobile-sidebar-toggle-btn'); // For smaller screens
    const actionBtn = document.getElementById('action-btn');

    // --- State ---
    let allBookmarks = [], allCategories = [];

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
        if (mobileSidebarToggleBtn) mobileSidebarToggleBtn.innerHTML = `<i class="fas ${isCollapsed ? 'fa-bars' : 'fa-times'}"></i>`;
        localStorage.setItem('sidebarCollapsed', isCollapsed);
    };

    // --- Data Loading & Rendering ---
    async function initializePage() {
        try {
            const data = await apiRequest('data');
            
            // If in private mode and user is not authenticated (API call will fail), redirect to login
            // The catch block will handle this.
            
            // If public mode is enabled and there's no token, show public view
            if (data.publicModeEnabled && data.isPublic) {
                allCategories = data.categories || [];
                allBookmarks = (data.bookmarks || []).map((bm, index) => ({...bm, sortOrder: bm.sortOrder ?? index}));
                updateHeader(true); // Show login button
                renderUI();
                appLayout.style.display = 'flex';
                return;
            }

            // If we have a token, data.isPublic will be undefined.
            if (!data.isPublic) {
                allCategories = data.categories || [];
                allBookmarks = (data.bookmarks || []).map((bm, index) => ({...bm, sortOrder: bm.sortOrder ?? index}));
                updateHeader(false); // Show admin/logout buttons
                renderUI();
                appLayout.style.display = 'flex';
                return;
            }

        } catch (error) {
            // If token is invalid/expired (401) or any other auth error, redirect to login.
            localStorage.removeItem('jwt_token');
            window.location.href = 'login.html';
        } finally {
            document.body.classList.remove('is-loading');
        }
    }

    const renderUI = () => {
        renderCategories();
        renderBookmarks(document.querySelector('.sidebar .active')?.dataset.id || 'all', localSearchInput.value);
    };
    
    function updateHeader(isPublic) {
        if (isPublic) {
            actionBtn.innerHTML = '<i class="fas fa-key"></i> 登录';
            actionBtn.onclick = () => window.location.href = 'login.html';
            actionBtn.style.display = 'inline-flex';
            logoutButton.style.display = 'none';
        } else {
            const token = localStorage.getItem('jwt_token');
            if(token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if(payload.roles && payload.roles.includes('admin')) {
                    actionBtn.innerHTML = '<i class="fas fa-cogs"></i> 管理后台';
                    actionBtn.onclick = () => window.location.href = 'admin.html';
                    actionBtn.style.display = 'inline-flex';
                } else {
                    actionBtn.style.display = 'none';
                }
                logoutButton.style.display = 'inline-flex';
            }
        }
    }

    const renderCategories = () => {
        const activeId = document.querySelector('.sidebar .active')?.dataset.id || 'all';
        categoryNav.innerHTML = '';
        staticNav.innerHTML = '';
        
        const allLi = document.createElement('li');
        allLi.dataset.id = 'all';
        allLi.innerHTML = `<i class="fas fa-inbox fa-fw"></i><span>全部书签</span>`;
        allLi.classList.add('active'); // Default active
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
    if (mobileSidebarToggleBtn) mobileSidebarToggleBtn.addEventListener('click', toggleSidebar);

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

    document.querySelector('.sidebar').addEventListener('click', (e) => {
        const clickedLi = e.target.closest('li');
        if (!clickedLi) return;
        document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
        clickedLi.classList.add('active');
        renderBookmarks(clickedLi.dataset.id, localSearchInput.value);
    });

    // --- Initial Load ---
    applyTheme(localStorage.getItem('theme') || 'dark-theme');
    applySidebarState(localStorage.getItem('sidebarCollapsed') === 'true');
    initializePage();
});
