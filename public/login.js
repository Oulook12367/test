document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    // Remove loading screen
    document.body.classList.remove('is-loading');

    // Redirect if already logged in
    if (localStorage.getItem('jwt_token')) {
        window.location.href = 'index.html';
        return;
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        const submitButton = loginForm.querySelector('button');
        submitButton.disabled = true;
        submitButton.textContent = '登录中...';

        try {
            const result = await apiRequest('login', 'POST', {
                username: document.getElementById('username').value,
                password: document.getElementById('password').value,
            });
            localStorage.setItem('jwt_token', result.token);
            window.location.href = 'index.html'; // Redirect to main page on success
        } catch (error) {
            loginError.textContent = error.message;
            submitButton.disabled = false;
            submitButton.textContent = '登录';
        }
    });
});
