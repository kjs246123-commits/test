const Redis = require('ioredis');

const STATE_KEY = 'jeju-trip-state-v1';
// 클라이언트 코드에도 그대로 들어있는 값이라 강력한 보안은 아니고,
// URL을 우연히 발견한 사람이 무심코 덮어쓰는 것 정도만 막는 최소한의 장치
const SYNC_TOKEN = 'jeju2026-sync-9f3k2';

async function withRedis(fn) {
  const client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,
    lazyConnect: true,
  });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    client.disconnect();
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (!process.env.REDIS_URL) {
    res.status(500).json({ error: 'redis not configured (missing REDIS_URL env var)' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const raw = await withRedis(client => client.get(STATE_KEY));
      const state = raw ? JSON.parse(raw) : null;
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ state });
    } catch (e) {
      res.status(500).json({ error: 'read failed: ' + e.message });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      if (body.token !== SYNC_TOKEN) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      if (!body.state || !Array.isArray(body.state.trips)) {
        res.status(400).json({ error: 'invalid state' });
        return;
      }
      await withRedis(client => client.set(STATE_KEY, JSON.stringify(body.state)));
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'write failed: ' + e.message });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};
