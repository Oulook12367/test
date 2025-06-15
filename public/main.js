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
    const mobileSidebarToggleBtn = document.getElementById('mobile-sidebar-toggle');
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
    
    const applySidebarState = (isCollapsed) => {
        if (appLayout) {
            appLayout.classList.toggle('sidebar-collapsed', isCollapsed);
            localStorage.setItem('sidebarCollapsed', isCollapsed);
        }
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
                     if(appLayout) appLayout.style.display = 'flex';
                     return;
                 }
                 throw new Error("No token and not in public mode.");
            }
            
            let currentUsername = '';
            try { currentUsername = parseJwtPayload(token).sub; } 
            catch (e) { throw new Error("Invalid token."); }

            const data = await apiRequest('data');
            const userFromServer = data.users.find(u => u.username === currentUsername);
            if (!userFromServer) { throw new Error("Logged in user not found in data from server."); }
            
            allCategories = data.categories || [];
            allBookmarks = data.bookmarks || [];
            currentUser = userFromServer;
            updateHeader(false);
            renderUI();
            if(appLayout) appLayout.style.display = 'flex';

        } catch (error) {
            console.error("Initialization failed:", error);
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
                document.querySelector(`.sidebar li[data-id="all"]`)?.classList.add('active');
            }
        }
    };
    
    function updateHeader(isPublic) {
        if (!actionBtn || !logoutButton) return;
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
        if(!categoryNav || !sidebarFooterNav) return;
        categoryNav.innerHTML = '';
        sidebarFooterNav.innerHTML = '';
        const canSetDefault = currentUser && !currentUser.roles.includes('viewer');

        const allLi = document.createElement('li');
        allLi.dataset.id = 'all';
        let allStarHTML = '';
        if (canSetDefault) {
            allStarHTML = `<i class="star-icon ${'all' === currentUser.defaultCategoryId ? 'fas fa-star is-default' : 'far fa-star'}" data-cat-id="all" title="设为默认"></i>`;
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
                    starHTML = `<i class="star-icon ${node.id === currentUser.defaultCategoryId ? 'fas fa-star is-default' : 'far fa-star'}" data-cat-id="${node.id}" title="设为默认"></i>`;
                }
                li.innerHTML = `<i class="fas fa-folder fa-fw"></i><span>${escapeHTML(node.name)}</span>${starHTML}`;
                container.appendChild(li);
                if (node.children.length > 0) buildTreeUI(node.children, container, level + 1);
            }
        };
        buildTreeUI(tree, categoryNav, 0);
    };
    
    // [!!!] 核心修复：替换整个 renderBookmarks 函数
    const renderBookmarks = (categoryId = 'all', searchTerm = '') => {
        if (!bookmarksGrid) return;
        
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
        
        // --- [修复] 创建一个 map 用于快速查找分类的排序值 ---
        const categorySortMap = new Map(allCategories.map(cat => [cat.id, cat.sortOrder || 0]));

        // --- [修复] 更新排序逻辑，使其与 admin.js 保持一致 ---
        filteredBookmarks.sort((a, b) => {
            const catA_sort = categorySortMap.get(a.categoryId) || 0;
            const catB_sort = categorySortMap.get(b.categoryId) || 0;
            // 1. 首先比较分类的排序
            if (catA_sort !== catB_sort) {
                return catA_sort - catB_sort;
            }
            // 2. 如果分类相同，则比较书签自身的排序
            return (a.sortOrder || 0) - (b.sortOrder || 0);
        });
        
        bookmarksGrid.innerHTML = '';
        if(filteredBookmarks.length === 0){
            bookmarksGrid.innerHTML = '<p class="empty-message">这里什么都没有...</p>';
            return;
        }
        
        const fallbackIcon = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L8 12v1c0 1.1.9 2 2 2v1.93zM17.99 9.21c-.23-.6-.53-1.15-.9-1.64L13 12v-1c0-1.1-.9-2-2-2V7.07c3.95.49 7 3.85 7 7.93 0 .62-.08 1.21-.21 1.79z'/%3E%3C/svg%3E`;

        bookmarksGrid.innerHTML = filteredBookmarks.map(bm => {
            let domain = '';
            try { domain = new URL(bm.url).hostname; } catch (e) {}
            const gStaticIconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${domain}`;
            
            const finalIconSrc = bm.icon || gStaticIconUrl;
            
            return `<a href="${bm.url}" class="bookmark-card glass-pane" target="_blank" rel="noopener noreferrer">
                        <h3><img src="${finalIconSrc}" alt="" onerror="this.onerror=null;this.src='${fallbackIcon}'"> ${escapeHTML(bm.name)}</h3>
                        <p>${escapeHTML(bm.description || '')}</p>
                    </a>`;
        }).join('');
    };

    // --- Event Listeners ---
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => applySidebarState(!appLayout.classList.contains('sidebar-collapsed')));
    }
    if (mobileSidebarToggleBtn) {
        mobileSidebarToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (appLayout) appLayout.classList.toggle('sidebar-open');
        });
    }
    if (appLayout) {
        appLayout.addEventListener('click', (e) => {
            if (e.target === appLayout) {
                 appLayout.classList.remove('sidebar-open');
            }
        });
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            localStorage.removeItem('jwt_token');
            window.location.href = 'login.html';
        });
    }
    if (localSearchInput) {
        localSearchInput.addEventListener('keyup', debounce((e) => {
            renderBookmarks(document.querySelector('.sidebar .active')?.dataset.id || 'all', e.target.value);
        }, 250));
        localSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.value.trim() !== '') {
                window.open(searchEngineSelect.value + encodeURIComponent(e.target.value.trim()), '_blank');
            }
        });
    }
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.addEventListener('click', async (e) => {
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
                if(appLayout) appLayout.classList.remove('sidebar-open');
                document.querySelectorAll('.sidebar li').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                renderBookmarks(li.dataset.id, localSearchInput.value);
            }
        });
    }
    
    initializePage();
});
