// Content Script
console.log('Never Lose Again: Content script loaded');

// Extract meta description
function getMetaDescription() {
    const meta = document.querySelector('meta[name="description"]');
    return meta ? meta.getAttribute('content') : '';
}

// Extract selected text
function getSelectedText() {
    return window.getSelection().toString();
}

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
        sendResponse({
            title: document.title,
            url: window.location.href,
            description: getMetaDescription(),
            selectedText: getSelectedText(),
            timestamp: new Date().toISOString()
        });
    }
});
