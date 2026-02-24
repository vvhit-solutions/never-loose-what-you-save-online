document.addEventListener('DOMContentLoaded', async () => {
    // Elements
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

    let currentTab = null;

    // Initialize
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    pageTitleEl.textContent = tab.title;
    pageUrlEl.textContent = tab.url;

    checkMemoryJog();

    // Tab Switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(target).classList.add('active');

            if (target === 'search-pane') loadRecentSaves();
        });
    });

    // Save Functionality
    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveStatus.textContent = '💾 Saving to Cloud...';
        saveStatus.className = 'status info';

        chrome.tabs.sendMessage(currentTab.id, { action: 'extractContent' }, (response) => {
            const data = response || { title: currentTab.title, url: currentTab.url };
            chrome.runtime.sendMessage({ action: 'savePage', data }, (res) => {
                if (res.success) {
                    saveStatus.textContent = '✅ Saved! AI is summarizing...';
                    saveStatus.className = 'status success';
                    setTimeout(() => { saveStatus.style.display = 'none'; }, 3000);
                } else {
                    saveStatus.textContent = '❌ ' + (res.error || 'Failed to save');
                    saveStatus.className = 'status error';
                    saveBtn.disabled = false;
                }
            });
        });
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
                chrome.tabs.create({ url: el.dataset.url });
            });
        });
    }

    // Memory Jog (Resurfacing)
    async function checkMemoryJog() {
        // For the best UX, we'll try to show a memory jog if we have saves,
        // but prioritize showing it if it's been a while.
        const { lastJog } = await chrome.storage.local.get('lastJog');
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        // We'll show a "random discovery" almost always if items exist,
        // but the user can dismiss it or we can rotate it daily.
        chrome.runtime.sendMessage({ action: 'getRecentSaves' }, (res) => {
            if (res.success && res.data && res.data.length > 0) {
                // Pick a random item from the last 10
                const random = res.data[Math.floor(Math.random() * res.data.length)];
                jogLink.textContent = random.title;
                jogLink.onclick = () => chrome.tabs.create({ url: random.url });
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
        chrome.tabs.create({ url: 'http://localhost:5173' }); // Adjust if needed
    };
});
