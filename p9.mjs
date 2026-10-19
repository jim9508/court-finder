// P9 競技館：P9 要 Google 登入才看得到時段，token 只有 24 小時。
// 這支在本機跑：用專用的 Chrome 設定檔（登入一次）在背景開 P9 取得 token，
// 抓三面匹克球場未來 N 天的空檔，寫進 data/p9.json 並推上 GitHub，
// GitHub Actions 下一輪會把它併進約場板。
//
//   node p9.mjs login      第一次：開一般 Chrome 視窗，用專用帳號登入 P9 後關掉視窗
//   node p9.mjs            排程用：抓資料 + git push
//   node p9.mjs --no-push  只抓不推
//   node p9.mjs --poll     每分鐘：問 Worker 有沒有人按「立即更新」，有就照常抓 + push
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir, open, stat, unlink } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextDates, parseP9Day } from './scrape.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'data/p9.json');
const ORIGIN = 'https://p9arena.linkcourt.app';
const TOKEN_KEY = 'ppc_player_token:p9arena.linkcourt.app';
const PROFILE = join(homedir(), 'Library/Application Support/court-finder/chrome-profile');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DAYS = Number(process.env.DAYS || 14);
const DELAY_MS = 1500;
const UA = 'court-finder (personal use; hourly)';
// Worker 網址和 Mac 輪詢金鑰：{ "worker_url": "...", "mac_key": "..." }，只存在本機
const CONFIG = join(dirname(PROFILE), 'config.json');
const LOCK = join(dirname(PROFILE), 'run.lock');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class NeedLogin extends Error {}

export function tokenExp(tok) {
  try {
    const p = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString());
    return typeof p.exp === 'number' ? p.exp * 1000 : 0;
  } catch { return 0; }
}
const tokenOk = (tok) => !!tok && tokenExp(tok) > Date.now() + 10 * 60 * 1000;

// 背景開 P9；token 過期時網站會自己導去 Google 選帳號，點專用帳號後拿新 token。
// 遇到要輸入密碼或其他驗證就放棄，回報需要重新登入。
async function getToken() {
  await mkdir(PROFILE, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: true,
    ignoreDefaultArgs: ['--use-mock-keychain'], // 用真的鑰匙圈，才讀得到登入視窗留下的 cookie
  });
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(`${ORIGIN}/reserve`, { waitUntil: 'domcontentloaded' });
    let clicked = false;
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      const url = page.url();
      if (url.startsWith(ORIGIN)) {
        const tok = await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY).catch(() => null);
        if (tokenOk(tok)) return tok;
      } else if (url.includes('accounts.google.com')) {
        if (await page.locator('input[type="password"], input[type="email"]:visible').count()) throw new NeedLogin('Google 要求重新輸入帳號密碼');
        const acct = page.locator('[data-identifier], [data-email]').first();
        if (!clicked && (await acct.count())) { await acct.click(); clicked = true; continue; }
        if (clicked && i > 40) throw new NeedLogin(`停在 Google 頁面：${new URL(url).pathname}`);
      }
    }
    throw new NeedLogin(`60 秒內沒拿到 token（最後在 ${new URL(page.url()).host}）`);
  } finally {
    await ctx.close();
  }
}

async function fetchDay(tok, ymd) {
  const res = await fetch(`${ORIGIN}/api/v2/courts/slots?date=${ymd}`, {
    headers: { authorization: `Bearer ${tok}`, 'user-agent': UA, accept: 'application/json' },
  });
  if (res.status === 401) throw new NeedLogin('API 回 401');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseP9Day(await res.json());
}

async function scrape() {
  const tok = await getToken();
  const dates = nextDates(DAYS);
  const byName = new Map();
  for (const ymd of dates) {
    let day = null;
    try { day = await fetchDay(tok, ymd); }
    catch (e) { if (e instanceof NeedLogin) throw e; console.error(`P9 ${ymd}: ${e.message}`); }
    for (const c of day || []) {
      if (!byName.has(c.name)) byName.set(c.name, { name: c.name, url: `${ORIGIN}/reserve?date=${ymd}`, days: {} });
      byName.get(c.name).days[ymd] = c.slots;
    }
    if (!day) for (const c of byName.values()) c.days[ymd] = null;
    await sleep(DELAY_MS);
  }
  const courts = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant', { numeric: true }));
  return { ok: true, updated_at: new Date().toISOString(), dates, courts };
}

function push() {
  const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { stdio: 'pipe' }).toString();
  git('add', 'data/p9.json');
  if (!git('diff', '--cached', '--name-only').trim()) return console.log('p9.json 沒變');
  git('commit', '-q', '-m', `p9 slots ${new Date().toISOString().slice(0, 16)}Z`, '--', 'data/p9.json');
  git('pull', '-q', '--rebase', '--autostash');
  git('push', '-q');
  console.log('pushed');
}

async function login() {
  await mkdir(PROFILE, { recursive: true });
  console.log('開啟 Chrome 視窗：請用專用 Google 帳號登入 P9，看到預約表後關掉整個視窗。');
  await new Promise((resolve, reject) => {
    const p = spawn(CHROME, [`--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', `${ORIGIN}/reserve`], { stdio: 'ignore' });
    p.on('exit', resolve); p.on('error', reject);
  });
  console.log('視窗已關閉，檢查登入狀態…');
  const tok = await getToken();
  console.log(`登入成功，token 到 ${new Date(tokenExp(tok)).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);
}

// 同一時間只跑一份（整點排程和「立即更新」可能撞在一起，Chrome 設定檔也不能同時開兩個）
async function withLock(fn) {
  try { if (Date.now() - (await stat(LOCK)).mtimeMs > 10 * 60 * 1000) await unlink(LOCK); } catch {}
  let fh;
  try { fh = await open(LOCK, 'wx'); } catch { console.log(`${new Date().toISOString()} 另一份正在跑，略過`); return; }
  try { await fn(); } finally { await fh.close(); await unlink(LOCK).catch(() => {}); }
}

async function run() {
  let out;
  try {
    out = await scrape();
  } catch (e) {
    // 失敗時保留上一次的資料，只標記狀態，約場板會顯示警告
    let prev = {};
    try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
    out = { ...prev, ok: false, error: e instanceof NeedLogin ? 'needs_login' : 'error', error_detail: e.message, checked_at: new Date().toISOString() };
    console.error(`P9 failed: ${e.message}`);
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  const n = (out.courts || []).reduce((a, c) => a + Object.values(c.days).flat().filter(Boolean).length, 0);
  console.log(`${new Date().toISOString()} p9 ok=${out.ok} ${n} open slots`);
  if (!process.argv.includes('--no-push')) push();
}

// 沒有請求時安靜結束，不寫 log
async function poll() {
  let cfg;
  try { cfg = JSON.parse(await readFile(CONFIG, 'utf8')); } catch { return; }
  const call = (path, method = 'GET') => fetch(cfg.worker_url + path, {
    method, headers: { authorization: `Bearer ${cfg.mac_key}` }, signal: AbortSignal.timeout(10000),
  });
  const res = await call('/pending');
  if (!res.ok) throw new Error(`Worker /pending ${res.status}`);
  if (!(await res.json()).pending) return;
  if (!(await call('/claim', 'POST')).ok) return;
  console.log(`${new Date().toISOString()} 有人按了立即更新`);
  await withLock(run);
}

async function main() {
  if (process.argv[2] === 'login') return login();
  if (process.argv.includes('--poll')) return poll();
  await withLock(run);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
