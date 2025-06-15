// admin-core.js

// --- 1. 全局状态定义 ---
// 这些变量将在整个管理后台的所有模块中共享
let allBookmarks = [], allCategories = [], allUsers = [];

// --- 2. 主程序入口 ---
// 当页面的基本HTML结构加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
    // --- 2.1. 全局元素选择器 ---
    const adminPageContainer = document.getElementById('admin-page-container');
    const adminPanelNav = document.querySelector('.admin-panel-nav');
    const adminTabContents = document.querySelectorAll('.admin-tab-content');
    
    // --- 2.2. 核心初始化函数 (带缓存逻辑) ---
    async function initializePage(activeTabId = 'tab-categories') {
        try {
            // 检查用户登录状态
            const token = localStorage.getItem('jwt_token');
            const payload = token ? parseJwtPayload(token) : null;
            if (!payload) throw new Error("无效或缺失的认证令牌，请重新登录。");

            // 尝试从 sessionStorage 读取缓存数据
            const cachedData = sessionStorage.getItem('adminDataCache');
            if (cachedData) {
                console.log("从前端缓存加载数据...");
                const data = JSON.parse(cachedData);
                allCategories = data.categories || [];
                allBookmarks = data.bookmarks || [];
                allUsers = data.users || [];
            } else {
                // 如果缓存不存在，则从API获取
                console.log("缓存未命中，从API获取数据...");
                const data = await apiRequest('data'); // 'data' API会返回所有该用户可见的数据
                // 进行权限校验
                if (!data || !data.users.find(u => u.username === payload.sub)?.roles.includes('admin')) {
                    throw new Error("用户权限不足或数据获取失败。");
                }
                allCategories = data.categories || [];
                allBookmarks = data.bookmarks || [];
                allUsers = data.users || [];
                // 将获取到的数据存入缓存
                sessionStorage.setItem('adminDataCache', JSON.stringify({categories: allCategories, bookmarks: allBookmarks, users: allUsers}));
            }

            // 数据加载成功后，显示页面内容
            if (adminPageContainer) adminPageContainer.style.display = 'flex';
            document.body.classList.remove('is-loading');

            // 模拟点击以激活指定的或第一个标签页
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
            // 清理无效状态并跳转到主页
            localStorage.removeItem('jwt_token');
            sessionStorage.removeItem('adminDataCache');
            window.location.href = 'index.html';
        }
    }

    // --- 2.3. 标签页渲染与切换 ---
    const renderAdminTab = (tabId) => {
        const container = document.getElementById(tabId);
        if (!container) return;
        container.innerHTML = ''; // 切换时清空旧内容
        
        // 根据 tabId 调用不同模块的渲染函数 (这些函数在各自的文件中定义)
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

    // 为左侧导航栏添加点击事件监听
    if (adminPanelNav) {
        adminPanelNav.addEventListener('click', (e) => {
            e.preventDefault();
            const link = e.target.closest('.admin-tab-link');
            if (!link || link.classList.contains('active')) return;

            // 更新导航链接的激活状态
            adminPanelNav.querySelectorAll('.admin-tab-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const tabId = link.dataset.tab;
            // 更新主内容区的显示状态
            adminTabContents.forEach(content => content.classList.toggle('active', content.id === tabId));
            
            // 渲染新的标签页内容
            renderAdminTab(tabId);
        });
    }

    // --- 2.4. 启动页面 ---
    initializePage();
});

// --- 3. 全局共享工具函数 ---

/**
 * 使前端缓存失效，强制下次从API重新加载数据。
 * 在任何增、删、改操作成功后都应调用此函数。
 */
function invalidateCache() {
    console.log("前端缓存已失效，下次将重新获取。");
    sessionStorage.removeItem('adminDataCache');
}

/**
 * 显示一个非阻塞的消息提示（Toast）。
 * @param {string} message - 要显示的消息内容。
 * @param {boolean} [isError=false] - 是否为错误消息（会显示不同颜色）。
 */
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
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
        });
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.background = isError ? 'rgba(239, 68, 68, 0.8)' : 'rgba(34, 197, 94, 0.8)';
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

/**
 * 显示指定的模态框。
 * @param {HTMLElement} modalElement - 要显示的模态框DOM元素。
 */
function showModal(modalElement) {
    const modalBackdrop = document.getElementById('modal-backdrop');
    hideAllModals(); // 先关闭所有可能已打开的模态框
    if (modalElement && modalBackdrop) {
        modalBackdrop.style.display = 'flex';
        modalElement.style.display = 'block';
    }
}

/**
 * 隐藏所有模态框。
 */
function hideAllModals() {
    const modalBackdrop = document.getElementById('modal-backdrop');
    if (modalBackdrop) modalBackdrop.style.display = 'none';
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

/**
 * 显示一个确认对话框。
 * @param {string} title - 对话框标题。
 * @param {string} text - 对话框正文。
 * @param {Function} onConfirm - 用户点击“确认”后执行的回调函数。
 */
function showConfirm(title, text, onConfirm) {
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmText = document.getElementById('confirm-text');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');
    
    if (!confirmModal || !confirmTitle || !confirmText || !confirmBtnYes) return;
    
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    showModal(confirmModal);
    
    // 使用 .onclick 确保每次调用都覆盖旧的监听器
    confirmBtnYes.onclick = () => {
        hideAllModals();
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
    };
}

/**
 * 填充一个<select>元素，支持层级显示。
 * @param {HTMLElement} selectElement - 要填充的<select>元素。
 * @param {Array} categories - 全部分类数据数组。
 * @param {string|null} selectedId - 应被选中的分类ID。
 * @param {string|null} ignoreId - 不应出现在下拉列表中的分类ID（通常是自身）。
 * @param {object} options - 其他选项，如 { allowNoParent: boolean }。
 */
function populateCategoryDropdown(selectElement, categories, selectedId = null, ignoreId = null, options = { allowNoParent: true }) {
    selectElement.innerHTML = '';
    if (options.allowNoParent) {
        selectElement.innerHTML = '<option value=""> 顶级分类 </option>';
    }
    
    const categoryMap = new Map(categories.map(cat => [cat.id, { ...cat, children: [] }]));
    const tree = [];
    
    categories.forEach(cat => {
        if (!cat || cat.id === ignoreId) return;
        const node = categoryMap.get(cat.id);
        if (cat.parentId && categoryMap.has(cat.parentId)) {
            const parent = categoryMap.get(cat.parentId);
            if(parent) parent.children.push(node);
        } else {
            tree.push(node);
        }
    });

    tree.sort((a,b)=>(a.sortOrder||0) - (b.sortOrder||0));

    const buildOptions = (nodes, level) => {
        if (level >= 10) return; // 限制最大递归深度
        nodes.sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).forEach(node => {
            if (!node) return;
            const option = document.createElement('option');
            option.value = node.id;
            option.textContent = `${'— '.repeat(level)}${escapeHTML(node.name)}`;
            if (node.id === selectedId) option.selected = true;
            selectElement.appendChild(option);
            if (node.children.length > 0) buildOptions(node.children, level + 1);
        });
    };
    buildOptions(tree, 0);
}

// 初始化所有模态框的关闭按钮事件
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.close-btn, #confirm-btn-no').forEach(btn => {
        btn.addEventListener('click', hideAllModals);
    });
});
