import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import './index.css'

// Configuration
const SUPABASE_URL = 'https://cafgyalmjsfvsymuldml.supabase.co';
const SUPABASE_KEY = 'sb_publishable_uI-NEN1GyZXa8n2LdGf4NQ_wlaODqmm';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function formatRelativeTime(dateString) {
    const now = new Date();
    const then = new Date(dateString);
    const diffInSeconds = Math.floor((now - then) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return then.toLocaleDateString();
}

function App() {
    const [user, setUser] = useState(null)
    const [saves, setSaves] = useState([])
    const [jogItem, setJogItem] = useState(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(true)
    const [isSearching, setIsSearching] = useState(false)

    useEffect(() => {
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null)
            if (session) {
                fetchSaves(session.user.id)
                fetchSmartJog(session.user.id)
            } else {
                setLoading(false)
            }
        })

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
            if (session) {
                fetchSaves(session.user.id)
                fetchSmartJog(session.user.id)
            } else {
                setSaves([])
                setJogItem(null)
                setLoading(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    const fetchSaves = async (userId) => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('saves')
                .select('id, title, url, summary, tags, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20)

            if (error) throw error
            setSaves(data)
        } catch (err) {
            console.error('Fetch failed:', err)
        } finally {
            setLoading(false)
        }
    }

    const fetchSmartJog = async (userId) => {
        const now = new Date();
        const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000)).toISOString();
        const fourteenDaysAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000)).toISOString();

        try {
            // Priority 1: 3-14 day old items
            const { data: oldItems } = await supabase
                .from('saves')
                .select('*')
                .eq('user_id', userId)
                .gte('created_at', fourteenDaysAgo)
                .lte('created_at', threeDaysAgo)
                .limit(10)

            if (oldItems && oldItems.length > 0) {
                setJogItem(oldItems[Math.floor(Math.random() * oldItems.length)])
                return
            }

            // Fallback: Most recent item
            const { data: recentItems } = await supabase
                .from('saves')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)

            if (recentItems && recentItems.length > 0) {
                setJogItem(recentItems[0])
            }
        } catch (err) {
            console.error('Jog fetch failed:', err)
        }
    }

    const handleSearch = async (e) => {
        const query = e.target.value
        setSearchQuery(query)

        if (query.trim().length === 0) {
            if (user) fetchSaves(user.id)
            return
        }

        if (query.length < 3) return

        setIsSearching(true)
        try {
            // Mirroring the extension's Hybrid Search logic
            // 1. Keyword search (Supabase REST)
            const { data: keywordResults } = await supabase
                .from('saves')
                .select('*')
                .eq('user_id', user.id)
                .or(`title.ilike.*${query}*,description.ilike.*${query}*,url.ilike.*${query}*`)
                .limit(15)

            // 2. Semantic search (Edge Function)
            const { data: semanticResultsData, error: funcError } = await supabase.functions.invoke('search-saves', {
                body: { query }
            })

            const semanticResults = semanticResultsData?.results || []

            // Merge and de-duplicate
            const combined = new Map()
            semanticResults.forEach(item => combined.set(item.id, item))
            keywordResults?.forEach(item => {
                if (!combined.has(item.id)) combined.set(item.id, item)
            })

            setSaves(Array.from(combined.values()))
        } catch (err) {
            console.error('Search failed:', err)
        } finally {
            setIsSearching(false)
        }
    }

    const handleLogin = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin }
        })
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
    }

    if (!user) {
        return (
            <div className="login-screen">
                <div className="login-card">
                    <h1 className="logo-text">Never Lose What You Save Online</h1>
                    <p className="logo-tagline">Sign in to access your digital brain.</p>
                    <button className="google-btn" onClick={handleLogin}>
                        <svg viewBox="0 0 48 48" width="20" height="20">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        </svg>
                        Sign in with Google
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <div className="logo-container">
                    <h1 className="logo-text">Never Lose</h1>
                    <p className="logo-tagline">{user.email}</p>
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
                <button className="logout-link" onClick={handleLogout}>Sign Out</button>
            </header>

            <main className="dashboard-main">
                {jogItem && (
                    <section className="memory-jog-hero">
                        <div className="jog-header">
                            <div className="jog-badge">Memory Jog</div>
                            <span className="jog-time">Saved {formatRelativeTime(jogItem.created_at)}</span>
                        </div>
                        <h2 className="jog-title">{jogItem.title}</h2>
                        <a href={jogItem.url} target="_blank" rel="noreferrer" className="jog-action">Open Memory</a>
                    </section>
                )}

                <div className="section-header">
                    <h2 className="section-title">Your Brain</h2>
                    <span className="save-count">{saves.length} items shown</span>
                </div>

                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Retrieving your memories...</p>
                    </div>
                ) : (
                    <div className="saves-grid">
                        {saves.length === 0 ? (
                            <p className="empty-state">No memories found yet. Save a page from the extension!</p>
                        ) : (
                            saves.map(save => (
                                <div key={save.id} className="save-card">
                                    <div className="card-header">
                                        <h3 className="save-title">{save.title}</h3>
                                        <a href={save.url} target="_blank" rel="noreferrer" className="save-link">↗</a>
                                    </div>
                                    <p className="save-summary">{save.summary || 'Processing description...'}</p>
                                    <div className="card-footer">
                                        <div className="tags">
                                            {save.tags?.map(tag => (
                                                <span key={tag} className="tag">{tag}</span>
                                            ))}
                                        </div>
                                        <span className="save-date">
                                            {formatRelativeTime(save.created_at)}
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
