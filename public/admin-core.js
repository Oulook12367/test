// admin-core.js

// --- 全局状态定义 ---
let allBookmarks = [], allCategories = [], allUsers = [];

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. 全局元素选择器 ---
    const adminPageContainer = document.getElementById('admin-page-container');
    const adminPanelNav = document.querySelector('.admin-panel-nav');
    const adminContentPanel = document.querySelector('.admin-panel-content');
    const adminTabContents = document.querySelectorAll('.admin-tab-content');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const confirmModal = document.getElementById('confirm-modal');
    
    // --- 2. 核心初始化函数 (带缓存逻辑) ---
    async function initializePage(activeTabId = 'tab-categories') {
        try {
            const token = localStorage.getItem('jwt_token');
            if (!token || !parseJwtPayload(token)) throw new Error("无效或缺失的认证令牌。");

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
                if (!data || !data.users.find(u => u.username === parseJwtPayload(token).sub)?.roles.includes('admin')) {
                    throw new Error("用户权限可能已变更，或数据获取失败。");
                }
                allCategories = data.categories || [];
                allBookmarks = data.bookmarks || [];
                allUsers = data.users || [];
                sessionStorage.setItem('adminDataCache', JSON.stringify({categories: allCategories, bookmarks: allBookmarks, users: allUsers}));
            }

            if (adminPageContainer) adminPageContainer.style.display = 'flex';
            document.body.classList.remove('is-loading');

            const linkToClick = document.querySelector(`.admin-tab-link[data-tab="${activeTabId}"]`);
            if (linkToClick) {
                linkToClick.click();
            } else {
                document.querySelector('.admin-tab-link')?.click();
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
        container.innerHTML = ''; // 清空内容
        
        // 根据tabId调用不同模块的渲染函数
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

    if (adminPanelNav) {
        adminPanelNav.addEventListener('click', (e) => {
            e.preventDefault();
            const link = e.target.closest('.admin-tab-link');
            if (!link || link.classList.contains('active')) return;

            adminPanelNav.querySelectorAll('.admin-tab-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const tabId = link.dataset.tab;
            adminTabContents.forEach(content => content.classList.toggle('active', content.id === tabId));
            
            renderAdminTab(tabId);
        });
    }

    // --- 4. 启动页面 ---
    initializePage();
});

// --- 5. 全局共享工具函数 ---

// 缓存失效函数
function invalidateCache() {
    console.log("前端缓存已失效，下次将重新获取。");
    sessionStorage.removeItem('adminDataCache');
}

// 消息提示工具
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

// 模态框控制
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

// 分类下拉菜单填充工具
function populateCategoryDropdown(selectElement, categories, selectedId = null, ignoreId = null, options = { allowNoParent: true }) {
    selectElement.innerHTML = '';
    if (options.allowNoParent) selectElement.innerHTML = '<option value=""> 顶级分类 </option>';
    
    const categoryMap = new Map(categories.map(cat => [cat.id, { ...cat, children: [] }]));
    const tree = [];
    
    categories.forEach(cat => {
        if (cat.id === ignoreId) return;
        const node = categoryMap.get(cat.id);
        if (cat.parentId && categoryMap.has(cat.parentId)) {
            categoryMap.get(cat.parentId).children.push(node);
        } else {
            tree.push(node);
        }
    });

    // 确保顶级分类按 sortOrder 排序
    tree.sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));

    const buildOptions = (nodes, level) => {
        if (level >= 4) return; // 限制最大深度
        // 确保子分类也按 sortOrder 排序
        nodes.sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).forEach(node => {
            if (!node) return;
            const option = document.createElement('option');
            option.value = node.id;
            option.textContent = `${'— '.repeat(level)}${node.name}`;
            if (node.id === selectedId) option.selected = true;
            selectElement.appendChild(option);
            if (node.children.length > 0) buildOptions(node.children, level + 1);
        });
    };
    buildOptions(tree, 0);
}

// 初始化模态框关闭按钮
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.close-btn, #confirm-btn-no').forEach(btn => {
        btn.addEventListener('click', hideAllModals);
    });
});
