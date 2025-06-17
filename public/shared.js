// shared.js

/**
 * 一个用于发送API请求的辅助函数。
 * @param {string} endpoint - API的端点路径 (例如 'login' 或 'bookmarks/123')。
 * @param {string} [method='GET'] - HTTP请求方法 (GET, POST, PUT, DELETE)。
 * @param {object|null} [body=null] - 对于POST或PUT请求，要发送的JSON数据体。
 * @returns {Promise<any>} - 返回一个解析后的JSON响应的Promise。
 */
async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('jwt_token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const options = { 
        method, 
        headers,
        cache: 'no-cache' // 确保每次都从服务器获取最新数据
    };

    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`/api/${endpoint}`, options);
    
    // 204 No Content 响应没有响应体
    if (response.status === 204) {
        return null;
    }
    
    let result;
    try {
        result = await response.json();
    } catch (e) {
        // 如果响应不是有效的JSON，则抛出错误
        throw new Error(`从服务器返回的响应无效`);
    }

    if (!response.ok) {
        // 如果服务器返回错误状态码，则抛出带有错误信息的异常
        throw new Error(result.error || `请求失败，状态码: ${response.status}`);
    }
    
    return result;
}

/**
 * 对HTML字符串进行转义，防止XSS攻击。
 * @param {string} str - 需要转义的字符串。
 * @returns {string} - 转义后的安全字符串。
 */
function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, (match) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[match]));
}

/**
 * 防抖动函数，用于限制一个函数被频繁调用的次数。
 * @param {Function} func - 需要防抖的函数。
 * @param {number} wait - 延迟执行的毫秒数。
 * @returns {Function} - 一个新的、经过防抖处理的函数。
 */
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

/**
 * 解析JWT令牌的载荷部分，无需验证签名。
 * 仅用于从令牌中安全地读取信息（如用户名、角色）。
 * @param {string} token - JWT令牌字符串。
 * @returns {object|null} - 解析后的载荷对象，或在失败时返回null。
 */
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
