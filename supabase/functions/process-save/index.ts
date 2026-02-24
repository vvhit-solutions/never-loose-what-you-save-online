import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
    const { save_id } = await req.json()

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch the save data
    const { data: save, error: fetchError } = await supabase
        .from('saves')
        .select('*')
        .eq('id', save_id)
        .single()

    if (fetchError || !save) {
        return new Response(JSON.stringify({ error: 'Save not found' }), { status: 404 })
    }

    try {
        const azureApiKey = Deno.env.get('AZURE_OPENAI_API_KEY');
        const azureEndpoint = Deno.env.get('AZURE_OPENAI_ENDPOINT'); // https://neverloose.openai.azure.com/
        const chatDeployment = Deno.env.get('AZURE_OPENAI_CHAT_DEPLOYMENT');
        const embeddingDeployment = Deno.env.get('AZURE_OPENAI_EMBEDDING_DEPLOYMENT');
        const apiVersion = '2024-02-15-preview'; // Default or from env

        if (!azureApiKey || !azureEndpoint) {
            throw new Error('Azure OpenAI credentials missing.');
        }

        // 2. Generate Summary and Tags using Azure OpenAI Chat
        const chatUrl = `${azureEndpoint}/openai/deployments/${chatDeployment}/chat/completions?api-version=${apiVersion}`;

        const aiResponse = await fetch(chatUrl, {
            method: 'POST',
            headers: {
                'api-key': azureApiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: 'You are a helpful assistant that summarizes web pages and generates tags. Provide output in JSON format: { "summary": "...", "tags": ["...", "..."] }' },
                    { role: 'user', content: `Summarize this page and give 3 tags:\nTitle: ${save.title}\nDescription: ${save.description}\nURL: ${save.url}` }
                ],
                response_format: { type: 'json_object' }
            }),
        });

        const aiData = await aiResponse.json();
        if (aiData.error) throw new Error(aiData.error.message);

        const { summary, tags } = JSON.parse(aiData.choices[0].message.content);

        // 3. Generate Embeddings using Azure OpenAI Embeddings
        const embeddingUrl = `${azureEndpoint}/openai/deployments/${embeddingDeployment}/embeddings?api-version=${apiVersion}`;

        const embeddingResponse = await fetch(embeddingUrl, {
            method: 'POST',
            headers: {
                'api-key': azureApiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                input: `${save.title} ${save.description} ${summary} ${tags.join(' ')}`,
            }),
        });

        const embeddingData = await embeddingResponse.json();
        if (embeddingData.error) throw new Error(embeddingData.error.message);

        const embedding = embeddingData.data[0].embedding;

        // 4. Update the save record
        const { error: updateError } = await supabase
            .from('saves')
            .update({ summary, tags, embedding })
            .eq('id', save_id);

        if (updateError) throw updateError;

        return new Response(JSON.stringify({ success: true, summary, tags }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (err) {
        console.error('AI Error:', err.message);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
})
