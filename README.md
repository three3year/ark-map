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
| 資料管線 | `pipeline/` | Node 腳本:抓取(`fetchCached.ts`)、關卡表與集成戰略主題表等 → 關卡索引(`stageIndex.ts`)、原始檔 → 關卡模型(`convertLevel.ts`)、輸出(`run.ts`)。來源 repo 與分支在 `config.ts` |
| 關卡模型 | `src/level/` | 站內 JSON 的型別與格子查詢;難度修正(`modifiers.ts`):變體套用、移速倍率、已知修正鍵清單(管線遇到清單外的鍵會警告,畫面只顯示不套用) |
| 尋路 | `src/pathfinding/` | 地圖 + 目標格 + 移動模式 → nextNode 表(SPFA + 平整化;「2×x 長方形」視線規則有開關 `rectangleRule`,預設開) |
| 基準時間軸 | `src/timeline/` | 出生時刻、移動模型介面(`movement.ts`)、時刻快照 |
| 畫面 | `src/ui/` | Svelte 元件、hash 路由、繁中字串表(`strings.ts`) |

尋路與基準時間軸不依賴 Svelte、DOM 或網路。

## 測試

只打兩道接縫:

- 原始遊戲資料 → 關卡模型:`pipeline/convertLevel.test.ts`、`pipeline/stageIndex.test.ts`,fixture 是 `test-fixtures/raw/` 裡實際抓下的原始檔(表格只留幾個區域與用到的欄位)。
- 關卡模型 → 基準時間軸 / 快照:`src/timeline/*.test.ts`,尋路的 nextNode 表在 `src/pathfinding/pathfinding.test.ts`(期望值取自文章的紙上推演與遺塵漫步 EX-4)。
