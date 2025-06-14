// --- API Helper ---
async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('jwt_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const options = { method, headers, cache: 'no-cache' };
    if (body) options.body = JSON.stringify(body);
    
    const response = await fetch(`/api/${endpoint}`, options);
    if (response.status === 204) return null;
    
    let result;
    try {
        result = await response.json();
    } catch (e) {
        throw new Error(`从服务器返回的响应无效`);
    }
    if (!response.ok) {
        throw new Error(result.error || `请求失败，状态码: ${response.status}`);
    }
    return result;
}

// --- HTML Escape Helper ---
function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, (match) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[match]));
}

// --- Debounce Helper ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}



function parseJwtPayload(token) {
    if (!token || typeof token !== 'string') {
        return null;
    }
    try {
        const base64Url = token.split('.')[1];
        if (!base64Url) {
            return null;
        }
        // 将 Base64Url 编码转换回标准的 Base64 编码
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        // 解码并处理 UTF-8 字符
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("解析 Token 失败:", e);
        return null; // 如果解析失败，返回 null
    }
}
