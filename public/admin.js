document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const adminPageContainer = document.getElementById('admin-page-container');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmText = document.getElementById('confirm-text');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');
    const adminPanelNav = document.querySelector('.admin-panel-nav');
    const adminTabContents = document.querySelectorAll('.admin-tab-content');
    const bookmarkEditModal = document.getElementById('bookmark-edit-modal');
    const bookmarkEditForm = document.getElementById('bookmark-edit-form');
    
    // --- State ---
    let allBookmarks = [], allCategories = [], allUsers = [];
    let tempCategories = [];

    // --- UI Flow & Modals ---
    const showModal = (modal) => { 
        modalBackdrop.style.display = 'flex'; 
        modal.style.display = 'flex'; 
    };
    const hideAllModals = () => { 
        modalBackdrop.style.display = 'none'; 
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); 
    };
    const showConfirm = (title, text, onConfirm) => {
        confirmTitle.textContent = title;
        confirmText.textContent = text;
        showModal(confirmModal);
        confirmBtnYes.onclick = () => { 
            confirmModal.style.display = 'none';
            if (document.querySelector('#admin-page-container')) {
                // If we are on admin page, don't hide backdrop
            } else {
                hideAllModals();
            }
            onConfirm(); 
        };
    };

    // --- Auth Check & Initial Data Load ---
    async function initializePage() {
        try {
            const data = await apiRequest('data');
            const token = localStorage.getItem('jwt_token');
            if(!token) throw new Error("No token");

            const payload = JSON.parse(atob(token.split('.')[1]));
            if(!payload.roles || !payload.roles.includes('admin')) {
                throw new Error("Not an admin");
            }

            allCategories = data.categories || [];
            allBookmarks = (data.bookmarks || []).map((bm, index) => ({...bm, sortOrder: bm.sortOrder ?? index}));
            allUsers = data.users || [];
            
            document.body.classList.remove('is-loading');
            document.body.className = localStorage.getItem('theme') || 'dark-theme';
            adminPageContainer.style.display = 'flex';
            renderAdminTab('tab-categories');

        } catch (error) {
            window.location.href = 'index.html'; 
        }
    }

    // --- Admin Panel Logic ---
    adminPanelNav.addEventListener('click', (e) => {
        e.preventDefault();
        const link = e.target.closest('.admin-tab-link');
        if (!link || link.classList.contains('active')) return;

        adminPanelNav.querySelectorAll('.admin-tab-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        const tabId = link.dataset.tab;
        adminTabContents.forEach(content => {
             content.classList.toggle('active', content.id === tabId);
        });
        renderAdminTab(tabId);
    });
    
    const renderAdminTab = (tabId) => {
        switch (tabId) {
            case 'tab-categories':
                renderCategoryAdminTab();
                break;
            case 'tab-users':
                renderUserAdminTab();
                break;
            case 'tab-bookmarks':
                renderBookmarkAdminTab();
                break;
        }
    };
    
    const populateCategoryDropdown = (selectElement, categories, selectedId = null, ignoreId = null) => {
        selectElement.innerHTML = '<option value="">-- 顶级分类 --</option>';
        
        const categoryMap = new Map(categories.map(cat => [cat.id, { ...cat, children: [] }]));
        const tree = [];
        const sortedCategories = [...categories].sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        for (const cat of sortedCategories) {
            if (cat.id === ignoreId) continue;
            if (cat.parentId && categoryMap.has(cat.parentId)) {
                const parent = categoryMap.get(cat.parentId);
                if (parent) parent.children.push(categoryMap.get(cat.id));
            } else {
                tree.push(categoryMap.get(cat.id));
            }
        }

        const buildOptions = (nodes, level) => {
            if (level >= 4) return;
            for (const node of nodes) {
                if (!node) continue;
                const option = document.createElement('option');
                option.value = node.id;
                option.textContent = `${'— '.repeat(level)}${node.name}`;
                if (node.id === selectedId) option.selected = true;
                selectElement.appendChild(option);
                if (node.children.length > 0) buildOptions(node.children, level + 1);
            }
        };
        buildOptions(tree, 0);
    };

    // --- Tab 1: Category Management ---
    const renderCategoryAdminTab = () => {
        tempCategories = JSON.parse(JSON.stringify(allCategories));
        const container = document.getElementById('tab-categories');
        container.innerHTML = `<h2>分类管理</h2><p class="admin-panel-tip">通过“排序”数字（越小越靠前）和“父级分类”来调整结构。修改后请点击下方“保存全部分类”按钮。</p><div class="category-admin-header"><span>排序</span><span>分类名称</span><span>父级分类</span><span>操作</span></div><ul id="category-admin-list"></ul><div class="admin-panel-actions"><button id="save-categories-btn"><i class="fas fa-save"></i> 保存全部分类</button><button id="add-new-category-btn" class="secondary"><i class="fas fa-plus"></i> 添加新分类</button></div>`;
        
        const listEl = container.querySelector('#category-admin-list');
        listEl.innerHTML = '';
        
        tempCategories.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(cat => {
            const li = document.createElement('li');
            li.dataset.id = cat.id;
            li.innerHTML = `<input type="number" class="cat-order-input" value="${cat.sortOrder || 0}"><input type="text" class="cat-name-input" value="${escapeHTML(cat.name)}"><select class="cat-parent-select"></select><button class="delete-cat-btn secondary danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
            const parentSelect = li.querySelector('.cat-parent-select');
            populateCategoryDropdown(parentSelect, tempCategories, cat.parentId, cat.id);
            
            li.querySelector('.delete-cat-btn').onclick = () => {
                showConfirm('确认删除', `您确定要删除分类 "${cat.name}" 吗？这也会删除其下所有的子分类。`, async () => {
                    const catIdToDelete = cat.id;
                    let idsToDelete = new Set([catIdToDelete]);
                    let queue = [catIdToDelete];
                    while(queue.length > 0){
                        const parentId = queue.shift();
                        allCategories.forEach(c => {
                            if(c.parentId === parentId) { idsToDelete.add(c.id); queue.push(c.id); }
                        });
                    }
                    const finalCategories = allCategories.filter(c => !idsToDelete.has(c.id));
                    try {
                        await apiRequest('data', 'PUT', { categories: finalCategories });
                        await initializePage();
                    } catch (error) {
                        alert('删除失败: ' + error.message);
                    }
                });
            };
            listEl.appendChild(li);
        });

        container.querySelector('#add-new-category-btn').addEventListener('click', () => {
             const newCat = {
                id: `new-${Date.now()}`, name: '新分类', parentId: null,
                sortOrder: (allCategories.length > 0) ? Math.max(...allCategories.map(c => c.sortOrder || 0)) + 10 : 0
            };
            const listEl = document.getElementById('category-admin-list');
            const li = document.createElement('li');
            li.dataset.id = newCat.id;
            li.innerHTML = `<input type="number" class="cat-order-input" value="${newCat.sortOrder}"><input type="text" class="cat-name-input" value="${newCat.name}"><select class="cat-parent-select"></select><button class="delete-cat-btn secondary danger" title="删除"><i class="fas fa-trash-alt"></i></button>`;
            const parentSelect = li.querySelector('.cat-parent-select');
            populateCategoryDropdown(parentSelect, allCategories, newCat.parentId, newCat.id);
            li.querySelector('.delete-cat-btn').onclick = () => li.remove();
            listEl.prepend(li);
            li.querySelector('.cat-name-input').focus();
        });

        container.querySelector('#save-categories-btn').addEventListener('click', async () => {
            const listItems = document.querySelectorAll('#category-admin-list li');
            let finalCategories = [];
            let hasError = false;
            listItems.forEach(li => {
                const id = li.dataset.id;
                const name = li.querySelector('.cat-name-input').value.trim();
                if (!name) { alert('分类名称不能为空！'); hasError = true; }
                finalCategories.push({
                    id: id.startsWith('new-') ? `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : id,
                    sortOrder: parseInt(li.querySelector('.cat-order-input').value) || 0,
                    name: name, parentId: li.querySelector('.cat-parent-select').value || null,
                });
            });
            if (hasError) return;
            try {
                await apiRequest('data', 'PUT', { categories: finalCategories });
                alert('分类保存成功！');
                await initializePage();
            } catch (error) { alert('保存失败: ' + error.message); }
        });
    };

    // --- Tab 2: User Management ---
    // ... All user management functions from previous app.js go here ...
    
    // --- Tab 3: Bookmark Management ---
    // ... All bookmark management functions from previous app.js go here ...
    
    // --- Tab 4: System Settings ---
    // ... All system settings functions from previous app.js go here ...

    // --- Initial Load ---
    initializePage();
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', hideAllModals));
    document.getElementById('confirm-btn-no').onclick = hideAllModals;
});
