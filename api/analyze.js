export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not permitted' });
    const { text, tone } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'GEMINI_API_KEY missing.' });
    const systemPrompt = `You are Electrical OS AI. Tone: ${tone}. Safety first. Reference NEC sections.`;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: text }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] }
            })
        });
        const data = await response.json();
        if (!response.ok) {
          console.error('[analyze] Gemini error:', response.status, JSON.stringify(data));
          return res.status(502).json({ success: false, error: 'AI service error: ' + (data?.error?.message || response.statusText) });
        }
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received from Gemini engine.";
        console.log('[analyze] Gemini response length:', responseText.length);
        return res.status(200).json({ success: true, payload: responseText });
    } catch (err) {
        console.error('[analyze] fetch failed:', err.message);
        return res.status(502).json({ success: false, error: 'Could not reach AI service: ' + err.message });
    }
}
