import assert from 'node:assert/strict';
import worker, { COOLDOWN_MS, MAC_GRACE_MS } from './src/index.js';

const store = new Map();
const env = {
  ALLOWED_ORIGIN: 'https://jim9508.github.io', GH_REPO: 'jim9508/court-finder', MAC_KEY: 'k'.repeat(48), GH_TOKEN: 'test',
  KV: { get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null), put: async (k, v) => store.set(k, v) },
};
let now = 1_800_000_000_000;
Date.now = () => now;
const dispatched = [];
globalThis.fetch = async (url) => { dispatched.push(url); return new Response(null, { status: 204 }); };
const call = (method, path, headers = {}) => worker.fetch(new Request('https://w.example' + path, { method, headers }), env);
const page = { origin: 'https://jim9508.github.io' };
const mac = { authorization: 'Bearer ' + env.MAC_KEY };

assert.equal((await call('POST', '/refresh', { origin: 'https://evil.example' })).status, 403);
assert.equal((await call('GET', '/pending', { authorization: 'Bearer nope' })).status, 401);
assert.equal((await call('POST', '/refresh', page)).status, 202);
assert.equal((await call('POST', '/refresh', page)).status, 429);                 // 10 分鐘內只能一次
assert.equal((await (await call('GET', '/status', page)).json()).state, 'pending');
assert.deepEqual((await (await call('GET', '/pending', mac)).json()).pending, true);
assert.equal((await call('POST', '/claim', mac)).status, 200);
assert.equal((await call('POST', '/claim', mac)).status, 409);                     // 不會被接兩次
assert.equal((await (await call('GET', '/status', page)).json()).state, 'running:mac');
now += MAC_GRACE_MS + 1000; await worker.scheduled({}, env);
assert.equal(dispatched.length, 0);                                                 // Mac 已接手，不叫 GitHub

now += COOLDOWN_MS;                                                                 // 冷卻過了，再按一次，這次 Mac 沒回應
assert.equal((await call('POST', '/refresh', page)).status, 202);
now += 60_000; await worker.scheduled({}, env);
assert.equal(dispatched.length, 0);                                                 // 未滿 2 分鐘先等 Mac
now += MAC_GRACE_MS; await worker.scheduled({}, env);
assert.equal(dispatched.length, 1);
assert.match(dispatched[0], /jim9508\/court-finder\/actions\/workflows\/pages\.yml\/dispatches$/);
assert.equal((await (await call('GET', '/status', page)).json()).state, 'running:github');
console.log('worker tests ok');
