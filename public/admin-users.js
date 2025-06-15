// admin-users.js

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
    const currentUsername = parseJwtPayload(localStorage.getItem('jwt_token'))?.sub || '';
    const usersArray = Array.isArray(allUsers) ? allUsers : Object.values(allUsers);
    
    userList.innerHTML = '';
    usersArray.forEach(user => {
        if (!user || !user.username) return;
        const li = document.createElement('li');
        li.dataset.username = user.username;
        li.innerHTML = `<span>${user.username === 'public' ? `<i class="fas fa-eye fa-fw"></i> ${user.username} (公共模式)` : `${user.username} (${(user.roles || []).join(', ')})`}</span>`;
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
    
    const isAdmin = user.roles && user.roles.includes('admin');
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
    const usernameInput = form.querySelector('#user-form-username');
    if (usernameInput) {
       usernameInput.readOnly = false;
       usernameInput.value = '';
    }
    const passwordInput = form.querySelector('#user-form-password');
    if (passwordInput) {
        passwordInput.placeholder = "必填";
        passwordInput.value = '';
    }

    form.querySelector('#user-form-username-hidden').value = '';
    
    renderUserFormRoles();
    renderUserFormCategories();
    updateDefaultCategoryDropdown(form, 'all');
    
    document.querySelectorAll('#user-list li').forEach(li => li.classList.remove('selected'));
}

function renderUserFormRoles(activeRoles = ['viewer']) {
    // ... 此函数逻辑不变 ...
    const container = document.getElementById('user-form-roles'); if (!container) return;
    container.innerHTML = '';
    const username = document.getElementById('user-form-username').value;
    const isPublicUser = username === 'public';
    const isAdminUser = username === 'admin';
    ['admin', 'editor', 'viewer'].forEach(role => {
        const currentRole = activeRoles[0] || 'viewer';
        const isChecked = currentRole === role;
        const isDisabled = (isAdminUser && role !== 'admin') || (isPublicUser && role !== 'viewer');
        container.innerHTML += `<div><input type="radio" id="role-${role}" name="role-selection" value="${role}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}><label for="role-${role}">${role}</label></div>`;
    });
}

function renderUserFormCategories(visibleIds = [], isDisabled = false) {
    // ... 此函数逻辑不变 ...
    const container = document.getElementById('user-form-categories'); if (!container) return;
    container.innerHTML = '';
    const sortedCategories = getHierarchicalSortedCategories(allCategories);
    sortedCategories.forEach(node => {
        container.innerHTML += `<div><input type="checkbox" id="cat-perm-${node.id}" value="${node.id}" ${visibleIds.includes(node.id) ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}><label for="cat-perm-${node.id}" style="padding-left: ${(node.level||0) * 20}px">${escapeHTML(node.name)}</label></div>`;
    });
}

function updateDefaultCategoryDropdown(form, selectedId) {
    // ... 此函数逻辑不变 ...
    const defaultCatSelect = form.querySelector('#user-form-default-cat');
    const visibleCatCheckboxes = form.querySelectorAll('#user-form-categories input:checked');
    const visibleCatIds = Array.from(visibleCatCheckboxes).map(cb => cb.value);
    const currentSelectedValue = defaultCatSelect.value;
    defaultCatSelect.innerHTML = `<option value="all">全部书签</option>`;
    const categoriesToShow = allCategories.filter(cat => visibleCatIds.includes(cat.id));
    populateCategoryDropdown(defaultCatSelect, categoriesToShow, null, null, { allowNoParent: false });
    defaultCatSelect.prepend(new Option("全部书签", "all"));
    if (selectedId && (selectedId === 'all' || categoriesToShow.some(c => c.id === selectedId))) {
        defaultCatSelect.value = selectedId;
    } else if (categoriesToShow.some(c => c.id === currentSelectedValue)) {
        defaultCatSelect.value = currentSelectedValue;
    } else {
        defaultCatSelect.value = 'all';
    }
}


document.addEventListener('click', event => {
    if (document.getElementById('tab-users')?.classList.contains('active')) {
        const target = event.target;
        const userLi = target.closest('li[data-username]');

        if (target.closest('.delete-user-btn')) {
            event.stopPropagation();
            const username = userLi.dataset.username;
            showConfirm('删除用户', `确定删除用户 "${username}"?`, async () => {
                try {
                    await apiRequest(`users/${encodeURIComponent(username)}`, 'DELETE');
                    showToast("用户删除成功！");
                    invalidateCache();
                    await initializePage('tab-users');
                } catch (error) { showToast(`删除失败: ${error.message}`, true); }
            });
        } else if (userLi) {
            const usersArray = Array.isArray(allUsers) ? allUsers : Object.values(allUsers);
            const user = usersArray.find(u => u.username === userLi.dataset.username);
            if (user) populateUserForm(user);
        } else if (target.closest('#user-form-clear-btn')) {
            clearUserForm();
        }
    }
});

document.getElementById('user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    const errorEl = form.querySelector('.modal-error-message');
    errorEl.textContent = '';
    
    const hiddenUsername = form.querySelector('#user-form-username-hidden').value;
    const isEditing = !!hiddenUsername;
    const username = form.querySelector('#user-form-username').value.trim();
    const password = form.querySelector('#user-form-password').value;

    if (!username) { errorEl.textContent = '用户名不能为空'; return; }
    if (!isEditing && !password) { errorEl.textContent = '新用户必须设置密码'; return; }

    const selectedRole = form.querySelector('input[name="role-selection"]:checked').value;
    const userData = {
        roles: [selectedRole],
        permissions: { visibleCategories: Array.from(form.querySelectorAll('#user-form-categories input:checked')).map(cb => cb.value) },
        defaultCategoryId: form.querySelector('#user-form-default-cat').value
    };
    if (password) userData.password = password;
    if (!isEditing) userData.username = username;

    const endpoint = isEditing ? `users/${encodeURIComponent(hiddenUsername)}` : 'users';
    const method = isEditing ? 'PUT' : 'POST';

    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
    submitBtn.disabled = true;

    try {
        const savedUser = await apiRequest(endpoint, method, userData);
        showToast('用户保存成功！');
        invalidateCache();

        // 【修复】手动更新本地 allUsers 数组
        if (isEditing) {
            const userIndex = allUsers.findIndex(u => u.username === savedUser.username);
            if (userIndex > -1) allUsers[userIndex] = savedUser;
        } else {
            allUsers.push(savedUser);
        }

        const token = localStorage.getItem('jwt_token');
        if (token && parseJwtPayload(token).sub === savedUser.username && !savedUser.roles.includes('admin')) {
            showToast('您的管理员权限已被移除，将退出管理后台。', true);
            localStorage.removeItem('jwt_token');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }
        
        // 使用更新后的 allUsers 重新渲染UI
        renderUserAdminTab(document.getElementById('tab-users'));
        // 选中刚刚新增或编辑的用户
        populateUserForm(savedUser);

    } catch (error) {
        errorEl.textContent = error.message;
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});

document.addEventListener('change', event => {
    if (document.getElementById('tab-users')?.classList.contains('active')) {
        const target = event.target;
        if (target.closest('#user-form-categories')) {
            updateDefaultCategoryDropdown(document.getElementById('user-form'));
        }
    }
});
