import { SUPABASE_CONFIG } from '../scripts/config.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Elements
    const authPane = document.getElementById('auth-pane');
    const mainContent = document.getElementById('main-content');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfoEl = document.getElementById('user-info');
    const userNameEl = document.getElementById('user-name-display');

    const tabBtns = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.content-pane');
    const pageTitleEl = document.getElementById('page-title');
    const pageUrlEl = document.getElementById('page-url');
    const saveBtn = document.getElementById('save-btn');
    const saveStatus = document.getElementById('save-status');
    const searchInput = document.getElementById('search-input');
    const resultsList = document.getElementById('results-list');
    const importBtn = document.getElementById('import-bookmarks-btn');
    const settingsStatus = document.getElementById('settings-status');
    const memoryJog = document.getElementById('memory-jog');
    const jogLink = document.getElementById('jog-link');
    const jogTime = document.getElementById('jog-time');
    const nudgeContainer = document.getElementById('nudge-container');

    let currentTab = null;

    // Analytics Helper
    function trackEvent(eventName, metadata = {}) {
        chrome.runtime.sendMessage({ action: 'trackEvent', eventName, metadata });
    }

    function getTimeAgo(dateString) {
        if (!dateString) return '';
        const now = new Date();
        const past = new Date(dateString);
        const diffInMs = now - past;
        const diffInSecs = Math.floor(diffInMs / 1000);
        const diffInMins = Math.floor(diffInSecs / 60);
        const diffInHours = Math.floor(diffInMins / 60);
        const diffInDays = Math.floor(diffInHours / 24);

        if (diffInDays > 0) return `Saved ${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
        if (diffInHours > 0) return `Saved ${diffInHours} hr${diffInHours > 1 ? 's' : ''} ago`;
        if (diffInMins > 0) return `Saved ${diffInMins} min${diffInMins > 1 ? 's' : ''} ago`;
        return 'Saved just now';
    }

    // 1. Initial Auth Check
    const { supabaseSession } = await chrome.storage.local.get('supabaseSession');
    if (supabaseSession) {
        showMainInterface();
    } else {
        showAuthInterface();
    }

    function showAuthInterface() {
        authPane.style.display = 'flex';
        mainContent.style.display = 'none';
    }

    async function showMainInterface() {
        authPane.style.display = 'none';
        mainContent.style.display = 'block';

        // Get the latest session directly from storage
        const { supabaseSession: currentSession } = await chrome.storage.local.get('supabaseSession');

        if (currentSession && currentSession.user) {
            userInfoEl.style.display = 'block';
            const user = currentSession.user;

            // Debug log to see what's in the user object
            console.log('User metadata:', user.user_metadata);

            // Try multiple common fields for the name
            const name = user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                user.user_metadata?.preferred_username ||
                (user.email ? user.email.split('@')[0] : 'User');

            userNameEl.textContent = `Hello, ${name}`;
        } else {
            userNameEl.textContent = 'Hello, Guest';
        }

        // Initialize Page Data
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            currentTab = tab;
            pageTitleEl.textContent = tab.title;
            pageUrlEl.textContent = tab.url;

            // Check if already saved
            chrome.runtime.sendMessage({ action: 'checkAlreadySaved', url: tab.url }, (res) => {
                if (res && res.success && res.exists) {
                    saveBtn.textContent = '✅ Already Saved';
                    saveBtn.disabled = true;
                    saveBtn.style.background = '#333';
                    saveBtn.style.color = '#888';
                    saveBtn.style.cursor = 'default';
                }
            });
        }

        checkMemoryJog();
        showOnboardingNudge();

        // Track session active
        trackEvent('popup_opened');
    }

    async function showOnboardingNudge() {
        const { has_saved_page, has_searched } = await chrome.storage.local.get(['has_saved_page', 'has_searched']);

        nudgeContainer.innerHTML = '';

        if (!has_saved_page) {
            renderNudge('Welcome! ✨', 'Open any useful page and click "Remember this Page". You\'ll never lose it again!', '💡');
        } else if (!has_searched) {
            renderNudge('Great job! 🔍', 'Now try searching for that page in the Search tab to see how easy it is to find!', '⚡');
        }
    }

    function renderNudge(title, text, icon) {
        nudgeContainer.innerHTML = `
            <div class="nudge-banner">
                <div class="nudge-icon">${icon}</div>
                <div class="nudge-content">
                    <div class="nudge-title">${title}</div>
                    <div class="nudge-text">${text}</div>
                </div>
                <button class="nudge-close" id="close-nudge">✕</button>
            </div>
        `;
        document.getElementById('close-nudge').onclick = () => nudgeContainer.innerHTML = '';
    }

    // 2. Login Flow
    loginBtn.addEventListener('click', async () => {
        console.log('Login button clicked');
        loginBtn.disabled = true;
        loginBtn.textContent = 'Authenticating...';

        try {
            const redirectUrl = chrome.identity.getRedirectURL();
            console.log('Redirect URL:', redirectUrl);

            // Re-adding prompt=select_account to help you debug which account is used
            const authUrl = `${SUPABASE_CONFIG.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}&prompt=select_account&apikey=${SUPABASE_CONFIG.anonKey}`;

            console.log('Requesting Auth URL:', authUrl);

            chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive: true
            }, async (responseUrl) => {
                console.log('Auth Flow Response URL:', responseUrl);

                if (chrome.runtime.lastError) {
                    console.error('Identity Error:', chrome.runtime.lastError);
                    throw new Error(chrome.runtime.lastError.message);
                }

                if (!responseUrl) {
                    throw new Error('No response URL received from Google.');
                }

                // Supabase returns params in the hash
                const url = new URL(responseUrl);
                const hash = url.hash.substring(1);
                const params = new URLSearchParams(hash);

                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');
                const userRaw = params.get('user');

                if (accessToken) {
                    const session = {
                        access_token: accessToken,
                        refresh_token: refreshToken,
                        user: JSON.parse(decodeURIComponent(userRaw || '{}'))
                    };
                    await chrome.runtime.sendMessage({ action: 'setSession', session });
                    showMainInterface();
                } else {
                    // Check for error in query params (sometimes happens)
                    const error = params.get('error_description') || params.get('error') || 'No token received';
                    throw new Error(error);
                }
            });
        } catch (err) {
            console.error('Login Catch Block:', err);
            loginBtn.disabled = false;
            loginBtn.textContent = 'Error: ' + err.message.substring(0, 20) + '...';
            setTimeout(() => { loginBtn.textContent = 'Sign in with Google'; }, 5000);
            alert('Authentication Error:\n' + err.message);
        }
    });

    // 3. Logout Flow
    const handleLogout = async () => {
        await chrome.runtime.sendMessage({ action: 'logout' });
        location.reload(); // Refresh popup to show login screen
    };

    logoutBtn.addEventListener('click', handleLogout);

    // Tab Switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const target = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(target).classList.add('active');

            if (target === 'search-pane') {
                loadRecentSaves();
                // If they are in search tab, they might be searching
                const { has_saved_page, has_searched } = await chrome.storage.local.get(['has_saved_page', 'has_searched']);
                if (has_saved_page && !has_searched) {
                    chrome.storage.local.set({ has_searched: true });
                    setTimeout(() => showOnboardingNudge(), 1000);
                }
            }
        });
    });

    // Save Functionality
    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveStatus.style.display = 'block';
        saveStatus.textContent = '💾 Saving to Cloud...';
        saveStatus.className = 'status info';

        if (!currentTab) {
            saveStatus.textContent = '❌ Error: No active tab found';
            saveStatus.className = 'status error';
            saveBtn.disabled = false;
            return;
        }

        try {
            chrome.tabs.sendMessage(currentTab.id, { action: 'extractContent' }, (response) => {
                const data = response || { title: currentTab.title, url: currentTab.url };

                // Add a timeout for the save operation
                const saveTimeout = setTimeout(() => {
                    saveStatus.textContent = '❌ Connection timeout. Check your network.';
                    saveStatus.className = 'status error';
                    saveBtn.disabled = false;
                }, 10000);

                chrome.runtime.sendMessage({ action: 'savePage', data }, (res) => {
                    clearTimeout(saveTimeout);
                    if (res && res.success) {
                        saveStatus.textContent = '✅ Saved! AI is summarizing...';
                        saveStatus.className = 'status success';

                        // Update onboarding state
                        chrome.storage.local.set({ has_saved_page: true });

                        // Close window after 2 seconds
                        setTimeout(() => window.close(), 2000);

                        saveBtn.disabled = false;
                    } else {
                        const errorMsg = res?.error || 'Unknown error occurred';

                        // If it's still 401 after retry, or contains JWT expired, force logout
                        if (errorMsg.includes('JWT') || errorMsg.includes('expired') || errorMsg.includes('Unauthorized')) {
                            saveStatus.textContent = '❌ Session expired. Please log in again.';
                            setTimeout(() => handleLogout(), 2000);
                        } else {
                            saveStatus.textContent = '❌ ' + errorMsg;
                        }

                        saveStatus.className = 'status error';
                        saveBtn.disabled = false;
                    }
                });
            });
        } catch (err) {
            saveStatus.textContent = '❌ Error: ' + err.message;
            saveStatus.className = 'status error';
            saveBtn.disabled = false;
        }
    });

    // Search Functionality
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value;
        if (query.length < 2) {
            loadRecentSaves();
            return;
        }
        searchTimeout = setTimeout(() => performSearch(query), 300);
    });

    async function performSearch(query) {
        resultsList.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">AI Searching...</div>';
        chrome.runtime.sendMessage({ action: 'searchSaves', query }, (res) => {
            if (res.success) renderResults(res.data);
        });
    }

    async function loadRecentSaves() {
        chrome.runtime.sendMessage({ action: 'getRecentSaves' }, (res) => {
            if (res.success) renderResults(res.data);
        });
    }

    function renderResults(items) {
        if (!items || items.length === 0) {
            resultsList.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">No memories found.</div>';
            return;
        }
        resultsList.innerHTML = items.map(item => `
      <div class="result-item" data-url="${item.url}">
        <div class="result-title">${item.title}</div>
        <div class="result-meta">${new URL(item.url).hostname} • ${new Date(item.created_at).toLocaleDateString()}</div>
      </div>
    `).join('');

        resultsList.querySelectorAll('.result-item').forEach(el => {
            el.addEventListener('click', () => {
                const url = el.dataset.url;
                trackEvent('item_opened', { url, source: 'search_results' });
                chrome.tabs.create({ url });
            });
        });
    }

    // Memory Jog (Resurfacing)
    async function checkMemoryJog() {
        const { lastJog } = await chrome.storage.local.get('lastJog');
        const now = Date.now();

        // Use getSmartJog to fetch 3-14 day old items with fallback
        chrome.runtime.sendMessage({ action: 'getSmartJog' }, (res) => {
            if (res.success && res.data && res.data.length > 0) {
                const target = res.data[0];
                jogLink.textContent = target.title;

                if (jogTime && target.created_at) {
                    jogTime.textContent = getTimeAgo(target.created_at);
                }

                jogLink.onclick = () => {
                    trackEvent('item_opened', { url: target.url, source: 'memory_jog' });
                    chrome.tabs.create({ url: target.url });
                };
                memoryJog.style.display = 'block';
                chrome.storage.local.set({ lastJog: now });
            } else {
                memoryJog.style.display = 'none';
            }
        });
    }

    // Import Bookmarks
    importBtn.addEventListener('click', () => {
        importBtn.disabled = true;
        settingsStatus.textContent = '📥 Importing... this may take a minute.';
        settingsStatus.className = 'status info';

        chrome.runtime.sendMessage({ action: 'importBookmarks' }, (res) => {
            if (res.success) {
                settingsStatus.textContent = `✅ Successfully imported ${res.count} bookmarks!`;
                settingsStatus.className = 'status success';
            } else {
                settingsStatus.textContent = '❌ Import failed: ' + res.error;
                settingsStatus.className = 'status error';
                importBtn.disabled = false;
            }
        });
    });

    document.getElementById('open-dashboard-btn').onclick = () => {
        const dashboardUrl = 'http://localhost:5173'; // Fallback
        chrome.tabs.create({ url: dashboardUrl });
    };
});
