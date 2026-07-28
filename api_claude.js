export default async function handler(req, res) {
    // Autoriser CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { message, apiKey } = req.body;
        
        if (!apiKey || !message) {
            return res.status(400).json({ error: 'Missing apiKey or message' });
        }
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-opus-4-1',
                max_tokens: 1024,
                messages: [{ role: 'user', content: message }]
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            return res.status(response.status).json({ 
                error: data.error?.message || 'API Error' 
            });
        }
        
        res.status(200).json({ 
            content: data.content[0].text 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}