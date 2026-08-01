module.exports = async function handler(req, res) {
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
    const { apiKey, system, messages, message } = req.body;

  const finalMessages = (messages && Array.isArray(messages) && messages.length > 0)
    ? messages
    : (message ? [{ role: 'user', content: message }] : null);

  if (!apiKey || !finalMessages) {
    return res.status(400).json({ error: 'Missing apiKey or messages' });
  }

  const payload = {
    model: 'claude-sonnet-5',
    max_tokens: 8000,
    messages: finalMessages
  };
    if (system) {
      payload.system = system;
    }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    return res.status(response.status).json({
      error: data.error?.message || 'API Error'
    });
  }

  const textBlock = data.content && data.content.find(b => b.type === 'text');

  if (!textBlock || !textBlock.text) {
    return res.status(502).json({
      error: 'Reponse Claude sans contenu texte (max_tokens probablement atteint avant la generation du texte). Reessayez avec un prompt plus court.'
    });
  }

  res.status(200).json({
    content: textBlock.text
  });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
