// Background Script - Handles data sync and AI triggers
import { SUPABASE_CONFIG } from './config.js'

let session = null;

// Initial load of session
chrome.storage.local.get(['supabaseSession'], (result) => {
    if (result.supabaseSession) {
        session = result.supabaseSession;
    }
});

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

async function saveWithFetch(pageData) {
    const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/saves`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Authorization': getAuthHeader(),
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({
            url: pageData.url,
            title: pageData.title,
            description: pageData.description || '',
            selected_text: pageData.selectedText || '',
            user_id: session?.user?.id || null, // Important for row-level security
            created_at: new Date().toISOString()
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Save failed');
    }

    const data = await response.json();
    const savedItem = data[0];
    triggerAIWithFetch(savedItem.id);
    return savedItem;
}

async function getRecentSaves() {
    const userIdFilter = session ? `&user_id=eq.${session.user.id}` : '';
    const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/saves?select=id,title,url,created_at${userIdFilter}&order=created_at.desc&limit=10`, {
        headers: {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Authorization': getAuthHeader()
        }
    });
    if (!response.ok) throw new Error('Failed to fetch recent saves');
    return response.json();
}

async function searchSaves(query) {
    // Try semantic search via Edge Function
    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/search-saves`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Authorization': getAuthHeader(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });

    if (!response.ok) {
        // Fallback to basic keyword search if Edge Function fails
        const userIdFilter = session ? `&user_id=eq.${session.user.id}` : '';
        const fallbackResponse = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/saves?select=*&title=ilike.*${query}*${userIdFilter}&limit=10`, {
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
        fetch(`${SUPABASE_CONFIG.url}/functions/v1/process-save`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ save_id: saveId })
        });
    } catch (err) {
        console.error('AI trigger failed:', err);
    }
}
