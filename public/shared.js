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
