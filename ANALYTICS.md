# Analytics Queries for Never Lose What You Save Online

## Setup: Create Analytics Table
Run this SQL once in your Supabase SQL Editor to create the necessary table:

```sql
CREATE TABLE public.analytics (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    event_name text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS (Optional but recommended)
ALTER TABLE public.analytics ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts for install tracking
CREATE POLICY "Enable insert for all" ON public.analytics FOR INSERT WITH CHECK (true);

-- Allow users to see their own analytics
CREATE POLICY "Users can view own analytics" ON public.analytics FOR SELECT USING (auth.uid() = user_id);
```

## Analysis Queries
Use these SQL queries in the Supabase SQL Editor to analyze user behavior.

### 1. Unique Installations
How many unique users/browsers have installed the extension?
```sql
SELECT count(DISTINCT metadata->>'install_id') as total_installs
FROM analytics
WHERE event_name = 'extension_install';
```
*(Note: requires adding a persistent install_id to metadata if you want to track across browsers)*

### 2. Active events (Last 24 Hours)
```sql
SELECT u.email, count(*) as active_events
FROM analytics a
JOIN auth.users u ON a.user_id = u.id
WHERE a.created_at > now() - interval '24 hours'
GROUP BY u.email;
```

### 3. Pages Saved per User & Total
```sql
-- Total Saves
SELECT count(*) as total_pages_saved
FROM analytics
WHERE event_name = 'page_saved';

-- Saves per User (with Email)
SELECT u.email, count(*) as save_count
FROM analytics a
JOIN auth.users u ON a.user_id = u.id
WHERE a.event_name = 'page_saved'
GROUP BY u.email
ORDER BY save_count DESC;
```

### 4. Search Usage
```sql
-- Total Searches
SELECT count(*) as total_searches
FROM analytics
WHERE event_name = 'search_performed';

-- Search Engagement (with Email)
SELECT u.email, count(*) as search_count
FROM analytics a
JOIN auth.users u ON a.user_id = u.id
WHERE a.event_name = 'search_performed'
GROUP BY u.email;
```

### 5. Items Opened (Total & Per User)
```sql
-- Total Opens by Source (Memory Jog vs Search)
SELECT metadata->>'source' as source, count(*) as open_count
FROM analytics
WHERE event_name = 'item_opened'
GROUP BY 1;

-- Opens per User (with Email)
SELECT u.email, count(*) as open_count
FROM analytics a
JOIN auth.users u ON a.user_id = u.id
WHERE a.event_name = 'item_opened'
GROUP BY u.email
ORDER BY open_count DESC;
```

### 6. Time to First Save
```sql
WITH first_save AS (
    SELECT user_id, min(created_at) as saved_at
    FROM analytics
    WHERE event_name = 'page_saved'
    GROUP BY 1
),
installs AS (
    SELECT user_id, min(created_at) as installed_at
    FROM analytics
    WHERE event_name = 'extension_install'
    GROUP BY 1
)
SELECT 
    u.email,
    (s.saved_at - i.installed_at) as time_to_save
FROM first_save s
JOIN installs i ON s.user_id = i.user_id
JOIN auth.users u ON s.user_id = u.id;
```
