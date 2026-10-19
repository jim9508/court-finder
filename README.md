# court-finder

匹克球約場板：每小時抓閃電匹克館三面場未來 14 天的空檔，放到 GitHub Pages，點空檔加進候選清單後產生 LINE 投票訊息。

- `scrape.mjs`：抓 `wp-admin/admin-ajax.php`（`wc_appointments_get_slots`），每次請求間隔 1.5 秒，輸出 `data/slots.json`
- `index.html`：約場板，讀同站的 `data/slots.json`
- `.github/workflows/pages.yml`：台北時間 07–24 點每小時跑一次，抓完直接部署到 Pages（不 commit 資料）
- P9 競技館的時段 API（`/api/v2/courts/slots`）要 Google 登入，沒有自動抓，約場板上用手動加入

本機測試：`node test.mjs && node scrape.mjs`，再用 `python3 -m http.server` 開 `index.html`。
