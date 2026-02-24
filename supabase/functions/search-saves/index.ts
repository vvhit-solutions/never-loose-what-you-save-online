import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
    const { query } = await req.json()

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    try {
        const azureApiKey = Deno.env.get('AZURE_OPENAI_API_KEY');
        const azureEndpoint = Deno.env.get('AZURE_OPENAI_ENDPOINT');
        const embeddingDeployment = Deno.env.get('AZURE_OPENAI_EMBEDDING_DEPLOYMENT');
        const apiVersion = '2024-02-15-preview';

        if (!azureApiKey || !azureEndpoint) {
            throw new Error('Azure OpenAI credentials missing.');
        }

        // 1. Generate embedding for the search query using Azure OpenAI
        const embeddingUrl = `${azureEndpoint}/openai/deployments/${embeddingDeployment}/embeddings?api-version=${apiVersion}`;

        const embeddingResponse = await fetch(embeddingUrl, {
            method: 'POST',
            headers: {
                'api-key': azureApiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                input: query,
            }),
        });

        const embeddingData = await embeddingResponse.json();
        if (embeddingData.error) throw new Error(embeddingData.error.message);

        const queryEmbedding = embeddingData.data[0].embedding;

        // 2. Perform vector search using RPC call
        const { data: matches, error } = await supabase.rpc('match_saves', {
            query_embedding: queryEmbedding,
            match_threshold: 0.3,
            match_count: 10,
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
