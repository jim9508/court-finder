# court-finder

匹克球約場板：每小時抓閃電匹克館三面場未來 14 天的空檔，放到 GitHub Pages，點空檔加進候選清單後產生 LINE 投票訊息。

- `scrape.mjs`：抓 `wp-admin/admin-ajax.php`（`wc_appointments_get_slots`），每次請求間隔 1.5 秒，輸出 `data/slots.json`
- `index.html`：約場板，讀同站的 `data/slots.json`
- `.github/workflows/pages.yml`：Mac 整點推 `data/p9.json` 時觸發，抓閃電、併 P9、部署到 Pages；另有每 15 分鐘的備援排程，Mac 20 分鐘內推過就跳過
- `p9.mjs`：P9 競技館要 Google 登入（token 24 小時）。在本機用專用 Chrome 設定檔取得 token，抓三面匹克球場空檔寫進 `data/p9.json` 並推上 repo；Actions 下一輪把它併進約場板。只保留時間、價格，不存訂位人資料
  - 第一次：`npm install`，再 `node p9.mjs login`，用專用 Google 帳號登入 P9 後關掉視窗
  - 排程：`~/Library/LaunchAgents/com.jim9508.court-finder-p9.plist`，台北時間 07:00～00:00 每 15 分鐘跑，log 在 `~/Library/Logs/court-finder-p9.log`
  - 約場板顯示「P9 需要重新登入」時，重跑 `node p9.mjs login`
- 「立即更新」按鈕：`worker/` 是 Cloudflare Worker（court-finder-refresh），記下請求並限制全站每 10 分鐘一次
  - Mac 每 15 秒跑 `node p9.mjs --poll`（`~/Library/LaunchAgents/com.jim9508.court-finder-poll.plist`）問 Worker，有請求就抓 P9 並推上來，推送會觸發部署
  - Mac 2 分鐘內沒接手，Worker 的每分鐘 cron 改用 `GH_TOKEN` 觸發 Actions，只更新閃電
  - Worker 密鑰：`MAC_KEY`（本機存在 `~/Library/Application Support/court-finder/config.json`）、`GH_TOKEN`（fine-grained，只有此 repo 的 Actions 寫入權限）
  - 部署：`cd worker && npm install && npx wrangler deploy`；測試：`node worker/test.mjs`

本機測試：`node test.mjs && node scrape.mjs`，再用 `python3 -m http.server` 開 `index.html`。
