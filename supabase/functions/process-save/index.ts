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
        const openaiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openaiKey) throw new Error('OPENAI_API_KEY missing.');

        // PERFORMANCE OPTIMIZATION: Run Summary and Embedding in parallel
        // This cuts the processing time in half (~1s instead of 2-3s)
        const [aiResponse, embeddingResponse] = await Promise.all([
            // Task 1: Generate Summary and Tags (GPT-4o-mini)
            fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openaiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'JSON only: {"s":"summary","t":["tag1","tag2"]}' },
                        { role: 'user', content: `${save.title}\n${(save.description + ' ' + (save.selected_text || '')).slice(0, 3000)}` }
                    ],
                    response_format: { type: 'json_object' },
                    max_tokens: 150 // TOKEN OPTIMIZATION: Limit output
                }),
            }),
            // Task 2: Generate Embedding (text-embedding-3-small)
            fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openaiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'text-embedding-3-small',
                    input: `${save.title} ${save.description} ${save.selected_text || ''}`.slice(0, 3000), // TOKEN OPTIMIZATION: Truncate input
                }),
            })
        ]);

        const aiData = await aiResponse.json();
        const embeddingData = await embeddingResponse.json();

        if (aiData.error) throw new Error(aiData.error.message);
        if (embeddingData.error) throw new Error(embeddingData.error.message);

        // Parse refined JSON (using short keys s, t)
        const parsedContent = JSON.parse(aiData.choices[0].message.content);
        const summary = parsedContent.s;
        const tags = parsedContent.t;
        const embedding = embeddingData.data[0].embedding;

        // 4. Update the save record
        const { error: updateError } = await supabase
            .from('saves')
            .update({ summary, tags, embedding })
            .eq('id', save_id);

        if (updateError) throw updateError;

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (err) {
        console.error('AI Error:', err.message);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
})
