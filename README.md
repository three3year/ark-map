# 明日方舟時刻快照

選關卡、拉時間軸,看第 T 秒場上每隻敵人個體在哪。純靜態網站,計算都在瀏覽器。用語見 `GLOSSARY.md`。

## 指令

需要 Node 22 與 pnpm 10。

```sh
pnpm install
pnpm data        # 資料管線:抓原始遊戲資料、裁剪成 public/data/(不進版本控制)
pnpm dev         # 本機開發伺服器,開 http://localhost:5173/ 選區域與關卡
pnpm test        # 單元測試(vitest)
pnpm lint        # Prettier 檢查 + ESLint
pnpm build       # 型別檢查(svelte-check)+ Vite 建置到 dist/
pnpm smoke       # 煙霧測試:Playwright 開 dist/(模擬 Pages 子路徑);先跑 pnpm build
pnpm fixtures obt/main/level_main_04-04.json   # 更新 test-fixtures/raw/ 的原始檔副本
pnpm fixtures --zone main_6                     # 關卡索引用的表格子集再加一個區域
pnpm fixtures --rogue ro4_n_1_1                 # 集成戰略主題表的子集再加一個關卡
```

`pnpm dev` 與 `pnpm build` 之前要先跑過 `pnpm data`。

原始檔下載後快取在 `.cache/raw/`(被忽略);設環境變數 `AK_RAW_CACHE` 可指到別處,讓多個工作目錄共用。管線每次先用 GitHub trees API 列出上游檔案的 blob sha(4 次呼叫;未登入每小時 60 次,設 `GITHUB_TOKEN` 可放寬),只重抓 sha 變了的檔;下載限制同時 6 個,遇 429 / 5xx 退避重試。清單拿不到時直接用既有快取。

第一次跑 `pnpm smoke` 前要裝瀏覽器:`pnpm exec playwright install chromium`。

## CI 與部署

`.github/workflows/deploy.yml`:推到 `main`、手動觸發、每週一 03:00 UTC 排程,依序跑資料管線 → 單元測試 → lint → 建置 → 煙霧測試,再部署到 GitHub Pages(repo 設定的 Pages 來源要選「GitHub Actions」)。

CI 每個上游來源各一份快取,key 是該來源分支當下的 commit(`pipeline/cacheKeys.ts` 查詢):同一版上游重跑直接用快取;上游有更新時還原前一份快取,管線依 blob sha 只重抓變了的檔。資料管線步驟帶 `GITHUB_TOKEN` 給 trees API。

## 模組

依賴方向由上往下:

| 模組 | 位置 | 內容 |
|---|---|---|
| 資料管線 | `pipeline/` | Node 腳本:抓取(`fetchCached.ts`)、關卡表與集成戰略主題表等 → 關卡索引(`stageIndex.ts`)、原始檔 → 關卡模型(`convertLevel.ts`;舊活動檔的數字列舉也在這裡解碼成字串;動作類型與檢查點類型另對 `src/level/enums.ts` 的清單檢查,沒有已知對應的值建置時警告)、名稱表的地形表(`terrainTable.ts`:關卡用到的 `tileKey` 取台服 `stage_table` 的 `tileInfo`,沒有才用國服)、裝置(`convertLevel.ts`:關卡檔預先擺好的物件,多半擺在 (0, 0) 的種類當控制器略過;名稱與說明取台服 `character_table`,沒有才用國服,說明與地形說明一樣用 `plainText.ts` 去掉遊戲的標記)、哪些裝置是擋路裝置(`deviceKinds.ts`:擋路與不擋路兩份手抄清單,出處是 PRTS;兩份都沒有的種類當作不擋路並警告)、輸出(`run.ts`;上游缺檔的關卡列出後略過,任何關卡檔轉換失敗則以非 0 結束,見 `outcome.ts`)。來源 repo 與分支在 `config.ts` |
| 關卡模型 | `src/level/` | 站內 JSON 的型別與格查詢;名稱表(`names.ts`):敵人名稱、地形表、裝置名稱與說明集中在 `data/names.json`,關卡檔只留和名稱表不同的名稱與說明,瀏覽器載入時補回;裝置在 `Level.devices` 的位置(`DeviceIndex`)就是它在關卡內的身分;難度修正(`modifiers.ts`):變體套用、移速倍率、已知修正鍵清單(管線遇到清單外的鍵會警告,畫面只顯示不套用) |
| 尋路 | `src/pathfinding/` | 地圖 + 目標格 + 移動模式 + 擋路格 → nextNode 表(SPFA + 平整化;地面尋路踏上擋路格代價 1,000、坑 1,000,000,兩者都擋平整化的視線,飛行不受擋路格影響;「2×x 長方形」視線規則有開關 `rectangleRule`,預設開) |
| 基準時間軸 | `src/timeline/` | 出生時刻與一波的動作(`schedule.ts`:`waveActions` 含啟動或撤走裝置的動作,`waveSpawns` 只取出兵動作,時間軸與出兵表共用)、移動模型介面(`movement.ts`;擋路格一變,在場的地面敵人個體就從當下位置改道)、時刻快照;裝置(`devices.ts`):每個裝置一波中何時在場(開場依隱藏與 `level_predefines_enable`,啟動從動作那一秒起,撤走從下一波起)、移除時刻,以及移除、改移除時刻或恢復的判斷(`removalToggle`);隨秒數變的值(`stepwise.ts`:開場值加之後每次變化,裝置在場與 nextNode 表都用它);一波時間軸與敵人個體的型別(`types.ts`);敵人個體身分與 key(`identity.ts`);一波時間軸的出生點與消失點,與每格對應的出兵動作;端點篩選留下的出兵表列(`endpointRows`)與地圖上的敵人個體(`matchesEndpoint`)(`endpoints.ts`);開關狀態(`switches.ts`):隱藏組預設、隨機出兵組的候選與預設(條件出兵內的組也算)、哪些出兵動作產生敵人個體;開啟的條件出兵當成一個從觸發秒數起跑的單波次關卡 |
| 畫面 | `src/ui/` | Svelte 元件、hash 路由、繁中字串表(`strings.ts`);地形標記(`terrain.ts` 的手畫圖示表決定哪些 `tileKey` 畫哪個圖示、地形表沒有名稱的變體借哪一種的名稱(連那一種也沒有時用 `strings.ts` 的內建名稱、不附說明);不在表裡、地形表標為有功能的地形畫名稱首字;圖示與首字本身在 `TerrainIcon.svelte`) |

尋路與基準時間軸不依賴 Svelte、DOM 或網路。

## 測試

只打兩道接縫:

- 原始遊戲資料 → 關卡模型:`pipeline/convertLevel.test.ts`、`pipeline/stageIndex.test.ts`、`pipeline/terrainTable.test.ts`,fixture 是 `test-fixtures/raw/` 裡實際抓下的原始檔(表格只留幾個區域與用到的欄位)。
- 關卡模型 → 基準時間軸 / 快照:`src/timeline/*.test.ts`,尋路的 nextNode 表在 `src/pathfinding/pathfinding.test.ts`(期望值取自文章的紙上推演與遺塵漫步 EX-4)。
