// Content Script
console.log('Never Lose What You Save Online: Content script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
        sendResponse({
            title: document.title,
            url: window.location.href,
            description: document.querySelector('meta[name="description"]')?.content || '',
            selectedText: window.getSelection().toString(),
            timestamp: new Date().toISOString()
        });
    }
});
