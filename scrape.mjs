// 抓兩家匹克球館未來 N 天的空場時段，輸出 data/slots.json
// 需要 Node 18+（內建 fetch），沒有其他套件。
import { writeFile, mkdir } from 'node:fs/promises';

const DAYS = Number(process.env.DAYS || 14);   // 抓幾天
const DELAY_MS = 1500;                          // 每次請求間隔，別對球館網站太兇
const TZ = 'Asia/Taipei';

const INAZUMA = {
  id: 'inazuma',
  name: '閃電匹克館',
  ajax: 'https://tinybot.cc/inazuma8888/wp-admin/admin-ajax.php',
  courts: [
    { name: '1號場', productId: '3694', url: 'https://tinybot.cc/inazuma8888/product/%e9%96%83%e9%9b%bb%e5%8c%b9%e5%85%8b%e7%90%83/' },
    { name: '2號場', productId: '3696', url: 'https://tinybot.cc/inazuma8888/product/2%e8%99%9f%e5%a0%b4/' },
    { name: '3號場', productId: '3697', url: 'https://tinybot.cc/inazuma8888/product/3%e8%99%9f%e5%a0%b4/' },
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 台北時間的今天起算 n 天，回傳 ['2026-10-19', ...]
export function nextDates(n, from = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = fmt.format(from).split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    return dt.toISOString().slice(0, 10);
  });
}

// WooCommerce Appointments 回傳的 HTML：<li class="slot" data-slot="1300" data-remaining="1"><a data-value="13:00">
// 已被訂走的時段不會出現；slot_empty 是「這個時段區塊沒有空檔」的佔位。
export function parseInazumaSlots(html) {
  const out = [];
  for (const m of html.matchAll(/<li class="slot(?![_\w-]*empty)[^"]*"[^>]*data-slot="(\d{3,4})"[^>]*data-remaining="(\d+)"/g)) {
    if (Number(m[2]) <= 0) continue;
    const s = m[1].padStart(4, '0');
    out.push(`${s.slice(0, 2)}:${s.slice(2)}`);
  }
  return out;
}

async function fetchInazumaDay(productId, ymd) {
  const [y, m, d] = ymd.split('-');
  const form = new URLSearchParams({
    wc_appointments_field_start_date_month: String(+m),
    wc_appointments_field_start_date_day: String(+d),
    wc_appointments_field_start_date_year: y,
    wc_appointments_field_start_date_time: '',
    wc_appointments_field_addons_duration: '0',
    wc_appointments_field_addons_cost: '0',
    'add-to-cart': productId,
  }).toString();
  const res = await fetch(INAZUMA.ajax, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'user-agent': 'court-finder (personal use; every 60 min)' },
    body: new URLSearchParams({ action: 'wc_appointments_get_slots', form, duration: '0' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (html.trim() === '0') throw new Error('unexpected response "0"');
  return parseInazumaSlots(html);
}

async function scrapeInazuma(dates) {
  const courts = [];
  for (const c of INAZUMA.courts) {
    const days = {};
    for (const ymd of dates) {
      try { days[ymd] = await fetchInazumaDay(c.productId, ymd); }
      catch (e) { days[ymd] = null; console.error(`${INAZUMA.name} ${c.name} ${ymd}: ${e.message}`); }
      await sleep(DELAY_MS);
    }
    courts.push({ name: c.name, url: c.url, days });
  }
  return { id: INAZUMA.id, name: INAZUMA.name, ok: true, courts };
}

// P9 的時段 API（/api/v2/courts/slots?date=）需要登入後的 Authorization header，
// 目前先標示為無法自動抓取。
function p9Placeholder() {
  return {
    id: 'p9', name: 'P9 競技館', ok: false,
    note: '需要 Google 登入才看得到時段，請到預約頁查看',
    url: 'https://p9arena.linkcourt.app/',
    courts: [],
  };
}

async function main() {
  const dates = nextDates(DAYS);
  const venues = [await scrapeInazuma(dates), p9Placeholder()];
  const out = { updated_at: new Date().toISOString(), timezone: TZ, dates, venues };
  await mkdir('data', { recursive: true });
  await writeFile('data/slots.json', JSON.stringify(out, null, 2) + '\n');
  const n = venues[0].courts.reduce((a, c) => a + Object.values(c.days).flat().filter(Boolean).length, 0);
  console.log(`done: ${dates[0]}..${dates.at(-1)}, ${n} open slots at ${INAZUMA.name}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
