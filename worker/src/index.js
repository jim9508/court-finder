// 約場板「立即更新」按鈕的中介（Cloudflare Worker）
//   網頁 POST /refresh      → 記下更新請求；全站每 10 分鐘最多一次，避免對球館網站太兇
//   Mac  GET  /pending      → 每分鐘來問；有請求就 POST /claim 接手，抓 P9 推上 GitHub（推送會觸發網站更新、順便抓閃電）
//   cron 每分鐘            → Mac 2 分鐘內沒接手（關機或睡著）就改叫 GitHub Actions，只更新閃電
//   網頁 GET  /status       → 目前狀態，按鈕據此顯示
// secrets：MAC_KEY（Mac 輪詢用）、GH_TOKEN（只有 court-finder 的 Actions 寫入權限）
export const COOLDOWN_MS = 10 * 60 * 1000;
export const MAC_GRACE_MS = 2 * 60 * 1000;

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(origin ? cors(origin) : {}) },
});
const cors = (origin) => ({
  'access-control-allow-origin': origin,
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  vary: 'origin',
});

async function getState(env) {
  return (await env.KV.get('state', 'json')) || { requested_at: 0, claimed_by: null, claimed_at: 0, error: null };
}
const putState = (env, s) => env.KV.put('state', JSON.stringify(s));

function publicState(s, now) {
  const pending = !!s.requested_at && !s.claimed_by;
  return {
    state: pending ? 'pending' : s.claimed_by && now - s.claimed_at < 10 * 60 * 1000 ? `running:${s.claimed_by}` : 'idle',
    requested_at: s.requested_at || null,
    next_allowed_at: s.requested_at ? s.requested_at + COOLDOWN_MS : 0,
    error: s.error || null,
  };
}

function macAuthorized(req, env) {
  const got = new TextEncoder().encode((req.headers.get('authorization') || '').replace(/^Bearer /, ''));
  const want = new TextEncoder().encode(env.MAC_KEY || '');
  if (!want.length || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

export async function dispatchGithub(env) {
  const res = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/pages.yml/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GH_TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'court-finder-refresh',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (res.status !== 204) throw new Error(`GitHub ${res.status}`);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const now = Date.now();
    const origin = req.headers.get('origin') === env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN : null;

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: origin ? cors(origin) : {} });

    if (url.pathname === '/status' && req.method === 'GET') {
      return json(publicState(await getState(env), now), 200, origin);
    }

    if (url.pathname === '/refresh' && req.method === 'POST') {
      if (!origin) return json({ error: 'forbidden' }, 403);
      const s = await getState(env);
      if (s.requested_at && now - s.requested_at < COOLDOWN_MS) {
        return json({ error: 'cooldown', ...publicState(s, now) }, 429, origin);
      }
      const next = { requested_at: now, claimed_by: null, claimed_at: 0, error: null };
      await putState(env, next);
      return json(publicState(next, now), 202, origin);
    }

    if (url.pathname === '/pending' && req.method === 'GET') {
      if (!macAuthorized(req, env)) return json({ error: 'unauthorized' }, 401);
      const s = await getState(env);
      return json({ pending: !!s.requested_at && !s.claimed_by, requested_at: s.requested_at || null }, 200);
    }

    if (url.pathname === '/claim' && req.method === 'POST') {
      if (!macAuthorized(req, env)) return json({ error: 'unauthorized' }, 401);
      const s = await getState(env);
      if (!s.requested_at || s.claimed_by) return json({ ok: false }, 409);
      await putState(env, { ...s, claimed_by: 'mac', claimed_at: now });
      return json({ ok: true }, 200);
    }

    return json({ error: 'not_found' }, 404, origin);
  },

  async scheduled(_event, env) {
    const now = Date.now();
    const s = await getState(env);
    if (!s.requested_at || s.claimed_by || now - s.requested_at < MAC_GRACE_MS) return;
    try {
      await dispatchGithub(env);
      await putState(env, { ...s, claimed_by: 'github', claimed_at: now, error: null });
    } catch (e) {
      await putState(env, { ...s, claimed_by: 'github', claimed_at: now, error: e.message });
    }
  },
};
