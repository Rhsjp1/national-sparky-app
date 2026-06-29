#!/bin/bash
# Step 1: Ensure directory exists
cd ~/national-sparky-app || {
    echo "ERROR: Directory ~/national-sparky-app not found."
    exit 1
}

echo "=== 1. Cleaning up old fragments ==="
rm -f vercel.json api/analyze.js push.sh
mkdir -p api

echo "=== 2. Creating secure API proxy (api/analyze.js) ==="
cat << 'INNER_EOF' > api/analyze.js
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
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: text }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] }
            })
        });
        const data = await response.json();
        return res.status(200).json({ success: true, payload: data.candidates?.[0]?.content?.parts?.[0]?.text || "No response." });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}
INNER_EOF

echo "=== 3. Writing vercel.json ==="
cat << 'INNER_EOF' > vercel.json
{
  "version": 2,
  "rewrites": [
    { "source": "/api/analyze", "destination": "/api/analyze.js" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
INNER_EOF

echo "=== 4. Starting Vercel Direct Deploy ==="
npx vercel
