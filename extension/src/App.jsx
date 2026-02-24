import { useState, useEffect } from 'react'
import './App.css'

function App() {
    const [status, setStatus] = useState('idle') // idle, saving, saved, error
    const [pageInfo, setPageInfo] = useState(null)

    useEffect(() => {
        // Get current tab info
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0]
            setPageInfo({
                title: activeTab.title,
                url: activeTab.url
            })
        })
    }, [])

    const handleSave = async () => {
        setStatus('saving')

        try {
            // Send message to background script to save
            chrome.runtime.sendMessage({ action: 'savePage', data: pageInfo }, (response) => {
                if (response && response.success) {
                    setStatus('saved')
                } else {
                    setStatus('error')
                }
            })
        } catch (err) {
            console.error(err)
            setStatus('error')
        }
    }

    return (
        <div className="popup-container">
            <header>
                <h1>Never Lose Again</h1>
                <p className="subtitle">Internet Memory</p>
            </header>

            <main>
                {pageInfo && (
                    <div className="page-preview">
                        <p className="page-title">{pageInfo.title}</p>
                        <p className="page-url">{pageInfo.url}</p>
                    </div>
                )}

                {status === 'idle' && (
                    <button className="save-btn" onClick={handleSave}>
                        Save to Memory
                    </button>
                )}

                {status === 'saving' && (
                    <div className="status-saving">
                        <span className="loader"></span> Saving...
                    </div>
                )}

                {status === 'saved' && (
                    <div className="status-saved">
                        ✅ Saved to your memory!
                    </div>
                )}

                {status === 'error' && (
                    <div className="status-error">
                        ❌ Something went wrong.
                    </div>
                )}
            </main>
        </div>
    )
}

export default App
