// Background Service Worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'savePage') {
        saveToSupabase(request.data)
            .then(() => sendResponse({ success: true }))
            .catch((error) => {
                console.error('Save failed:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep message channel open for async response
    }
});

async function saveToSupabase(data) {
    console.log('Saving to memory:', data);
    // TODO: Implement actual Supabase integration
    // For now, simulate a delay
    return new Promise((resolve) => setTimeout(resolve, 1500));
}
