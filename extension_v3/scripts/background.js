// Background Script - Handles data sync and AI triggers
import { SUPABASE_CONFIG } from './config.js'

let session = null;

// Initial load of session
chrome.storage.local.get(['supabaseSession'], (result) => {
    if (result.supabaseSession) {
        session = result.supabaseSession;
        // Optionally refresh on load if close to expiry
        checkAndRefreshSession();
    }
});

async function checkAndRefreshSession() {
    if (!session || !session.refresh_token) return;

    // Simple way to check if token is expired or about to expire (Supabase tokens usually last 1h)
    // For now, we'll just try to refresh if the request fails, or proactively refresh if we want.
}

async function refreshSession() {
    if (!session || !session.refresh_token) return;

    try {
        const response = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: session.refresh_token })
        });

        if (response.ok) {
            const data = await response.json();
            session = {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                user: data.user
            };
            await chrome.storage.local.set({ supabaseSession: session });
            console.log('Session refreshed successfully');
            return true;
        } else {
            console.error('Failed to refresh session, logging out');
            session = null;
            await chrome.storage.local.remove(['supabaseSession']);
            return false;
        }
    } catch (err) {
        console.error('Refresh error:', err);
        return false;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'savePage') {
        saveWithFetch(request.data)
            .then((data) => sendResponse({ success: true, data }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'getRecentSaves') {
        getRecentSaves()
            .then((data) => sendResponse({ success: true, data }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'searchSaves') {
        searchSaves(request.query)
            .then((data) => sendResponse({ success: true, data }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'importBookmarks') {
        importBookmarks()
            .then((count) => sendResponse({ success: true, count }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'setSession') {
        session = request.session;
        chrome.storage.local.set({ supabaseSession: session });
        sendResponse({ success: true });
    }

    if (request.action === 'logout') {
        session = null;
        chrome.storage.local.remove(['supabaseSession']);
        sendResponse({ success: true });
    }
});

function getAuthHeader() {
    return session ? `Bearer ${session.access_token}` : `Bearer ${SUPABASE_CONFIG.anonKey}`;
}

// Original save/search functions removed - replaced by versions with retry logic below

async function importBookmarks() {
    return new Promise((resolve, reject) => {
        chrome.bookmarks.getTree(async (tree) => {
            const bookmarks = [];
            const flatten = (nodes) => {
                nodes.forEach(node => {
                    if (node.url) bookmarks.push({ title: node.title, url: node.url });
                    if (node.children) flatten(node.children);
                });
            };
            flatten(tree);

            let importedCount = 0;
            // Batch processing for large bookmark sets
            for (let i = 0; i < bookmarks.length; i += 5) {
                const batch = bookmarks.slice(i, i + 5);
                const dataToSave = batch.map(b => ({
                    title: b.title,
                    url: b.url,
                    user_id: session?.user?.id || null,
                    created_at: new Date().toISOString()
                }));

                try {
                    const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/saves`, {
                        method: 'POST',
                        headers: {
                            'apikey': SUPABASE_CONFIG.anonKey,
                            'Authorization': getAuthHeader(),
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(dataToSave)
                    });
                    if (response.ok) importedCount += batch.length;
                } catch (e) {
                    console.error('Import batch failed:', e);
                }
            }
            resolve(importedCount);
        });
    });
}

async function triggerAIWithFetch(saveId) {
    try {
        const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/process-save`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ save_id: saveId })
        });

        if (response.status === 401) {
            const refreshed = await refreshSession();
            if (refreshed) return triggerAIWithFetch(saveId); // Retry
        }
    } catch (err) {
        console.error('AI trigger failed:', err);
    }
}

// Helper to wrap fetch with refresh logic
async function fetchWithRetry(url, options = {}, retries = 1) {
    const response = await fetch(url, options);

    if (response.status === 401 && retries > 0) {
        const body = await response.clone().json().catch(() => ({}));
        if (body.message?.includes('JWT') || body.code === 'PGRST301' || response.statusText.includes('Unauthorized')) {
            const refreshed = await refreshSession();
            if (refreshed) {
                // Update header and retry
                options.headers['Authorization'] = getAuthHeader();
                return fetchWithRetry(url, options, retries - 1);
            }
        }
    }
    return response;
}

// Redirect all fetches to use fetchWithRetry if needed
// Update saveWithFetch to use fetchWithRetry
async function saveWithFetch(pageData) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetchWithRetry(`${SUPABASE_CONFIG.url}/rest/v1/saves`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            signal: controller.signal,
            body: JSON.stringify({
                url: pageData.url,
                title: pageData.title,
                description: pageData.description || '',
                selected_text: pageData.selectedText || '',
                user_id: session?.user?.id || null,
                created_at: new Date().toISOString()
            })
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || 'Supabase error: ' + response.statusText);
        }

        const data = await response.json();
        const savedItem = data[0];
        triggerAIWithFetch(savedItem.id);
        return savedItem;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error('Supabase request timed out. Please check your connection.');
        }
        throw err;
    }
}

async function getRecentSaves() {
    const userIdFilter = session ? `&user_id=eq.${session.user.id}` : '';
    const response = await fetchWithRetry(`${SUPABASE_CONFIG.url}/rest/v1/saves?select=id,title,url,created_at${userIdFilter}&order=created_at.desc&limit=10`, {
        headers: {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Authorization': getAuthHeader()
        }
    });
    if (!response.ok) throw new Error('Failed to fetch recent saves');
    return response.json();
}

async function searchSaves(query) {
    const response = await fetchWithRetry(`${SUPABASE_CONFIG.url}/functions/v1/search-saves`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Authorization': getAuthHeader(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });

    if (!response.ok) {
        const userIdFilter = session ? `&user_id=eq.${session.user.id}` : '';
        const fallbackResponse = await fetchWithRetry(`${SUPABASE_CONFIG.url}/rest/v1/saves?select=*&title=ilike.*${query}*${userIdFilter}&limit=10`, {
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': getAuthHeader()
            }
        });
        return fallbackResponse.json();
    }

    const data = await response.json();
    return data.results || [];
}
