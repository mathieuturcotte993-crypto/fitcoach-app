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
const MAX_VERSIONS = 5;

async function redis(cmd) {
const r = await fetch(baseUrl, {
method: 'POST',
headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
body: JSON.stringify(cmd)
});
if (!r.ok) {
throw new Error('storage_error');
}
const j = await r.json();
return j && typeof j.result !== 'undefined' ? j.result : null;
}

function parseSnap(str) {
if (typeof str !== 'string' || str.length === 0) return null;
try { return JSON.parse(str); } catch (e) { return null; }
}

function countExercises(snap) {
if (!snap || !snap.stores) return 0;
let n = 0;
const scan = function (list) {
if (!Array.isArray(list)) return;
list.forEach(function (e) {
const v = e && e.value;
if (v && v.logs && typeof v.logs === 'object') n += Object.keys(v.logs).length;
});
};
scan(snap.stores.plans);
scan(snap.stores.history);
return n;
}

let body = req.body;
if (typeof body === 'string') {
try { body = JSON.parse(body); } catch (e) { body = {}; }
}
body = body || {};

const known = ['get', 'set', 'delete', 'versions', 'getVersion'];
const action = known.indexOf(body.action) !== -1 ? body.action : 'get';
const code = String(body.code || '').trim();
if (!/^[A-Za-z0-9_-]{8,64}$/.test(code)) {
return res.status(400).json({ error: 'invalid_code' });
}
const key = 'fitcoach:v1:' + code;
const vkey = key + ':versions';

try {
if (action === 'get') {
const cur = parseSnap(await redis(['GET', key]));
return res.status(200).json({ ok: true, data: cur });
}

if (action === 'versions') {
const raw = await redis(['LRANGE', vkey, 0, MAX_VERSIONS - 1]);
const list = (Array.isArray(raw) ? raw : []).map(function (s, i) {
const snap = parseSnap(s);
return { index: i, savedAt: (snap && snap.updatedAt) || null, exercises: countExercises(snap) };
});
return res.status(200).json({ ok: true, versions: list });
}

if (action === 'getVersion') {
let idx = parseInt(body.index, 10);
if (!(idx >= 0)) idx = 0;
if (idx > MAX_VERSIONS - 1) idx = MAX_VERSIONS - 1;
const raw = await redis(['LRANGE', vkey, idx, idx]);
const snap = parseSnap(Array.isArray(raw) ? raw[0] : null);
if (!snap) return res.status(404).json({ error: 'version_not_found' });
return res.status(200).json({ ok: true, data: snap });
}

if (action === 'delete') {
await redis(['DEL', key]);
await redis(['DEL', vkey]);
return res.status(200).json({ ok: true, deleted: true });
}

const payload = body.data;
if (!payload || typeof payload !== 'object') {
return res.status(400).json({ error: 'missing_data' });
}
const value = JSON.stringify(payload);
if (value.length > 3500000) {
return res.status(413).json({ error: 'too_large' });
}

const currentRaw = await redis(['GET', key]);
const current = parseSnap(currentRaw);
const currentCount = countExercises(current);
const nextCount = countExercises(payload);
if (!body.force && current && currentCount > 0 && nextCount === 0) {
return res.status(409).json({
error: 'would_erase_data',
current: { savedAt: current.updatedAt || null, exercises: currentCount }
});
}

if (currentRaw && currentRaw !== value) {
await redis(['LPUSH', vkey, currentRaw]);
await redis(['LTRIM', vkey, 0, MAX_VERSIONS - 1]);
}
await redis(['SET', key, value]);
return res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
} catch (e) {
if (e && e.message === 'storage_error') {
return res.status(502).json({ error: 'storage_error' });
}
return res.status(500).json({ error: 'server_error' });
}
};
