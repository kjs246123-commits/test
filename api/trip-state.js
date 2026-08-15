const { Redis } = require('@upstash/redis');

// Vercel의 Storage 연동 방식에 따라 환경변수 이름이 KV_* 또는 UPSTASH_* 로 다를 수 있어 둘 다 확인
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const kv = REDIS_URL && REDIS_TOKEN ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN }) : null;

const STATE_KEY = 'jeju-trip-state-v1';
// 클라이언트 코드에도 그대로 들어있는 값이라 강력한 보안은 아니고,
// URL을 우연히 발견한 사람이 무심코 덮어쓰는 것 정도만 막는 최소한의 장치
const SYNC_TOKEN = 'jeju2026-sync-9f3k2';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (!kv) {
    res.status(500).json({ error: 'redis not configured (missing KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN env vars)' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const state = await kv.get(STATE_KEY);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ state: state || null });
    } catch (e) {
      res.status(500).json({ error: 'read failed' });
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
      await kv.set(STATE_KEY, body.state);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'write failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};
