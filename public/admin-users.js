// admin-users.js

// --- 渲染函数 ---
function renderUserAdminTab(container) {
    container.innerHTML = `
        <div id="user-management-container">
            <div class="user-list-container">
                <h3 style="margin-bottom: 1rem;">用户列表</h3>
                <ul id="user-list"></ul>
            </div>
            <div class="user-form-container">
                <form id="user-form">
                    <h3 id="user-form-title">添加新用户</h3>
                    <div class="user-form-static-fields">
                        <input type="hidden" id="user-form-username-hidden">
                        <div class="form-group-inline"><label for="user-form-username">用户名:</label><input type="text" id="user-form-username" required></div>
                        <div class="form-group-inline"><label for="user-form-password">密码:</label><input type="password" id="user-form-password" placeholder="留空则不修改"></div>
                        <div class="form-group-inline"><label>角色:</label><div id="user-form-roles" class="checkbox-group horizontal"></div></div>
                        <div class="form-group-inline"><label for="user-form-default-cat">默认显示分类:</label><select id="user-form-default-cat"></select></div>
                    </div>
                    <div class="form-group flex-grow">
                        <label>可见分类:</label>
                        <div id="user-form-categories" class="checkbox-group"></div>
                    </div>
                    <div class="user-form-buttons">
                        <button type="submit" class="button button-primary">保存用户</button>
                        <button type="button" id="user-form-clear-btn" class="button">新增/清空</button>
                    </div>
                    <p class="modal-error-message"></p>
                </form>
            </div>
        </div>`;

    const userList = container.querySelector('#user-list');
    let currentUsername = parseJwtPayload(localStorage.getItem('jwt_token'))?.sub || '';
    
    allUsers.forEach(user => {
        const li = document.createElement('li');
        li.dataset.username = user.username;
        li.innerHTML = `<span>${user.username === 'public' ? `<i class="fas fa-eye fa-fw"></i> ${user.username} (公共模式)` : `${user.username} (${user.roles.join(', ')})`}</span>`;
        if (user.username !== 'public' && user.username !== currentUsername) {
            const delBtn = document.createElement('button');
            delBtn.className = 'button-icon danger delete-user-btn';
            delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            delBtn.title = '删除用户';
            li.appendChild(delBtn);
        }
        userList.appendChild(li);
    });
    
    clearUserForm();
}

// --- 表单填充与清空 ---
function populateUserForm(user) {
    const form = document.getElementById('user-form'); if (!form) return;
    form.reset();
    form.querySelector('.modal-error-message').textContent = '';
    form.querySelector('#user-form-title').textContent = `编辑用户: ${user.username}`;
    
    const usernameInput = form.querySelector('#user-form-username');
    usernameInput.value = user.username;
    usernameInput.readOnly = true;
    
    form.querySelector('#user-form-password').placeholder = "留空则不修改";
    form.querySelector('#user-form-username-hidden').value = user.username;
    
    const isAdmin = user.roles.includes('admin');
    const isPublic = user.username === 'public';
    
    renderUserFormRoles(user.roles);
    renderUserFormCategories(isAdmin ? allCategories.map(c => c.id) : (user.permissions?.visibleCategories || []), isPublic ? false : isAdmin);
    updateDefaultCategoryDropdown(form, user.defaultCategoryId);
    
    document.querySelectorAll('#user-list li').forEach(li => li.classList.remove('selected'));
    document.querySelector(`#user-list li[data-username="${user.username}"]`)?.classList.add('selected');
}

function clearUserForm() {
    const form = document.getElementById('user-form'); if (!form) return;
    form.reset();
    form.querySelector('.modal-error-message').textContent = '';
    form.querySelector('#user-form-title').textContent = '添加新用户';
    form.querySelector('#user-form-username').readOnly = false;
    form.querySelector('#user-form-password').placeholder = "必填";
    form.querySelector('#user-form-username-hidden').value = '';
    
    renderUserFormRoles();
    renderUserFormCategories();
    updateDefaultCategoryDropdown(form, 'all');
    
    document.querySelectorAll('#user-list li').forEach(li => li.classList.remove('selected'));
}

function renderUserFormRoles(activeRoles = ['viewer']) {
    // ... 此函数逻辑不变 ...
}

function renderUserFormCategories(visibleIds = [], isDisabled = false) {
    // ... 此函数逻辑不变 ...
}

function updateDefaultCategoryDropdown(form, selectedId) {
    // ... 此函数逻辑不变 ...
}

// --- 事件处理 ---
document.addEventListener('click', event => {
    if (document.getElementById('tab-users')?.classList.contains('active')) {
        const target = event.target;
        const userLi = target.closest('li[data-username]');

        if (target.closest('.delete-user-btn')) {
            event.stopPropagation();
            const username = userLi.dataset.username;
            showConfirm('删除用户', `确定删除用户 "${username}"?`, async () => {
                try {
                    // await apiRequest(`users/${encodeURIComponent(username)}`, 'DELETE');
                    showToast("用户删除功能需要后端支持", true);
                    invalidateCache();
                    // await initializePage('tab-users');
                } catch (error) { showToast(error.message, true); }
            });
        } else if (userLi) {
            const user = allUsers.find(u => u.username === userLi.dataset.username);
            if (user) populateUserForm(user);
        } else if (target.closest('#user-form-clear-btn')) {
            clearUserForm();
        }
    }
});

document.getElementById('user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    // ... 提交逻辑不变 (handleUserFormSubmit)
    // 成功后调用 invalidateCache(); 和 initializePage('tab-users');
});
