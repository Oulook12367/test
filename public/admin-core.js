// admin-core.js

// --- 1. 全局状态定义 ---
let allBookmarks = [], allCategories = [], allUsers = [];

// --- 【新增】核心排序工具函数 ---
/**
 * 将扁平的分类数组，转换为按层级优先的排序后数组。
 * @param {Array} categories - 全部分类数组。
 * @returns {Array} - 一个新数组，分类按正确的层级顺序排列。
 */
function getHierarchicalSortedCategories(categories) {
    const categoryMap = new Map(categories.map(c => [c.id, {...c, children: []}]));
    const tree = [];
    const sortedList = [];

    // 构建树结构
    categories.forEach(c => {
        if (!c) return;
        const node = categoryMap.get(c.id);
        if (c.parentId && categoryMap.has(c.parentId)) {
            const parent = categoryMap.get(c.parentId);
            if(parent) parent.children.push(node);
        } else {
            tree.push(node);
        }
    });

    // 按顶级分类的 sortOrder 排序
    tree.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    /**
     * 深度优先遍历来“压平”树结构
     * @param {Array} nodes - 当前层级的节点。
     * @param {number} level - 当前深度。
     */
    function flattenTree(nodes, level) {
        // 按当前层级的 sortOrder 排序
        nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        nodes.forEach(node => {
            node.level = level; // 为每个节点添加深度信息
            sortedList.push(node);
            if (node.children.length > 0) {
                flattenTree(node.children, level + 1);
            }
        });
    }

    flattenTree(tree, 0);
    return sortedList;
}


document.addEventListener('DOMContentLoaded', () => {
    // --- 2. 核心初始化函数 (带缓存逻辑) ---
    async function initializePage(activeTabId = 'tab-categories') {
        try {
            const token = localStorage.getItem('jwt_token');
            const payload = token ? parseJwtPayload(token) : null;
            if (!payload) throw new Error("无效或缺失的认证令牌，请重新登录。");

            const cachedData = sessionStorage.getItem('adminDataCache');
            if (cachedData) {
                console.log("从前端缓存加载数据...");
                const data = JSON.parse(cachedData);
                allCategories = data.categories || [];
                allBookmarks = data.bookmarks || [];
                allUsers = data.users || [];
            } else {
                console.log("缓存未命中，从API获取数据...");
                const data = await apiRequest('data');
                if (!data || !data.users.find(u => u.username === payload.sub)?.roles.includes('admin')) {
                    throw new Error("用户权限不足或数据获取失败。");
                }
                allCategories = data.categories || [];
                allBookmarks = data.bookmarks || [];
                allUsers = data.users || [];
                sessionStorage.setItem('adminDataCache', JSON.stringify({categories: allCategories, bookmarks: allBookmarks, users: allUsers}));
            }

            if (document.getElementById('admin-page-container')) document.getElementById('admin-page-container').style.display = 'flex';
            document.body.classList.remove('is-loading');

            const linkToClick = document.querySelector(`.admin-tab-link[data-tab="${activeTabId}"]`);
            if (linkToClick && !linkToClick.classList.contains('active')) {
                linkToClick.click();
            } else if (!document.querySelector('.admin-tab-link.active')) {
                document.querySelector('.admin-tab-link')?.click();
            } else {
                 renderAdminTab(activeTabId || 'tab-categories');
            }

        } catch (error) {
            console.error("初始化管理页面失败:", error);
            localStorage.removeItem('jwt_token');
            sessionStorage.removeItem('adminDataCache');
            window.location.href = 'index.html';
        }
    }

    // --- 3. 标签页渲染与切换 ---
    const renderAdminTab = (tabId) => {
        const container = document.getElementById(tabId);
        if (!container) return;
        container.innerHTML = '';
        
        switch (tabId) {
            case 'tab-categories':
                renderCategoryAdminTab(container);
                break;
            case 'tab-users':
                renderUserAdminTab(container);
                break;
            case 'tab-bookmarks':
                renderBookmarkAdminTab(container);
                break;
            case 'tab-system':
                renderSystemSettingsTab(container);
                break;
        }
    };

    const adminPanelNav = document.querySelector('.admin-panel-nav');
    if (adminPanelNav) {
        adminPanelNav.addEventListener('click', (e) => {
            e.preventDefault();
            const link = e.target.closest('.admin-tab-link');
            if (!link || link.classList.contains('active')) return;

            adminPanelNav.querySelectorAll('.admin-tab-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const tabId = link.dataset.tab;
            document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.toggle('active', content.id === tabId));
            
            renderAdminTab(tabId);
        });
    }

    // --- 4. 启动页面 ---
    initializePage();
});

// --- 5. 全局共享工具函数 ---

function invalidateCache() {
    console.log("前端缓存已失效，下次将重新获取。");
    sessionStorage.removeItem('adminDataCache');
}

function showToast(message, isError = false) {
    let toast = document.querySelector('.toast-message');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast-message';
        Object.assign(toast.style, {
            position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
            padding: '12px 25px', borderRadius: '12px', color: 'white',
            background: isError ? 'rgba(239, 68, 68, 0.8)' : 'rgba(34, 197, 94, 0.8)',
            backdropFilter: 'blur(10px)', zIndex: '9999', opacity: '0',
            transition: 'opacity 0.3s ease-in-out', fontWeight: '700',
        });
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.background = isError ? 'rgba(239, 68, 68, 0.8)' : 'rgba(34, 197, 94, 0.8)';
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

function showModal(modalElement) {
    const modalBackdrop = document.getElementById('modal-backdrop');
    hideAllModals();
    if (modalElement && modalBackdrop) {
        modalBackdrop.style.display = 'flex';
        modalElement.style.display = 'block';
    }
}

function hideAllModals() {
    const modalBackdrop = document.getElementById('modal-backdrop');
    if (modalBackdrop) modalBackdrop.style.display = 'none';
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

function showConfirm(title, text, onConfirm) {
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmText = document.getElementById('confirm-text');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');
    
    if (!confirmModal || !confirmTitle || !confirmText || !confirmBtnYes) return;
    
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    showModal(confirmModal);
    
    confirmBtnYes.onclick = () => {
        hideAllModals();
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
    };
}

function populateCategoryDropdown(selectElement, categories, selectedId = null, ignoreId = null, options = { allowNoParent: true }) {
    selectElement.innerHTML = '';
    if (options.allowNoParent) {
        selectElement.innerHTML = '<option value=""> 顶级分类 </option>';
    }
    
    // 使用新的排序函数来保证下拉列表的顺序
    const sortedCategories = getHierarchicalSortedCategories(categories);

    sortedCategories.forEach(cat => {
        if (cat.id === ignoreId) return;
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = `${'— '.repeat(cat.level || 0)}${escapeHTML(cat.name)}`;
        if (cat.id === selectedId) option.selected = true;
        selectElement.appendChild(option);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.close-btn, #confirm-btn-no').forEach(btn => {
        btn.addEventListener('click', hideAllModals);
    });
});
