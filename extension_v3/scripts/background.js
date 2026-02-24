// Background Script - Handles data sync and AI triggers
import { SUPABASE_CONFIG } from './config.js'

let session = null;

// Initial load of session and install info
chrome.storage.local.get(['supabaseSession', 'install_id'], async (result) => {
    if (result.supabaseSession) {
        session = result.supabaseSession;
        // Optionally refresh on load if close to expiry
        checkAndRefreshSession();
    }

    if (result.install_id) {
        installId = result.install_id;
    } else {
        // Fallback for existing users who didn't trigger onInstalled after update
        installId = crypto.randomUUID();
        const now = new Date().toISOString();
        await chrome.storage.local.set({
            install_timestamp: now,
            install_id: installId
        });
        trackEvent('extension_install', { reason: 'retroactive_track' });
    }
});

let installId = null;

async function checkAndRefreshSession() {
    if (!session || !session.expires_at) return;

    // Check if token expires in less than 5 minutes
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at;

    if (expiresAt - now < 300) {
        await refreshSession();
    }
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
            const now = Math.floor(Date.now() / 1000);
            session = {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_at: now + data.expires_in,
                user: data.user
            };
            await chrome.storage.local.set({ supabaseSession: session });
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

    if (request.action === 'trackEvent') {
        trackEvent(request.eventName, request.metadata)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'getSmartJog') {
        getSmartJog()
            .then((data) => sendResponse({ success: true, data }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'checkAlreadySaved') {
        checkAlreadySaved(request.url)
            .then((exists) => sendResponse({ success: true, exists }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

// Install Tracking
chrome.runtime.onInstalled.addListener(async (details) => {
    const now = new Date().toISOString();
    if (details.reason === 'install') {
        const newInstallId = crypto.randomUUID();
        await chrome.storage.local.set({
            install_timestamp: now,
            install_id: newInstallId
        });
        installId = newInstallId;
        trackEvent('extension_install', { reason: 'new_install' });
    } else if (details.reason === 'update') {
        trackEvent('extension_update', { previousVersion: details.previousVersion });
    }
});

// Analytics Helper
async function trackEvent(eventName, metadata = {}) {
    try {
        const payload = {
            event_name: eventName,
            user_id: session?.user?.id || null,
            metadata: {
                ...metadata,
                install_id: installId,
                url: metadata.url || '',
                version: chrome.runtime.getManifest().version
            },
            created_at: new Date().toISOString()
        };

        // In case of 'install', we might not have a session yet
        const auth = session ? getAuthHeader() : `Bearer ${SUPABASE_CONFIG.anonKey}`;

        fetch(`${SUPABASE_CONFIG.url}/rest/v1/analytics`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': auth,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).catch(err => console.error('Analytics fetch background error:', err));

    } catch (err) {
        console.error('Analytics tracking error:', err);
    }
}

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

        // Track success
        trackEvent('page_saved', { url: pageData.url, title: pageData.title });

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

async function getSmartJog() {
    const userIdFilter = session ? `&user_id=eq.${session.user.id}` : '';

    // 1. Try to find items 3-14 days old
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000)).toISOString();
    const fourteenDaysAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000)).toISOString();

    const oldUrl = `${SUPABASE_CONFIG.url}/rest/v1/saves?select=id,title,url,created_at${userIdFilter}&created_at=gte.${fourteenDaysAgo}&created_at=lte.${threeDaysAgo}&order=created_at.asc&limit=10`;

    try {
        const oldResponse = await fetchWithRetry(oldUrl, {
            headers: { 'apikey': SUPABASE_CONFIG.anonKey, 'Authorization': getAuthHeader() }
        });

        if (oldResponse.ok) {
            const items = await oldResponse.json();
            if (items.length > 0) {
                // Return a random one from this window
                return [items[Math.floor(Math.random() * items.length)]];
            }
        }
    } catch (e) {
        console.error('Error fetching old joggable items:', e);
    }

    // 2. Fallback to just the most recent item if no older items exist
    const recentUrl = `${SUPABASE_CONFIG.url}/rest/v1/saves?select=id,title,url,created_at${userIdFilter}&order=created_at.desc&limit=1`;
    const recentResponse = await fetchWithRetry(recentUrl, {
        headers: { 'apikey': SUPABASE_CONFIG.anonKey, 'Authorization': getAuthHeader() }
    });

    if (recentResponse.ok) return recentResponse.json();
    return [];
}

async function checkAlreadySaved(url) {
    if (!session) return false;

    // Exact match on URL for this user
    const userIdFilter = `&user_id=eq.${session.user.id}`;
    const checkUrl = `${SUPABASE_CONFIG.url}/rest/v1/saves?select=id&url=eq.${encodeURIComponent(url)}${userIdFilter}&limit=1`;

    const response = await fetchWithRetry(checkUrl, {
        headers: {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Authorization': getAuthHeader()
        }
    });

    if (response.ok) {
        const data = await response.json();
        return data.length > 0;
    }
    return false;
}

async function searchSaves(query) {
    // Track search attempt
    trackEvent('search_performed', { query_length: query.length });

    const userIdFilter = session ? `&user_id=eq.${session.user.id}` : '';

    // 1. Keyword Search (Fast, case-insensitive matches)
    // We'll search title, description, and URL using Supabase OR filters
    const keywordUrl = `${SUPABASE_CONFIG.url}/rest/v1/saves?select=*&or=(title.ilike.*${query}*,description.ilike.*${query}*,url.ilike.*${query}*)${userIdFilter}&limit=10`;

    // 2. Semantic Search (via Edge Function)
    const semanticUrl = `${SUPABASE_CONFIG.url}/functions/v1/search-saves`;

    try {
        // Run them in parallel for speed
        const [keywordRes, semanticRes] = await Promise.all([
            fetchWithRetry(keywordUrl, {
                headers: { 'apikey': SUPABASE_CONFIG.anonKey, 'Authorization': getAuthHeader() }
            }),
            fetchWithRetry(semanticUrl, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_CONFIG.anonKey,
                    'Authorization': getAuthHeader(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query })
            })
        ]);

        let keywordResults = [];
        if (keywordRes.ok) keywordResults = await keywordRes.json();

        let semanticResults = [];
        if (semanticRes.ok) {
            const data = await semanticRes.json();
            semanticResults = data.results || [];
        }

        // Merge and deduplicate
        // Use a Map to keep unique items by ID
        const combined = new Map();

        // Prioritize semantic results (they go in first)
        semanticResults.forEach(item => combined.set(item.id, item));

        // Add keyword results if they aren't already there
        // Keyword results are inherently case-insensitive because of 'ilike'
        keywordResults.forEach(item => {
            if (!combined.has(item.id)) {
                combined.set(item.id, item);
            }
        });

        const finalResults = Array.from(combined.values());
        return finalResults;

    } catch (err) {
        console.error('Hybrid search error:', err);
        // Fail gracefully with keyword results
        try {
            const fallback = await fetchWithRetry(keywordUrl, {
                headers: { 'apikey': SUPABASE_CONFIG.anonKey, 'Authorization': getAuthHeader() }
            });
            return fallback.ok ? await fallback.json() : [];
        } catch (e) {
            return [];
        }
    }
}
