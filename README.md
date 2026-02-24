# Never Lose What You Save Online 🧠✨

Your personal AI-powered "Second Brain." This Chrome extension helps you save, summarize, and semantically search through everything you find interesting on the web.

## 🚀 Features

-   **One-Click Smart Save**: Save any page with its title, URL, and description.
-   **AI Auto-Processing**: Powered by OpenAI (`gpt-4o-mini`), it automatically summarizes pages and adds smart tags with strict token capping for cost-efficiency.
-   **Semantic "Brain" Search**: Find things by concept, not just keywords, using OpenAI's `text-embedding-3-small`.
-   **Memory Jog**: A smart resurfacing system that prioritizes items from 3-14 days ago to help you rediscover older saves.
-   **Stripe Integration**: Built-in monthly and yearly subscription tiers for monetization.
-   **Bookmark Import**: Bring your existing Chrome bookmarks into your new digital memory.
-   **Duplicate Detection**: Prevents double-saving the same URL to keep your brain organized.

---

## 🛠 Setup & Deployment

### 1. Supabase Backend
This project uses Supabase for database and Edge Functions.

1.  **Database Setup**:
    -   Run the contents of `supabase/schema.sql` in your Supabase SQL Editor to create the `saves` table and the `match_saves` vector search function.
    -   Enable the `pgvector` extension if not already active.

2.  **Environment Secrets**:
    -   Set your OpenAI API key in Supabase secrets:
        ```bash
        supabase secrets set OPENAI_API_KEY=your_key_here
        ```

3.  **Deploy Edge Functions**:
    ```bash
    supabase functions deploy process-save --no-verify-jwt
    supabase functions deploy search-saves --no-verify-jwt
    ```

### 2. Chrome Extension (`extension_v3`)
1.  Open Chrome and go to `chrome://extensions/`.
2.  Enable **Developer mode**.
3.  Click **Load unpacked** and select the `extension_v3` folder.
4.  Update `extension_v3/scripts/config.js` with your Supabase URL and Anon Key.

### 3. Personal Dashboard
A React-based web app to view all your memories.
1.  Navigate to the `dashboard` folder.
2.  Install dependencies: `npm install`.
3.  Run locally: `npm run dev`.

---

## 💡 How to Use

1.  **Saving**: Click the extension icon and hit "Save this Page." 
2.  **Searching**: Use the "Search" tab in the popup. Try searching for concepts (e.g., "smart sea animals" to find pages about dolphins).
3.  **Resurfacing**: Check the "Memory Jog" section daily to keep your knowledge fresh.
4.  **Importing**: Go to Settings in the popup to import your old Chrome bookmarks.

---

## 💰 Cost Optimization
Built for massive use at near-zero cost:
- **Summaries**: Uses `gpt-4o-mini` (Super cheap).
- **Search**: Uses `text-embedding-3-small` ($0.02 per 1,000,000 tokens).
- **Performance**: Parallel processing and HNSW database indexing for sub-second responses.
