// login.js - 最终版，包含前端引导安装逻辑

/**
 * 渲染“安装程序”界面
 * @param {HTMLElement} container - 用于渲染UI的父容器
 */
function renderInstaller(container) {
    // 使用您原始 login.html 的 class 来保持样式一致性
    container.innerHTML = `
        <div class="installer-container">
            <h1 class="auth-title">欢迎使用 NaviCenter</h1>
            <p class="auth-subtitle">系统需要初始化才能开始使用。此过程将创建默认的管理员账户和基础设置。</p>
            <button id="install-btn" class="button button-primary full-width">一键安装</button>
            <p id="install-status" class="error-message"></p>
        </div>
    `;

    document.getElementById('install-btn').addEventListener('click', async (e) => {
        const btn = e.target;
        const statusEl = document.getElementById('install-status');

        // 禁用按钮并显示加载状态
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在安装...';
        statusEl.textContent = '正在创建数据库和默认用户，请稍候...';
        statusEl.style.color = '#cbd5e0'; // 使用中性颜色提示

        try {
            // 调用后端的专用安装接口
            const response = await fetch('/api/system/initialize', { method: 'POST' });
            const result = await response.json();

            if (response.ok && result.success) {
                statusEl.textContent = `安装成功！默认管理员: admin / admin123。页面将在3秒后自动刷新...`;
                statusEl.style.color = '#34d399'; // 成功状态的绿色
                setTimeout(() => window.location.reload(), 3000);
            } else {
                // 如果后端返回错误，则抛出
                throw new Error(result.error || '未知错误，请检查后端函数日志。');
            }
        } catch (error) {
            statusEl.textContent = `安装失败: ${error.message}`;
            statusEl.style.color = '#f87171'; // 失败状态的红色
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
            // 使用 fetch 调用后端的 /api/login 接口
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || '登录失败');
            }

            // 登录成功，保存 token 并跳转
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

    // 移除您 body 上的 is-loading class (如果有的话)
    document.body.classList.remove('is-loading');

    // 如果用户已经登录，直接跳转到主页，避免不必要的数据请求
    if (localStorage.getItem('jwt_token')) {
        window.location.href = 'index.html';
        return;
    }

    try {
        // 发起第一个探查请求
        const response = await fetch('/api/data');
        const data = await response.json();

        // 核心检查点：检查后端返回的信号
        if (data && data.not_initialized) {
            // 后端明确告知未初始化，渲染安装程序
            renderInstaller(container);
        } else {
            // 系统已初始化，渲染登录页面
            renderLoginPage(container);
        }
    } catch (error) {
        console.error("加载初始数据失败:", error);
        container.innerHTML = `
            <div class="installer-container">
                <h1 class="auth-title">连接错误</h1>
                <p class="auth-subtitle">无法连接到后端服务，请检查网络连接或后端部署状态。</p>
                <p class="error-message">${error.message}</p>
            </div>`;
    }
}

// 页面加载完成后，启动整个应用的入口函数
document.addEventListener('DOMContentLoaded', initializeApp);
