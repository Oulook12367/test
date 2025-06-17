// login.js

document.addEventListener('DOMContentLoaded', () => {
    // 获取页面上的元素
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    // 页面加载完成后，立即移除加载遮罩
    document.body.classList.remove('is-loading');

    // 如果用户已经登录（本地存有token），则直接跳转到主页，无需再次登录
    if (localStorage.getItem('jwt_token')) {
        window.location.href = 'index.html';
        return; // 结束脚本执行
    }

    // 为登录表单添加提交事件监听
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            // 阻止浏览器默认的表单提交（刷新页面）行为
            e.preventDefault();
            
            // 清空之前的错误信息
            if(loginError) loginError.textContent = '';
            
            const submitButton = loginForm.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.textContent;
            
            // 禁用按钮并显示加载状态，防止重复提交
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登录中...';

            try {
                // 调用后端的 /api/login 接口
                const result = await apiRequest('login', 'POST', {
                    username: document.getElementById('username').value,
                    password: document.getElementById('password').value,
                });

                // 登录成功后，将服务器返回的token存入浏览器的localStorage
                localStorage.setItem('jwt_token', result.token);
                // 跳转到主导航页
                window.location.href = 'index.html';

            } catch (error) {
                // 如果登录失败，在页面上显示错误信息
                if(loginError) loginError.textContent = error.message;
                
                // 恢复按钮状态
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonText;
            }
        });
    }
});
