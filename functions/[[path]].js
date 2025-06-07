// functions/[[path]].js

import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = () => new TextEncoder().encode(globalThis.JWT_SECRET_STRING);

const hashPassword = async (password) => { /* ... full function ... */ };
const getSiteData = async (env) => { /* ... full function ... */ };
const saveSiteData = async (env, data) => { /* ... full function ... */ };
const authenticateRequest = async (request, env, requiredRole) => { /* ... full function ... */ };
const jsonResponse = (data, status = 200) => { /* ... full function ... */ };

export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    const apiRoutePatterns = ['/login', '/data', '/bookmarks', '/change-password', '/users', '/categories'];
    const isApiRequest = apiRoutePatterns.some(p => path.startsWith(p));
    
    if (!isApiRequest) {
        return next();
    }
    
    globalThis.JWT_SECRET_STRING = env.JWT_SECRET;
    
    // Login Route
    if (path === '/login' && request.method === 'POST') { /* ... full logic ... */ }
    
    // Get Data Route
    if (path === '/data' && request.method === 'GET') { /* ... full logic ... */ }
    
    // Bookmarks CRUD
    if (path.startsWith('/bookmarks')) { /* ... full logic ... */ }
    
    // Change Password
    if (path === '/change-password' && request.method === 'POST') { /* ... full logic ... */ }
    
    // User Management
    if (path.startsWith('/users')) { /* ... full logic ... */ }
    
    // Categories CRUD
    if (path.startsWith('/categories')) { /* ... full logic ... */ }

    return jsonResponse({ error: 'API endpoint not found' }, 404);
}
