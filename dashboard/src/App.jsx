import { useState, useEffect } from 'react'
import './App.css'

// Configuration (Should come from environment variables in production)
const SUPABASE_URL = 'https://cafgyalmjsfvsymuldml.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8x0pYyyfuIBNDQSi0TZJdw_O5Dgd9-O';

function App() {
    const [saves, setSaves] = useState([])
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(true)
    const [isSearching, setIsSearching] = useState(false)

    // Fetch all saves on load
    useEffect(() => {
        fetchSaves()
    }, [])

    const fetchSaves = async () => {
        if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
            // Mock data if no credentials provided
            const mockSaves = [
                { id: 1, title: 'How to build a SaaS', url: 'https://example.com', summary: 'A guide to SaaS startup.', tags: ['#saas'], created_at: new Date().toISOString() },
                { id: 2, title: 'OpenAI Embeddings', url: 'https://openai.com', summary: 'Docs for embeddings.', tags: ['#ai'], created_at: new Date().toISOString() }
            ]
            setSaves(mockSaves)
            setLoading(false)
            return
        }

        setLoading(true)
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/saves?select=*&order=created_at.desc`, {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            })
            const data = await response.json()
            setSaves(data)
        } catch (err) {
            console.error('Fetch failed:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleSearch = async (e) => {
        const query = e.target.value
        setSearchQuery(query)

        if (query.trim().length === 0) {
            fetchSaves()
            return
        }

        if (query.length < 3) return

        setIsSearching(true)
        try {
            // Natural Language Search via Edge Function
            const response = await fetch(`${SUPABASE_URL}/functions/v1/search-saves`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query })
            })
            const data = await response.json()
            setSaves(data.results || [])
        } catch (err) {
            console.error('Search failed:', err)
        } finally {
            setIsSearching(false)
        }
    }

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <div className="logo-container">
                    <h1 className="logo-text">Never Lose Again</h1>
                    <p className="logo-tagline">Your personal internet memory</p>
                </div>
                <div className="search-container">
                    <input
                        type="text"
                        placeholder="Search your memories with natural language..."
                        value={searchQuery}
                        onChange={handleSearch}
                        className="search-input"
                    />
                    {isSearching && <span className="search-status">AI searching...</span>}
                </div>
            </header>

            <main className="dashboard-main">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Retrieving your memories...</p>
                    </div>
                ) : (
                    <div className="saves-grid">
                        {saves.length === 0 ? (
                            <p className="empty-state">No memories found yet. Save a page from Chrome!</p>
                        ) : (
                            saves.map(save => (
                                <div key={save.id} className="save-card">
                                    <div className="card-header">
                                        <h3 className="save-title">{save.title}</h3>
                                        <a href={save.url} target="_blank" rel="noreferrer" className="save-link">↗</a>
                                    </div>
                                    <p className="save-summary">{save.summary || 'Summary coming soon...'}</p>
                                    <div className="card-footer">
                                        <div className="tags">
                                            {save.tags?.map(tag => (
                                                <span key={tag} className="tag">{tag}</span>
                                            ))}
                                        </div>
                                        <span className="save-date">
                                            {new Date(save.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}

export default App
