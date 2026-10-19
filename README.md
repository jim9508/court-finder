# court-finder

匹克球約場板：每小時抓閃電匹克館三面場未來 14 天的空檔，放到 GitHub Pages，點空檔加進候選清單後產生 LINE 投票訊息。

- `scrape.mjs`：抓 `wp-admin/admin-ajax.php`（`wc_appointments_get_slots`），每次請求間隔 1.5 秒，輸出 `data/slots.json`
- `index.html`：約場板，讀同站的 `data/slots.json`
- `.github/workflows/pages.yml`：台北時間 07–24 點每小時跑一次，抓完直接部署到 Pages（不 commit 資料）
- `p9.mjs`：P9 競技館要 Google 登入（token 24 小時）。在本機用專用 Chrome 設定檔取得 token，抓三面匹克球場空檔寫進 `data/p9.json` 並推上 repo；Actions 下一輪把它併進約場板。只保留時間、價格，不存訂位人資料
  - 第一次：`npm install`，再 `node p9.mjs login`，用專用 Google 帳號登入 P9 後關掉視窗
  - 排程：`~/Library/LaunchAgents/com.jim9508.court-finder-p9.plist`，台北時間 07–24 點每小時第 7 分跑，log 在 `~/Library/Logs/court-finder-p9.log`
  - 約場板顯示「P9 需要重新登入」時，重跑 `node p9.mjs login`

本機測試：`node test.mjs && node scrape.mjs`，再用 `python3 -m http.server` 開 `index.html`。
