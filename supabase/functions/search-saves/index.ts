import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
    // SECURITY: Get User ID from JWT
    const authHeader = req.headers.get('Authorization')
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use service role to bypass RLS for the query, but we filter manually
        { auth: { persistSession: false } }
    )

    // Extract user info from JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader?.replace('Bearer ', '') ?? '')

    if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const { query } = await req.json()

    try {
        const openaiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openaiKey) {
            throw new Error('OPENAI_API_KEY secret missing.');
        }

        // 1. Generate embedding for the search query using OpenAI text-embedding-3-small
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'text-embedding-3-small',
                input: query,
            }),
        });

        const embeddingData = await embeddingResponse.json();
        if (embeddingData.error) throw new Error(embeddingData.error.message);

        const queryEmbedding = embeddingData.data[0].embedding;

        // 2. Perform vector search using RPC call - SECURED with user_id
        const { data: matches, error } = await supabase.rpc('match_saves', {
            query_embedding: queryEmbedding,
            match_threshold: 0.3,
            match_count: 10,
            p_user_id: user.id // SECURITY: Pass the verified User ID
        })

        if (error) throw error;

        return new Response(JSON.stringify({ results: matches }), {
            headers: { "Content-Type": "application/json" },
        })

    } catch (err) {
        console.error('Search Error:', err.message);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 })
    }
})
