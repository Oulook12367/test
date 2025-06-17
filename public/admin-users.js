// admin-users.js

// --- 前端验证函数 ---
function validateUsername_fe(username) {
    if (!username || username.length < 6) {
        return "用户名至少需要6位。";
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return "用户名只能包含字母、数字、下划线和连字符。";
    }
    return null; // No error
}

function validatePassword_fe(password) {
    if (!password || password.length < 8) {
        return "密码至少需要8位。";
    }
    if (!/(?=.*[a-z])/.test(password)) {
        return "密码必须包含至少一个小写字母。";
    }
    if (!/(?=.*[A-Z])/.test(password)) {
        return "密码必须包含至少一个大写字母。";
    }
    if (!/(?=.*[0-9])/.test(password)) {
        return "密码必须包含至少一个数字。";
    }
    if (!/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password)) {
        return "密码必须包含至少一个特殊符号。";
    }
    return null; // No error
}

/**
 * 更新验证反馈信息的UI。
 * @param {HTMLElement} element - 用于显示反馈的<span>元素。
 * @param {string|null} message - 错误信息，如果为null则表示验证通过。
 * @param {boolean} [isHint=false] - 这是否是一条预提示信息。
 */
function updateFeedback(element, message, isHint = false) {
    if (!element) return;
    if (message) {
        element.textContent = message;
        element.style.color = isHint ? '#888' : '#f87171'; // 灰色用于提示，红色用于错误
    } else {
        element.textContent = '✓';
        element.style.color = '#34d399'; // 绿色用于验证通过
    }
}


/**
 * 渲染“用户管理”标签页的UI结构。
 */
function renderUserAdminTab(container) {
    container.innerHTML = `
        <div id="user-management-container">
            <div class="user-list-container">
                <h3 style="margin-bottom: 1rem;">用户列表</h3>
                <ul id="user-list"></ul>
            </div>
            <div class="user-form-container">
                <form id="user-form" novalidate>
                    <h3 id="user-form-title">添加新用户</h3>
                    <div class="user-form-static-fields">
                        <input type="hidden" id="user-form-username-hidden">
                        <div class="form-group-inline">
                            <label for="user-form-username">用户名:</label>
                            <div class="input-with-feedback">
                                <input type="text" id="user-form-username" required autocomplete="off">
                                <span id="username-feedback" class="feedback-text"></span>
                            </div>
                        </div>
                        <div class="form-group-inline">
                            <label for="user-form-password">密码:</label>
                            <div class="input-with-feedback">
                                <input type="password" id="user-form-password" placeholder="留空则不修改" autocomplete="new-password">
                                <span id="password-feedback" class="feedback-text"></span>
                            </div>
                        </div>
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
        if (user.username !== currentUsername) {
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

/**
 * 当选择一个用户时，用该用户的数据填充表单。
 * @param {object} user - 用户对象。
 */
function populateUserForm(user) {
    const form = document.getElementById('user-form'); if (!form) return;
    form.reset();
    form.querySelector('.modal-error-message').textContent = '';
    form.querySelector('#user-form-title').textContent = `编辑用户: ${user.username}`;
    
    form.querySelector('#username-feedback').textContent = '';
    form.querySelector('#password-feedback').textContent = '';
    
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

/**
 * 清空并重置用户表单，用于新增用户，并显示预提示。
 */
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
    
    updateFeedback(form.querySelector('#username-feedback'), '至少6位，可包含字母、数字、_、-', true);
    updateFeedback(form.querySelector('#password-feedback'), '至少8位，含大小写、数字和符号', true);
    
    renderUserFormRoles();
    renderUserFormCategories();
    updateDefaultCategoryDropdown(form, 'all');
    
    document.querySelectorAll('#user-list li').forEach(li => li.classList.remove('selected'));
}

/**
 * 渲染用户角色选择的单选按钮。
 * @param {Array<string>} [activeRoles=['viewer']] - 用户当前拥有的角色。
 */
function renderUserFormRoles(activeRoles = ['viewer']) {
    const container = document.getElementById('user-form-roles'); if (!container) return;
    container.innerHTML = '';
    const username = document.getElementById('user-form-username').value;
    const isPublicUser = username === 'public';

    ['admin', 'editor', 'viewer'].forEach(role => {
        const currentRole = activeRoles[0] || 'viewer';
        const isChecked = currentRole === role;
        const isDisabled = isPublicUser && role !== 'viewer';
        container.innerHTML += `<div><input type="radio" id="role-${role}" name="role-selection" value="${role}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}><label for="role-${role}">${role}</label></div>`;
    });
}

/**
 * 渲染用户可见分类的复选框列表。
 * @param {Array<string>} [visibleIds=[]] - 用户可见的分类ID数组。
 * @param {boolean} [isDisabled=false] - 是否禁用所有复选框。
 */
function renderUserFormCategories(visibleIds = [], isDisabled = false) {
    const container = document.getElementById('user-form-categories'); if (!container) return;
    container.innerHTML = '';
    const sortedCategories = getHierarchicalSortedCategories(allCategories);
    sortedCategories.forEach(node => {
        container.innerHTML += `<div><input type="checkbox" id="cat-perm-${node.id}" value="${node.id}" ${visibleIds.includes(node.id) ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}><label for="cat-perm-${node.id}" style="padding-left: ${(node.level||0) * 20}px">${escapeHTML(node.name)}</label></div>`;
    });
}

/**
 * 根据用户可见分类，更新默认分类的下拉菜单选项。
 * @param {HTMLFormElement} form - 包含下拉菜单的表单元素。
 * @param {string} selectedId - 应被选中的默认分类ID。
 */
function updateDefaultCategoryDropdown(form, selectedId) {
    const defaultCatSelect = form.querySelector('#user-form-default-cat');
    const visibleCatCheckboxes = form.querySelectorAll('#user-form-categories input:checked');
    const visibleCatIds = Array.from(visibleCatCheckboxes).map(cb => cb.value);
    
    const currentSelectedValue = defaultCatSelect.value;
    defaultCatSelect.innerHTML = `<option value="all">全部书签</option>`;
    
    const categoriesToShow = allCategories.filter(cat => visibleCatIds.includes(cat.id));
    const sortedToShow = getHierarchicalSortedCategories(categoriesToShow);
    
    sortedToShow.forEach(cat => {
        defaultCatSelect.innerHTML += `<option value="${cat.id}">${'— '.repeat(cat.level || 0)}${escapeHTML(cat.name)}</option>`;
    });
    
    if (selectedId && (selectedId === 'all' || categoriesToShow.some(c => c.id === selectedId))) {
        defaultCatSelect.value = selectedId;
    } else if (categoriesToShow.some(c => c.id === currentSelectedValue)) {
        defaultCatSelect.value = currentSelectedValue;
    } else {
        defaultCatSelect.value = 'all';
    }
}


// --- 事件监听器 ---

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
                    allUsers = allUsers.filter(u => u.username !== username);
                    renderUserAdminTab(document.getElementById('tab-users'));
                } catch (error) { showToast(`删除失败: ${error.message}`, true); }
            });
        } 
        else if (userLi) {
            const usersArray = Array.isArray(allUsers) ? allUsers : Object.values(allUsers);
            const user = usersArray.find(u => u.username === userLi.dataset.username);
            if (user) populateUserForm(user);
        } 
        else if (target.closest('#user-form-clear-btn')) {
            clearUserForm();
        }
    }
});

document.addEventListener('input', event => {
    if (document.getElementById('tab-users')?.classList.contains('active')) {
        const form = document.getElementById('user-form');
        if (!form || !form.contains(event.target)) return;
        
        const usernameInput = form.querySelector('#user-form-username');
        const passwordInput = form.querySelector('#user-form-password');
        const usernameFeedback = form.querySelector('#username-feedback');
        const passwordFeedback = form.querySelector('#password-feedback');

        if (event.target === usernameInput && !usernameInput.readOnly) {
            const error = validateUsername_fe(usernameInput.value);
            updateFeedback(usernameFeedback, error);
        }

        if (event.target === passwordInput) {
            const password = passwordInput.value;
            if (!password && form.querySelector('#user-form-username-hidden').value) {
                updateFeedback(passwordFeedback, '如需修改，请输入新密码', true);
            } else {
                 const error = validatePassword_fe(password);
                 updateFeedback(passwordFeedback, error);
            }
        }
    }
});

document.addEventListener('submit', async (e) => {
    if (e.target.id === 'user-form') {
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

        if (!isEditing) {
            const usernameError = validateUsername_fe(username);
            if (usernameError) {
                errorEl.textContent = usernameError;
                return;
            }
        }
        if (!isEditing || password) {
            const passwordError = validatePassword_fe(password);
            if (passwordError) {
                errorEl.textContent = passwordError;
                return;
            }
        }

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

            if (isEditing) {
                const userIndex = allUsers.findIndex(u => u.username === savedUser.username);
                if (userIndex > -1) allUsers[userIndex] = savedUser;
            } else {
                allUsers.push(savedUser);
            }

            const token = localStorage.getItem('jwt_token');
            if (token && parseJwtPayload(token).sub === savedUser.username && !savedUser.roles.includes('admin')) {
                showToast('您的管理员权限已被移除，将退出管理后台。', true);
                setTimeout(() => window.location.href = 'index.html', 2000);
                return;
            }
            
            renderUserAdminTab(document.getElementById('tab-users'));
            populateUserForm(savedUser);

        } catch (error) {
            errorEl.textContent = error.message;
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
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
