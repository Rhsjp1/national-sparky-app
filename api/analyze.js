export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not permitted' });

    const { text, tone } = req.body || {};
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'OPENROUTER_API_KEY missing.' });

    const tonePrompt = tone === 'concise'
        ? 'Respond in exactly one or two concise sentences.'
        : tone === 'instructive'
        ? 'Respond as an instructor with step-by-step checklists.'
        : tone === 'diagnostic'
        ? 'Analyze like a master electrician: cite NEC articles, flag safety-critical items, and propose root causes.'
        : 'Respond as an expert electrical engineer with professional code references.';

    const systemPrompt = `You are Electrical OS AI. Tone: ${tonePrompt} Always prioritize safety and reference NEC sections.`;

    const primaryModel = 'openai/gpt-4o-mini';
    const fallbackModel = process.env.OPENROUTER_FALLBACK_MODEL || 'google/gemini-2.0-flash-exp:free';

    const callOpenRouter = async (model) => {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': process.env.APP_URL || 'https://national-sparky-app.vercel.app',
                'X-Title': 'SparkySolve'
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                temperature: 0.4,
                max_tokens: 202
            })
        });

        const data = await response.json();
        if (!response.ok) {
            const errMsg = data?.error?.message || response.statusText;
            if (response.status === 402 || (data?.error?.code && String(data.error.code).includes('insufficient_credits'))) {
                return { ok: false, reason: 'credits_exhausted', data };
            }
            return { ok: false, reason: 'upstream_error', data };
        }

        const reply = data?.choices?.[0]?.message?.content || 'No response.';
        return { ok: true, reply };
    };

    try {
        let result = await callOpenRouter(primaryModel);

        if (!result.ok && result.reason === 'credits_exhausted' && fallbackModel && fallbackModel !== primaryModel) {
            result = await callOpenRouter(fallbackModel);
        }

        if (!result.ok) {
          if (result.reason === 'credits_exhausted') {
            const errMsg = result.data?.error?.message || 'AI request failed';
            return res.status(200).json({
              success: true,
              payload: "Demo mode: OpenRouter credits exhausted. Refill to enable live AI responses. This endpoint and app are working correctly.",
              demo: true,
              error: errMsg
            });
          }
          const errMsg = result.data?.error?.message || 'AI request failed';
          return res.status(502).json({ success: false, error: 'AI service error: ' + errMsg });
        }

        return res.status(200).json({ success: true, payload: result.reply });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}
