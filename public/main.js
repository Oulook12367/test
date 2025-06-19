// main.js

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Element Selectors ---
    const appLayout = document.getElementById('app-layout');
    const localSearchInput = document.getElementById('local-search');
    const searchEngineSelect = document.getElementById('search-engine');
    const bookmarksGrid = document.getElementById('bookmarks-grid');
    const categoryNav = document.getElementById('category-nav');
    const sidebarFooterNav = document.getElementById('sidebar-footer-nav');
    const logoutButton = document.getElementById('logout-btn');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const mobileSidebarToggleBtn = document.getElementById('mobile-sidebar-toggle');
    const actionBtn = document.getElementById('action-btn');

    // --- 2. State ---
    let allBookmarks = [], allCategories = [], currentUser = null;
    let categoryMap = new Map();

    // --- 3. 核心排序与辅助函数 ---
    function getHierarchicalSortedData(items, parentIdKey = 'parentId') {
        if (!Array.isArray(items)) return [];
        const itemMap = new Map(items.map(i => [i.id, {...i, children: []}]));
        const tree = [];
        const sortedList = [];

        items.forEach(i => {
            if (!i) return;
            const node = itemMap.get(i.id);
            if (i[parentIdKey] && itemMap.has(i[parentIdKey])) {
                const parent = itemMap.get(i[parentIdKey]);
                if(parent) parent.children.push(node);
            } else {
                tree.push(node);
            }
        });
        
        tree.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        function flattenTree(nodes, level, topLevelParentId = null) {
            nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            nodes.forEach(node => {
                node.level = level;
                node.topLevelParentId = topLevelParentId || node.id;
                sortedList.push(node);
                if (node.children.length > 0) {
                    flattenTree(node.children, level + 1, node.topLevelParentId);
                }
            });
        }

        flattenTree(tree, 0);
        return sortedList;
    }

    function getCategoryWithDescendants(categoryId) {
        const idSet = new Set([categoryId]);
        const queue = [categoryId];
        while (queue.length > 0) {
            const currentId = queue.shift();
            for (const cat of allCategories) {
                if (cat.parentId === currentId) {
                    if (!idSet.has(cat.id)) {
                        idSet.add(cat.id);
                        queue.push(cat.id);
                    }
                }
            }
        }
        return idSet;
    }


    // --- 4. Data Loading & Rendering ---
    async function initializePage() {
        try {
            const data = await apiRequest('data');
            
            allCategories = getHierarchicalSortedData(data.categories || []);
            categoryMap = new Map(allCategories.map(c => [c.id, c]));
            allBookmarks = data.bookmarks || [];

            if (data.isPublic) {
                currentUser = { roles: ['viewer'], defaultCategoryId: data.defaultCategoryId || 'all' };
                updateHeader(true);
            } else {
                const token = localStorage.getItem('jwt_token');
                const payload = token ? parseJwtPayload(token) : {};
                const usersArray = Array.isArray(data.users) ? data.users : Object.values(data.users);
                currentUser = usersArray.find(u => u.username === payload.sub);
                if (!currentUser) throw new Error("已登录用户未在服务器数据中找到。");
                updateHeader(false);
            }
            
            renderUI();
            if(appLayout) appLayout.style.display = 'flex';

        } catch (error) {
            console.error("页面初始化失败:", error);
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
            if (defaultLi) defaultLi.classList.add('active');
            else document.querySelector(`.sidebar li[data-id="all"]`)?.classList.add('active');
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
        const canSetDefault = currentUser && currentUser.username && !currentUser.roles.includes('viewer');

        const allLi = document.createElement('li');
        allLi.dataset.id = 'all';
        let allStarHTML = canSetDefault ? `<i class="star-icon ${'all' === currentUser.defaultCategoryId ? 'fas fa-star is-default' : 'far fa-star'}" data-cat-id="all" title="设为默认"></i>` : '';
        allLi.innerHTML = `<i class="fas fa-inbox fa-fw"></i><span>全部书签</span>${allStarHTML}`;
        sidebarFooterNav.appendChild(allLi);
        
        allCategories.forEach(cat => {
            const li = document.createElement('li');
            li.dataset.id = cat.id;
            li.style.paddingLeft = `${15 + (cat.level || 0) * 20}px`;
            let starHTML = canSetDefault ? `<i class="star-icon ${cat.id === currentUser.defaultCategoryId ? 'fas fa-star is-default' : 'far fa-star'}" data-cat-id="${cat.id}" title="设为默认"></i>` : '';
            li.innerHTML = `<i class="fas fa-folder fa-fw"></i><span>${escapeHTML(cat.name)}</span>${starHTML}`;
            categoryNav.appendChild(li);
        });
    };
    
    const renderBookmarks = (categoryId = 'all', searchTerm = '') => {
        if (!bookmarksGrid) return;
        
        let visibleCategoryIds = categoryId === 'all' 
            ? new Set(allCategories.map(c => c.id)) 
            : getCategoryWithDescendants(categoryId);

        let filteredBookmarks = allBookmarks.filter(bm => visibleCategoryIds.has(bm.categoryId));
        
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filteredBookmarks = filteredBookmarks.filter(bm => bm.name.toLowerCase().includes(lower) || bm.url.toLowerCase().includes(lower));
        }
        
        const categoryOrderMap = new Map(allCategories.map((cat, index) => [cat.id, index]));
        filteredBookmarks.sort((a, b) => {
            const orderA = categoryOrderMap.get(a.categoryId) ?? Infinity;
            const orderB = categoryOrderMap.get(b.categoryId) ?? Infinity;
            if (orderA !== orderB) return orderA - orderB;
            return (a.sortOrder || 0) - (b.sortOrder || 0);
        });
        
        bookmarksGrid.innerHTML = '';
        if(filteredBookmarks.length === 0){
            bookmarksGrid.innerHTML = '<p class="empty-message">这里什么都没有...</p>';
            return;
        }
        
        const fallbackIcon = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L8 12v1c0 1.1.9 2 2 2v1.93zM17.99 9.21c-.23-.6-.53-1.15-.9-1.64L13 12v-1c0-1.1-.9-2-2-2V7.07c3.95.49 7 3.85 7 7.93 0 .62-.08 1.21-.21 1.79z'/%3E%3C/svg%3E`;

        let htmlChunks = [];
        let previousCategoryId = null;

        filteredBookmarks.forEach((bm, index) => {
            const currentCategoryId = bm.categoryId;
            
            if (index > 0 && currentCategoryId !== previousCategoryId) {
                htmlChunks.push('<div class="bookmark-level-separator"></div>');
            }

            let domain = '';
            try { domain = new URL(bm.url).hostname; } catch (e) {}
            const gStaticIconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${domain}`;
            const finalIconSrc = bm.icon || gStaticIconUrl;
            
            // 【修复】只有在描述存在时才渲染<p>标签
            let descriptionHTML = '';
            if (bm.description && bm.description.trim() !== '') {
                descriptionHTML = `<p>${escapeHTML(bm.description)}</p>`;
            }

            htmlChunks.push(
                `<a href="${bm.url}" class="bookmark-card glass-pane" target="_blank" rel="noopener noreferrer">
                    <h3><img src="${finalIconSrc}" alt="" onerror="this.onerror=null;this.src='${fallbackIcon}'"> ${escapeHTML(bm.name)}</h3>
                    ${descriptionHTML}
                </a>`
            );
            
            previousCategoryId = currentCategoryId;
        });
        
        bookmarksGrid.innerHTML = htmlChunks.join('');
    };

    // --- 5. Event Listeners ---
    if (sidebarToggleBtn) {
        const isInitiallyCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if(appLayout) appLayout.classList.toggle('sidebar-collapsed', isInitiallyCollapsed);
        sidebarToggleBtn.addEventListener('click', () => {
            const isCollapsed = appLayout.classList.toggle('sidebar-collapsed');
            localStorage.setItem('sidebarCollapsed', isCollapsed);
        });
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
                    showToast('设置默认分类失败: ' + error.message, true);
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
    
    // --- 6. Start the application ---
    initializePage();
});
