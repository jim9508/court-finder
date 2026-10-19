import assert from 'node:assert/strict';
import { parseInazumaSlots, nextDates, parseP9Day } from './scrape.mjs';
// 2026-10-22 2號場實際回傳
const html = '<div class="slot_row"><ul class="slot_column morning"><li class="slot_heading">早上</li><li class="slot slot_empty">&#45;</li></ul><ul class="slot_column afternoon"><li class="slot_heading">下午</li><li class="slot" data-slot="1300" data-remaining="1"><a href="#" data-value="13:00">13:00</a></li><li class="slot" data-slot="1600" data-remaining="1"><a href="#" data-value="16:00">16:00</a></li></ul><ul class="slot_column evening"><li class="slot_heading">晚上</li><li class="slot" data-slot="1700" data-remaining="1"><a href="#" data-value="17:00">17:00</a></li></ul></div>';
assert.deepEqual(parseInazumaSlots(html), ['13:00', '16:00', '17:00']);
assert.deepEqual(parseInazumaSlots('<li class="slot" data-slot="900" data-remaining="0">'), []);
assert.deepEqual(parseInazumaSlots('<li class="slot" data-slot="900" data-remaining="2">'), ['09:00']);
const d = nextDates(3, new Date('2026-10-19T17:30:00Z')); // 台北已是 10/20 01:30
assert.deepEqual(d, ['2026-10-20', '2026-10-21', '2026-10-22']);
// P9：只留匹克球 N 號場、available、06:00 以後；不帶訂位人資料
const p9 = parseP9Day({
  courts: [
    { id: 31, name: '匹克球1號場', is_active: true }, { id: 24, name: '匹克球普尚發球機', is_active: true },
    { id: 34, name: '棒球1F', is_active: true }, { id: 33, name: '匹克球3號場', is_active: false },
  ],
  slots_by_court: {
    31: [
      { hour: 2, price: 480, status: 'available' },
      { hour: 13, price: 680, status: 'available', legacy_name: '王小明', legacy_phone: '0912' },
      { hour: 14, price: 680, status: 'booked', legacy_name: '王小明', legacy_phone: '0912' },
      { hour: 17, price: 880, status: 'available' },
      { hour: 18, price: 0, status: 'closed' },
    ],
    24: [{ hour: 13, price: 300, status: 'available' }],
  },
});
assert.deepEqual(p9, [{ id: 31, name: '1號場', slots: [{ t: '13:00', price: 680 }, { t: '17:00', price: 880 }] }]);
console.log('tests ok');
