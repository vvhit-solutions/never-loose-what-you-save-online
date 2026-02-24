# Never Lose What You Save Online - Dashboard

The official web dashboard for accessing your digital brain from any browser. Built with React + Vite + Supabase.

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+ recommended)
- npm or yarn

### 2. Installation
Navigate to the dashboard directory and install dependencies:
```bash
cd dashboard
npm install
```

### 3. Development
Start the local development server:
```bash
npm run dev
```
The app will typically run on [http://localhost:5173](http://localhost:5173).

---

## ⚙️ Configuration

Open `src/App.jsx` and ensure your Supabase credentials are set:

```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_KEY = 'your-anon-key';
```

### 🔐 Google Auth Setup
To make Google Sign-In work, you must add your local and production URLs to the **Supabase Redirect URIs**:
1. Go to [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to **Authentication** > **URL Configuration**.
3. Add `http://localhost:5173` (or your active port) to the Redirect URIs.

---

## 📦 Deployment

### Build for Production
```bash
npm run build
```
This generates a `dist` folder ready for static hosting.

### Recommended Hosting
- **Vercel**: Simply connect your GitHub repo and point the root directory to `dashboard`.
- **Netlify**: Drag and drop the `dist` folder or connect via CLI.
- **Supabase Hosting**: You can also use Supabase Edge Functions to serve static files if preferred.

---

## ✨ Features
- **Google Auth**: Secure login synced with the extension.
- **Memory Jog**: Shorter, compact hero section for daily rediscovery.
- **Hybrid Search**: Instant keyword + semantic AI search.
- **Smart Time**: Relative time labels (e.g., "3h ago", "2d ago") for all items.
