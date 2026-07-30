module.exports = async function handler(req, res) {
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
res.setHeader('Cache-Control', 'no-store');

if (req.method === 'OPTIONS') {
return res.status(200).end();
}
if (req.method !== 'POST') {
return res.status(405).json({ error: 'method_not_allowed' });
}

const rawUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_API_URL || '';
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_API_TOKEN || '';
if (!rawUrl || !token) {
return res.status(503).json({ error: 'storage_not_configured' });
}
const baseUrl = rawUrl.replace(/\/+$/, '');

let body = req.body;
if (typeof body === 'string') {
try { body = JSON.parse(body); } catch (e) { body = {}; }
}
body = body || {};

const action = body.action === 'set' ? 'set' : 'get';
const code = String(body.code || '').trim();
if (!/^[A-Za-z0-9_-]{8,64}$/.test(code)) {
return res.status(400).json({ error: 'invalid_code' });
}
const key = 'fitcoach:v1:' + code;

try {
if (action === 'get') {
const r = await fetch(baseUrl + '/get/' + encodeURIComponent(key), {
headers: { Authorization: 'Bearer ' + token }
});
if (!r.ok) {
return res.status(502).json({ error: 'storage_error' });
}
const j = await r.json();
let data = null;
if (j && typeof j.result === 'string' && j.result.length > 0) {
try { data = JSON.parse(j.result); } catch (e) { data = null; }
}
return res.status(200).json({ ok: true, data: data });
}

const payload = body.data;
if (!payload || typeof payload !== 'object') {
return res.status(400).json({ error: 'missing_data' });
}
const value = JSON.stringify(payload);
if (value.length > 3500000) {
return res.status(413).json({ error: 'too_large' });
}
const w = await fetch(baseUrl + '/set/' + encodeURIComponent(key), {
method: 'POST',
headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' },
body: value
});
if (!w.ok) {
return res.status(502).json({ error: 'storage_error' });
}
return res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
} catch (e) {
return res.status(500).json({ error: 'server_error' });
}
};
