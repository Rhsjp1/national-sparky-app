#!/bin/bash
# =====================================================================
# ELECTRICAL OS DEPLOYMENT AUTOMATION UTILITY
# Target Environment: Chromebook Linux (Crostini) -> Vercel Serverless
# =====================================================================

# Step 1: Ensure we are in the correct project directory
cd ~/national-sparky-app || {
    echo "ERROR: Directory ~/national-sparky-app not found."
    echo "Please make sure you are in the correct directory."
    exit 1
}

echo "=== 1. Cleaning up old fragments and preparing directories ==="
rm -f vercel.json api/analyze.js push.sh package.json
mkdir -p api

echo "=== 2. Resolving Node.js deprecation warning (Creating package.json) ==="
# Generates package.json targeting Node 24.x per Vercel specification limits
cat << 'EOF' > package.json
{
  "name": "national-sparky-app",
  "version": "1.0.4",
  "engines": {
    "node": "24.x"
  }
}
EOF

echo "=== 3. Rebuilding the secure Gemini proxy handler (api/analyze.js) ==="
# Writes a clean, uncorrupted Javascript file for the API endpoint
cat << 'EOF' > api/analyze.js
export default async function handler(req, res) {
    // Enable Cross-Origin Resource Sharing (CORS) for secure frontend queries
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    
    // Handle preflight CORS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only permit POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not permitted' });
    }
    
    const { text, tone } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ success: false, error: 'GEMINI_API_KEY missing on Vercel environment variables.' });
    }
    
    // Apply tone instructions to the model dynamically based on user settings
    const systemTonePrompt = tone === 'concise' 
        ? "Respond in exactly one or two extremely concise sentences."
        : tone === 'instructive'
        ? "Respond as an instructor providing step-by-step checklists."
        : "Respond as an expert electrical engineer providing professional code references.";

    const systemPrompt = `You are Electrical OS AI. Tone Instructions: ${systemTonePrompt} Always emphasize safety first. Reference NEC sections. Use clear formatting.`;

    try {
        // Forward query securely to Google AI Studio's live Gemini 1.5 Flash endpoint
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: text }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] }
            })
        });
        
        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received from Gemini engine.";
        
        return res.status(200).json({ success: true, payload: responseText });
    } catch (err) { 
        return res.status(500).json({ success: false, error: err.message }); 
    }
}
EOF

echo "=== 4. Writing pristine Vercel rewrite configuration (vercel.json) ==="
# Map the /api/analyze path to our serverless function and protect other routes
cat << 'EOF' > vercel.json
{
  "version": 2,
  "rewrites": [
    { "source": "/api/analyze", "destination": "/api/analyze.js" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
EOF

echo "=== 5. Verifying HTML Entry Point ==="
if [ ! -f index.html ]; then
    echo "WARNING: index.html was not found in this directory."
    echo "Please make sure your main index.html file is saved in ~/national-sparky-app before running this script."
fi

echo "============================================="
echo "=== System files repaired successfully! ==="
echo "=== Starting direct Vercel CLI deployment ==="
echo "NOTE: Log in when prompted, and press [Enter] to accept all default setup answers."
echo "============================================="

# Step 6: Execute Vercel CLI directly from local project environment targeting production
npx vercel --prod