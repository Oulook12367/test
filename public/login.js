// login.js - 最终版，包含前端引导安装逻辑

/**
 * 渲染“安装程序”界面
 * @param {HTMLElement} container - 用于渲染UI的父容器
 */
function renderInstaller(container) {
    // 使用您原始 login.html 的 class 来保持样式一致性
    container.innerHTML = `
        <div class="installer-container" style="text-align: center;">
            <h1 class="auth-title">欢迎使用 NaviCenter</h1>
            <p class="auth-subtitle">系统需要初始化才能开始使用。此过程将创建默认的管理员账户和基础设置。</p>
            <button id="install-btn" class="button button-primary full-width">一键安装</button>
            <p id="install-status" class="error-message"></p>
        </div>
    `;

    document.getElementById('install-btn').addEventListener('click', async (e) => {
        const btn = e.target;
        const statusEl = document.getElementById('install-status');

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在安装...';
        statusEl.textContent = '正在创建数据库和默认用户，请稍候...';
        statusEl.style.color = '#cbd5e0';

        try {
            const response = await fetch('/api/system/initialize', { method: 'POST' });
            const result = await response.json();

            if (response.ok && result.success) {
                statusEl.textContent = `安装成功！默认管理员: admin / admin123。页面将在3秒后自动刷新...`;
                statusEl.style.color = '#34d399';
                setTimeout(() => window.location.reload(), 3000);
            } else {
                throw new Error(result.error || '未知错误，请检查后端函数日志。');
            }
        } catch (error) {
            statusEl.textContent = `安装失败: ${error.message}`;
            statusEl.style.color = '#f87171';
            btn.disabled = false;
            btn.textContent = '重试安装';
        }
    });
}

/**
 * 渲染“登录”界面
 * @param {HTMLElement} container - 用于渲染UI的父容器
 */
function renderLoginPage(container) {
    // 这里的HTML结构完全来自于您最初提供的 login.html
    container.innerHTML = `
        <h1 class="auth-title">导航中心</h1>
        <p class="auth-subtitle">通往您数字世界的传送门</p>
        <form id="login-form" novalidate>
            <div class="form-group">
                <input type="text" id="username" placeholder="用户名" required autocomplete="username">
            </div>
            <div class="form-group">
                <input type="password" id="password" placeholder="密码" required autocomplete="current-password">
            </div>
            <p id="login-error" class="error-message"></p>
            <button type="submit" class="button button-primary full-width">安全登录</button>
        </form>
    `;

    // 为动态渲染出的登录表单添加提交事件监听
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const loginError = document.getElementById('login-error');
        const submitButton = e.target.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;

        if (loginError) loginError.textContent = '';
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登录中...';

        try {
            // 您可能有一个全局的 apiRequest 函数，但为了独立性这里直接使用 fetch
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || '登录失败');
            }

            localStorage.setItem('jwt_token', result.token);
            window.location.href = 'index.html';
        } catch (error) {
            if (loginError) loginError.textContent = error.message;
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
        }
    });
}

/**
 * 应用主初始化函数：检查系统状态并决定渲染哪个界面
 */
async function initializeApp() {
    const container = document.getElementById('app-container');
    if (!container) {
        console.error('错误: 未找到 #app-container 容器!');
        document.body.innerHTML = '<p style="color:red; text-align:center;">页面HTML结构错误，缺少ID为"app-container"的元素。</p>';
        return;
    }
    
    document.body.classList.remove('is-loading');

    // 如果已登录，直接跳转
    if (localStorage.getItem('jwt_token')) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch('/api/data');
        const data = await response.json();

        // 核心检查点：检查后端返回的信号
        if (data && data.not_initialized) {
            renderInstaller(container);
        } else {
            renderLoginPage(container);
        }
    } catch (error) {
        console.error("加载初始数据失败:", error);
        container.innerHTML = `
            <div style="text-align: center;">
                <h1 class="auth-title">连接错误</h1>
                <p class="auth-subtitle">无法连接到后端服务，请检查网络连接或后端部署状态。</p>
                <p class="error-message">${error.message}</p>
            </div>`;
    }
}

// 页面加载完成后，启动整个应用的入口函数
document.addEventListener('DOMContentLoaded', initializeApp);
