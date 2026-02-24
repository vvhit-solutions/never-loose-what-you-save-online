// Content Script
console.log('Never Lose What You Save Online: Content script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
        const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
        let bodyText = '';

        // If meta description is missing or very short, grab some page text
        if (metaDescription.length < 50) {
            bodyText = document.body.innerText
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 2000);
        }

        sendResponse({
            title: document.title,
            url: window.location.href,
            description: metaDescription || bodyText,
            selectedText: window.getSelection().toString().slice(0, 1000), // Cap selection
            timestamp: new Date().toISOString()
        });
    }
});
