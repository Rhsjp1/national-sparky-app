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

    try {
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
        ];

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': process.env.APP_URL || 'https://national-sparky-app.vercel.app',
                'X-Title': 'SparkySolve'
            },
            body: JSON.stringify({
                model: process.env.OPENROUTER_MODEL || 'poolside/laguna-s-2.1:free',
                messages,
                temperature: 0.4,
                max_tokens: 180
            })
        });

        const data = await response.json();
        if (!response.ok) {
            const errMsg = data?.error?.message || response.statusText;
            if (response.status === 402 || (data?.error?.code && String(data.error.code).includes('insufficient_credits'))) {
                return res.status(200).json({
                    success: true,
                    payload: "Demo mode: OpenRouter credits exhausted. Refill to enable live AI responses. This endpoint and app are working correctly.",
                    demo: true,
                    error: errMsg
                });
            }
            return res.status(502).json({ success: false, error: 'AI service error: ' + errMsg });
        }

        const reply = data?.choices?.[0]?.message?.content || 'No response.';
        return res.status(200).json({ success: true, payload: reply });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}
