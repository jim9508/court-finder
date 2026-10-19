import assert from 'node:assert/strict';
import { parseInazumaSlots, nextDates } from './scrape.mjs';
// 2026-10-22 2號場實際回傳
const html = '<div class="slot_row"><ul class="slot_column morning"><li class="slot_heading">早上</li><li class="slot slot_empty">&#45;</li></ul><ul class="slot_column afternoon"><li class="slot_heading">下午</li><li class="slot" data-slot="1300" data-remaining="1"><a href="#" data-value="13:00">13:00</a></li><li class="slot" data-slot="1600" data-remaining="1"><a href="#" data-value="16:00">16:00</a></li></ul><ul class="slot_column evening"><li class="slot_heading">晚上</li><li class="slot" data-slot="1700" data-remaining="1"><a href="#" data-value="17:00">17:00</a></li></ul></div>';
assert.deepEqual(parseInazumaSlots(html), ['13:00', '16:00', '17:00']);
assert.deepEqual(parseInazumaSlots('<li class="slot" data-slot="900" data-remaining="0">'), []);
assert.deepEqual(parseInazumaSlots('<li class="slot" data-slot="900" data-remaining="2">'), ['09:00']);
const d = nextDates(3, new Date('2026-10-19T17:30:00Z')); // 台北已是 10/20 01:30
assert.deepEqual(d, ['2026-10-20', '2026-10-21', '2026-10-22']);
console.log('tests ok');
