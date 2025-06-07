// public/app.js

document.addEventListener('DOMContentLoaded', () => {
    const loginContainer = document.getElementById('login-container');
    const mainContent = document.getElementById('main-content');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const themeToggleButton = document.getElementById('theme-toggle');
    const localSearchInput = document.getElementById('local-search');
    const searchEngineSelect = document.getElementById('search-engine');
    const bookmarksGrid = document.getElementById('bookmarks-grid');
    const categoryNav = document.getElementById('category-nav');
    const logoutButton = document.getElementById('logout-btn');

    let allBookmarks = [];
    let allCategories = [];

    // --- 主题切换逻辑 ---
    const applyTheme = (theme) => {
        document.body.className = theme;
        localStorage.setItem('theme', theme);
    };

    const checkTimeAndSetTheme = () => {
        const shanghaiTime = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Shanghai', hour12: false });
        const hour = parseInt(shanghaiTime.split(':')[0], 10);
        const autoTheme = (hour >= 6 && hour < 18) ? 'light-theme' : 'dark-theme';
        applyTheme(autoTheme);
    };

    themeToggleButton.addEventListener('click', () => {
        const newTheme = document.body.classList.contains('light-theme') ? 'dark-theme' : 'light-theme';
        applyTheme(newTheme);
    });
    
    // 初始加载时应用主题
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        checkTimeAndSetTheme();
    }
    setInterval(checkTimeAndSetTheme, 60000); // 每分钟检查一次时间自动切换


    // --- 认证逻辑 ---
    const getToken = () => localStorage.getItem('jwt_token');

    const checkLoginStatus = async () => {
        if (getToken()) {
            loginContainer.style.display = 'none';
            mainContent.style.display = 'block';
            await loadData();
        } else {
            loginContainer.style.display = 'block';
            mainContent.style.display = 'none';
        }
    };

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const noExpiry = document.getElementById('no-expiry').checked;

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, noExpiry })
            });
            if (!response.ok) throw new Error((await response.json()).error || '登录失败');
            
            const { token } = await response.json();
            localStorage.setItem('jwt_token', token);
            await checkLoginStatus();

        } catch (error) {
            loginError.textContent = error.message;
        }
    });

    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwt_token');
        checkLoginStatus();
        // 清理页面数据
        allBookmarks = [];
        allCategories = [];
        categoryNav.innerHTML = '';
        bookmarksGrid.innerHTML = '';
    });


    // --- 数据加载和渲染 ---
    const loadData = async () => {
        try {
            const response = await fetch('/data', {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (response.status === 401) { // Token 过期或无效
                localStorage.removeItem('jwt_token');
                checkLoginStatus();
                return;
            }
            if (!response.ok) throw new Error('无法加载数据');
            
            const data = await response.json();
            allCategories = data.categories;
            allBookmarks = data.bookmarks;
            renderCategories();
            renderBookmarks(); // 默认显示所有
        } catch (error) {
            console.error('Data loading error:', error);
        }
    };

    const renderCategories = () => {
        categoryNav.innerHTML = '<button class="category-btn active" data-id="all">全部</button>';
        allCategories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'category-btn';
            btn.textContent = cat.name;
            btn.dataset.id = cat.id;
            categoryNav.appendChild(btn);
        });

        // 添加分类按钮点击事件
        categoryNav.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                categoryNav.querySelector('.active').classList.remove('active');
                btn.classList.add('active');
                renderBookmarks(btn.dataset.id);
            });
        });
    };
    
    const renderBookmarks = (categoryId = 'all', searchTerm = '') => {
        bookmarksGrid.innerHTML = '';
        let filteredBookmarks = allBookmarks;

        if (categoryId !== 'all') {
            filteredBookmarks = filteredBookmarks.filter(bm => bm.categoryId === categoryId);
        }

        if (searchTerm) {
            searchTerm = searchTerm.toLowerCase();
            filteredBookmarks = filteredBookmarks.filter(bm => 
                bm.name.toLowerCase().includes(searchTerm) || 
                bm.url.toLowerCase().includes(searchTerm)
            );
        }
        
        filteredBookmarks.forEach(bm => {
            const card = document.createElement('a');
            card.href = bm.url;
            card.className = 'bookmark-card';
            card.target = '_blank';
            card.rel = 'noopener noreferrer';
            
            const defaultIcon = `https://www.google.com/s2/favicons?domain=${new URL(bm.url).hostname}`;

            card.innerHTML = `
                <h3>
                    <img src="${bm.icon || defaultIcon}" alt="${bm.name} icon" onerror="this.src='${defaultIcon}'; this.onerror=null;">
                    ${bm.name}
                </h3>
                <p>${bm.description || ''}</p>
            `;
            bookmarksGrid.appendChild(card);
        });
    };

    // --- 搜索功能 ---
    localSearchInput.addEventListener('keyup', (e) => {
        const searchTerm = e.target.value;
        // 如果按下 Enter 且输入框不为空, 则进行网络搜索
        if (e.key === 'Enter' && searchTerm.trim() !== '') {
            const searchURL = searchEngineSelect.value + encodeURIComponent(searchTerm);
            window.open(searchURL, '_blank');
        } else {
             // 否则，进行本地书签搜索
            const activeCategoryId = categoryNav.querySelector('.active').dataset.id;
            renderBookmarks(activeCategoryId, searchTerm);
        }
    });

    // --- 初始化 ---
    checkLoginStatus();
});
