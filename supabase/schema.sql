-- Create a table for saved web pages
CREATE EXTENSION IF NOT EXISTS vector;

-- ... (table definition)

-- PERFORMANCE OPTIMIZATION: Index for lightning-fast retrieval
CREATE INDEX IF NOT EXISTS saves_embedding_hnsw_idx ON saves 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- HELPER: View to check indexing status
CREATE OR REPLACE VIEW brain_status AS
SELECT 
  COUNT(*) as total_saves,
  COUNT(embedding) as ai_indexed,
  (COUNT(*) - COUNT(embedding)) as processing_needed
FROM saves;

CREATE TABLE IF NOT EXISTS saves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    selected_text TEXT,
    tags TEXT[],
    summary TEXT,
    embedding VECTOR(1536), -- For OpenAI embeddings
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE saves ENABLE ROW LEVEL SECURITY;

-- Enable Row Level Security
ALTER TABLE saves ENABLE ROW LEVEL SECURITY;

-- SECURE POLICIES: Users can only see/edit their own data
DROP POLICY IF EXISTS "Public can view saves" ON saves;
DROP POLICY IF EXISTS "Public can insert saves" ON saves;
DROP POLICY IF EXISTS "Public can update saves" ON saves;

CREATE POLICY "Users can view own saves" 
ON saves FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saves" 
ON saves FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saves" 
ON saves FOR UPDATE 
USING (auth.uid() = user_id);

-- Updated function for similarity search with user security
DROP FUNCTION IF EXISTS match_saves(vector,float,int);
CREATE OR REPLACE FUNCTION match_saves (
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT,
  p_user_id UUID -- Pass the user ID explicitly
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  url TEXT,
  description TEXT,
  summary TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    saves.id,
    saves.title,
    saves.url,
    saves.description,
    saves.summary,
    saves.tags,
    saves.created_at,
    1 - (saves.embedding <=> query_embedding) AS similarity
  FROM saves
  WHERE 
    saves.user_id = p_user_id AND -- SECURITY: Filter by user
    1 - (saves.embedding <=> query_embedding) > match_threshold
  ORDER BY saves.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
