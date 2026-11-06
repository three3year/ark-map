# 明日方舟時刻快照

選關卡、拉時間軸,看第 T 秒場上每隻敵人個體在哪。純靜態網站,計算都在瀏覽器。用語見 `GLOSSARY.md`。

## 指令

需要 Node 22 與 pnpm 10。

```sh
pnpm install
pnpm data        # 資料管線:抓原始遊戲資料、裁剪成 public/data/(不進版本控制)
pnpm dev         # 本機開發伺服器,開 http://localhost:5173/#/level/main_01-07?t=35
pnpm test        # 單元測試(vitest)
pnpm lint        # Prettier 檢查 + ESLint
pnpm build       # 型別檢查(svelte-check)+ Vite 建置到 dist/
pnpm fixtures obt/main/level_main_04-04.json   # 更新 test-fixtures/raw/ 的原始檔副本
```

`pnpm dev` 與 `pnpm build` 之前要先跑過 `pnpm data`。

原始檔下載後快取在 `.cache/raw/`(被忽略);設環境變數 `AK_RAW_CACHE` 可指到別處,讓多個工作目錄共用。

## 模組

依賴方向由上往下:

| 模組 | 位置 | 內容 |
|---|---|---|
| 資料管線 | `pipeline/` | Node 腳本:抓取(`fetchCached.ts`)、原始檔 → 關卡模型(`convertLevel.ts`)、輸出(`run.ts`)。來源 repo 與分支在 `config.ts` |
| 關卡模型 | `src/level/` | 站內 JSON 的型別與格子查詢 |
| 尋路 | `src/pathfinding/` | 地圖 + 目標格 + 移動模式 → nextNode 表(目前是佔位) |
| 基準時間軸 | `src/timeline/` | 出生時刻、移動模型介面(`movement.ts`)、時刻快照 |
| 畫面 | `src/ui/` | Svelte 元件、hash 路由、繁中字串表(`strings.ts`) |

尋路與基準時間軸不依賴 Svelte、DOM 或網路。

## 測試

只打兩道接縫:

- 原始遊戲資料 → 關卡模型:`pipeline/convertLevel.test.ts`,fixture 是 `test-fixtures/raw/` 裡實際抓下的原始檔。
- 關卡模型 → 基準時間軸 / 快照:`src/timeline/*.test.ts`。
