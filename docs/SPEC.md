# AgentCubicle — 3D AI Agent 虛擬辦公室 規格計劃書 v2

## Context（為什麼重寫）

原始 PRD 的分層（Main 監聽 → 正規化 → Renderer 繪製）方向正確，但有三個缺口：

1. **事件可靠性**：用字串搜尋 JSONL（`ReadFile`/`Bash`）判斷狀態，無法區分「工具呼叫」與「執行成功」，也無法處理等待批准、逾時、多 session。
2. **美術與動畫只有名稱沒有規格**：「Low-Poly + 1024 貼圖 + Draw Calls < 100」不保證好看；動畫名稱沒有對應資產契約。
3. **Electron 安全與生命週期未定義**：localhost server、contextIsolation、休眠喚醒、長時間運行。

本版整合原 PRD、Gemini 與 ChatGPT 的建議，並加入我的取捨判斷（見「決策紀錄」）。專案目錄目前為空（greenfield）。

---

## 1. 願景與非目標

**願景**：桌面常駐的 Cozy Isometric 微縮辦公室，每個 AI Agent session 是一個角色，其工作狀態即時、可信地反映在動作上。

**非目標（v1）**：不控制 Agent（唯讀視覺化，不批准/拒絕工具呼叫）；不做雲端同步；不做角色編輯器；不自動執行任何 shell。

## 2. 技術棧

| 層       | 選擇                                                                                  | 理由                                              |
| -------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 建置     | electron-vite + TypeScript(strict) + pnpm                                             | main/preload/renderer 三入口開箱即用              |
| Renderer | React + R3F + drei + postprocessing                                                   | 如原 PRD                                          |
| 狀態     | Zustand（僅放 session 狀態、設定、UI）；**每幀動畫狀態不進 store**，用 ref / useFrame | 避免全域 re-render                                |
| Immer    | 僅在 reducer 內使用；可省略                                                           | 狀態很淺，非必要                                  |
| Main     | Node 內建 `http`（或 fastify），chokidar，zod 驗證                                    | **不用 ws**：Main→Renderer 走 IPC，不需第二條通道 |
| 測試     | vitest（reducer/adapter）、Playwright-Electron（截圖回歸、E2E）                       |                                                   |
| 打包     | electron-builder（mac/win/linux）                                                     |                                                   |

## 3. 架構

```
Claude Code hooks ──► hook CLI (stdin→HTTP POST) ─┐
Claude JSONL (補充) ──► chokidar tailer ──────────┼─► Adapters ─► Normalizer(zod)
Webhook (Codex/Aider/自製) ───────────────────────┘        │
                                                           ▼
                                   Event Hub: dedupe → order → SessionReducer(純函式) → timers
                                                           │ IPC (contextBridge)
                                                           ▼
 Renderer: Zustand(sessions) ─► Presentation Mapper(狀態→動畫/道具/座位) ─► R3F Scene
```

**嚴格分層**（每層可獨立測試，禁止跨層 import）：

- `packages/shared`：事件 schema、型別、`sessionReducer`、狀態轉換表（純 TS，零依賴 Electron/Three）
- `src/main`：adapters、event hub、本機 server、watcher、視窗/生命週期
- `src/preload`：僅暴露 `window.cubicle.onState(cb)`、`getSnapshot()`、`setSettings()`
- `src/renderer`：store、presentation mapper（資料驅動 JSON：state→animation）、scene、UI

**權威狀態在 Main**：reducer 與逾時計時器跑在 Main，Renderer 只收「session 快照 + diff」。重開視窗可立即還原。

## 4. 事件模型（取代原 §4）

```ts
type AgentEventType =
  | 'SESSION_STARTED'
  | 'TASK_STARTED'
  | 'TOOL_STARTED'
  | 'TOOL_COMPLETED'
  | 'APPROVAL_REQUIRED'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'SESSION_ENDED'
  | 'HEARTBEAT'
type ToolKind = 'READ' | 'WRITE' | 'EXEC' | 'SEARCH' | 'OTHER' // 由 adapter 把工具名映射，非字串 includes

interface AgentEvent {
  // 原始事實，adapter 輸出
  eventId: string // 去重（來源無 id 時以 hash(source,session,seq|ts,type,tool) 產生）
  agentId: string
  sessionId: string
  type: AgentEventType
  timestamp: number
  sequence?: number
  toolName?: string
  toolKind?: ToolKind
  detail?: string // detail 需截斷、去敏（路徑只留 basename 可設定）
  success?: boolean
  source: 'hook' | 'log' | 'webhook'
}
type Presence = 'ACTIVE' | 'WAITING_APPROVAL' | 'COMPLETED' | 'ERROR' | 'IDLE' | 'STALE'
type Activity = 'THINKING' | 'READ' | 'WRITE' | 'EXEC' | 'NONE'
interface SessionState {
  agentId
  sessionId
  presence
  activity
  since
  lastEventAt
  inferred: boolean
  detail?
  seat?
}
```

**原始事件 vs 推定狀態分離**：`THINKING` 只在「TASK_STARTED 後或 TOOL_COMPLETED 後、無進行中工具」時**推定**（`inferred=true`），UI 可用較淡的氣泡區別。

**狀態轉換規則**（寫成表格 + 單元測試）：

- TOOL_STARTED → ACTIVE + Activity(toolKind)；TOOL_COMPLETED(success) → ACTIVE/THINKING(推定)；失敗的單次工具 ≠ TASK_FAILED（短暫 hiccup，不進 ERROR）
- APPROVAL_REQUIRED → WAITING_APPROVAL，**黏著**直到收到下一個 TOOL_STARTED/TOOL_COMPLETED/TASK_*/SESSION_ENDED
- TASK_COMPLETED → COMPLETED（播放 ~3s 慶祝）→ IDLE；TASK_FAILED → ERROR 黏著直到新 TASK_STARTED
- 無事件逾時：ACTIVE 超過 N 秒（預設 90s，可設）→ STALE（顯示「?」，**不**回 IDLE、不宣告成功）；STALE 超過 M 分鐘 → IDLE；WAITING_APPROVAL 不逾時
- 亂序/重複：以 `(sessionId, sequence|timestamp)` 排序、`eventId` LRU 去重；過舊事件（早於 session 當前狀態 since）忽略
- 無法辨識事件：記診斷 log、**保留最後有效狀態**，不假設 IDLE
- App 啟動：不重播歷史；JSONL 僅從檔尾開始 tail，並用檔案 mtime 判斷近期活躍 session

## 5. 事件來源（優先序）

1. **Claude Code Hooks（第一優先）**：`SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / Notification（權限提示）/ Stop / SubagentStop / SessionEnd`。提供 `agentcubicle-hook` 小型 CLI（讀 stdin JSON → POST 到 `127.0.0.1:9876`，逾時 <500ms、失敗靜默、**絕不阻擋 Claude**，exit 0）。App 提供「一鍵安裝/移除 hooks」並**寫入前顯示 diff 經使用者確認**（修改 `~/.claude/settings.json`）。**實作 Phase 4 前須對照當前官方文件驗證 hook 名稱、payload 欄位、是否支援 http 型 hook。**
2. **JSONL tailer（補充）**：增量讀取（記 offset）、處理截斷/輪替、半行緩衝、單行 try/catch；僅用於恢復/補細節。
3. **Webhook**：`POST /api/event`，body 即 `AgentEvent`（zod 驗證）；供 Codex CLI / Aider / 自製 Agent；提供官方範例 curl 與 Python snippet。

**本機 server 安全**：綁 `127.0.0.1`；`Authorization: Bearer <token>`（首次啟動隨機產生，存 userData，hook CLI 讀同檔）；拒絕帶 `Origin` header 的瀏覽器請求（防 DNS rebinding / 任意網頁）；驗證 `Host`；body ≤ 16KB；per-IP rate limit；只接受事件，**不提供任何檔案/指令操作**。埠被占用時可設定並回報。

## 6. 3D 與美術規格（取代原 §7.1–7.3）

**風格**：Cozy Premium Isometric Diorama（暖木、奶油、低飽和）；角色品質優先（Character-First）。避免「Low-Poly 即達標」。

**渲染基準**（建立 `RenderConfig` 單一來源）：

- OrthographicCamera，等角預設（≈35.264° 仰角、45° 方位）；zoom/角度可調，有固定「展示相機」預設
- `renderer.outputColorSpace = SRGBColorSpace`、貼圖 color 用 sRGB、data 用 Linear；`ACESFilmicToneMapping`（或 AgX，以截圖對比決定）；exposure 可調
- 燈光：1 主方向光（柔陰影，PCFSoft/VSM，shadow map 1024–2048）+ HemisphereLight/環境 IBL（小尺寸 HDR）；家具以 **烘焙 AO / lightmap** 為主，動態陰影只給角色與少數大物件；地面接觸陰影（drei `ContactShadows`/`AccumulativeShadows` 預烘）
- 後製（輕量、可關）：SMAA 或 MSAA、輕度 Bloom（螢幕/警示發光）、選配 vignette
- DPI：`setPixelRatio(min(devicePixelRatio, 2))`，品質檔可降；視窗縮放時重算 viewport
- 品質檔 High / Balanced / Low：控制 dpr、shadow 解析度、後製、動態光數、抗鋸齒

**資產規範**：glTF 2.0/GLB；PBR；一般貼圖 ≤1K、角色與焦點物件 ≤2K，採 **KTX2/Basis 壓縮** + **Draco/Meshopt**（降 GPU 記憶體與載入）；家具共用 atlas 材質；多面數依畫面佔比分配；單位統一（1 unit = 1 m）、原點/朝向約定寫入 `ASSETS.md`。
**授權**：每個第三方資產登錄於 `assets/LICENSES.md`（來源、授權、署名、商用）。來源候選：Kenney、Quaternius（CC0）、Poly Haven（CC0 貼圖/HDRI）；**Mixamo 動畫可商用但不可再散佈原始檔**，需評估；建議以 Blender 重定向動畫並以 glTF 輸出。

**效能驗收**（量測，不是教條）：目標 60 FPS（高 DPI 螢幕 Balanced 檔）；draw calls <100 為初步目標，以 `renderer.info` 實測記錄；GPU 記憶體（textures/geometries 數量）穩定；30 分鐘連跑無記憶體/事件堆積；4 角色同時動畫仍達標；視窗不可見/最小化時暫停渲染（`frameloop="never"` 或降到 ~10 FPS）；靜止時用 `frameloop="demand"` + 動畫期間 invalidate。

## 7. 角色與動畫系統

- **動畫契約**（`character.manifest.json`）：每個角色宣告 `clips: { idle, sitIdle, typeFast, read, standTerminal, think, wave, confused, celebrate, walk }`、`loop` 規則、`fallback` 鏈（缺 clip → 退到 idle，**永不停止渲染**）。載入時驗證 manifest vs GLB clips，缺漏於 console 與診斷面板警告。
- 分層：**Base**（AnimationMixer + `crossFadeTo`，0.25–0.4s）／**Secondary**（眨眼、呼吸：程式化 morph/骨骼 additive，不與 base 衝突）／**Overlay**（思考泡泡、⚠、紅色警示、終端發光：Sprite/簡單幾何，與角色解耦）。
- **角色 FSM（表現層）**：`Seated(at desk) ⇄ Walking ⇄ Standing(at rack) ⇄ Lounge`，以路徑點走路轉場，避免瞬移；同一動畫重複觸發忽略；一次性 clip（wave、celebrate）播完回 base；可被更高優先級打斷（ERROR/WAITING > 其他）。
- **映射表為資料**（`presentation-map.json`）：

| presentation     | 動畫                  | 地點/道具      |
| ---------------- | --------------------- | -------------- |
| IDLE             | idle_coffee / stretch | 沙發、咖啡     |
| THINKING(推定)   | think                 | 思考氣泡（淡） |
| READ             | sit_read              | 書桌、書本     |
| WRITE            | sit_type_fast         | 螢幕發光、鍵盤 |
| EXEC             | stand_terminal        | 機櫃/多螢幕    |
| WAITING_APPROVAL | wave_attention        | 黃色 ⚠         |
| COMPLETED        | celebrate → idle      | ✓ 特效         |
| ERROR            | confused              | 紅色螢幕       |
| STALE            | idle + 「?」          | 淡化           |

- **多 Agent**：每個 `(agentId, sessionId)` 一個角色；座位由 `SeatAllocator` 分配（固定偏好 agent→座位、滿座時排隊站立/顯示溢位計數、SESSION_ENDED 後延遲釋放）；角色外觀依 agentId 區分（配色/名牌）；名牌顯示 agentName + 簡短 detail。
- **生命週期**：角色/材質/貼圖/clip 以 ref-count 快取；移除角色時 `mixer.stopAllAction()`、`uncacheRoot`，並對 geometry/material/texture `dispose()`；GLB 以 drei `useGLTF` 非同步載入 + 進度 + 失敗 fallback（程式生成的簡易人形，Phase 1 即作為保底）。

## 8. Electron 視窗與安全

- `contextIsolation:true`、`nodeIntegration:false`、`sandbox:true`、嚴格 CSP、禁止 `webview`、`will-navigate`/`setWindowOpenHandler` 全擋；preload 只暴露最小 API，IPC 以 zod 驗證
- 單實例鎖；`uncaughtException`/`unhandledRejection` 記錄後恢復，不使 Main 崩潰；adapter 各自 try/catch 隔離
- 視窗：可縮放、記憶位置/大小、HiDPI、可選置頂（always-on-top）、可選透明無邊框（透明視窗在部分平台影響 GPU 與陰影，預設關，列為可選功能）；macOS 休眠喚醒（`powerMonitor`）重建 watcher、重置逾時計時器
- 診斷面板（隱藏式）：FPS、draw calls、textures、事件速率、各 adapter 健康度、最近 N 筆事件與丟棄原因
- 不蒐集遙測；`detail` 預設只顯示檔名 basename，可設定關閉

## 9. 目錄結構

```
agentCubicle/
  packages/shared/       schema, reducer, transition table, tests
  src/main/              adapters/{claudeHook,claudeJsonl,webhook}, hub, server, window
  src/preload/
  src/renderer/          store, presentation, scene/, characters/, ui/, config/render.ts
  tools/hook-cli/        agentcubicle-hook
  tools/simulator/       事件模擬器 CLI（Phase 3 起即用）
  assets/                glb, ktx2, LICENSES.md, ASSETS.md
  docs/                  SPEC.md(本文件定稿), PROGRESS.md, ADR/
  tests/visual/          固定相機截圖基準
```

## 10. 交付階段（每階段皆須「可執行 + 測試結果 + 已知限制 + 待辦」寫入 docs/PROGRESS.md）

- **Phase 0 — 骨架**：electron-vite 腳手架、strict TS、lint/format、vitest、IPC 通道 + preload、安全設定、`packages/shared` 空殼、CI。_驗收_：`pnpm dev` 開窗、IPC ping、安全檢查清單通過。
- **Phase 1 — 視覺原型**：RenderConfig（ACES/sRGB/燈光/陰影/正交相機）、辦公室場景（桌、椅、沙發、機櫃、植物，模組化）、1 個角色（先程式生成人形保底，再換 GLB）、固定展示相機。_驗收_：1920×1080 與 2× DPI 截圖基準入庫；前/中/背景層次、接地陰影、無過曝/死黑；FPS 與 `renderer.info` 記錄。**此階段需使用者目視確認美術方向，再繼續投入動畫。**
- **Phase 2 — 角色動畫**：manifest 驗證、AnimationMixer 交叉淡化、Base/Secondary/Overlay、坐姿與家具對位、走路轉場、fallback、dispose 測試。_驗收_：動畫切換無瞬移（錄影/逐幀檢查）；缺 clip 不崩潰；反覆切換 100 次 GPU 資源不增長。
- **Phase 3 — 狀態機 + 模擬器**：shared reducer + 轉換表 + 逾時 + 去重排序，單元測試覆蓋第 4 節每條規則；`tools/simulator` 推送情境（正常任務、等待批准、失敗恢復、亂序/重複、斷訊逾時、多 session）。_驗收_：reducer 測試全綠；模擬情境端到端驅動 3D 角色。
- **Phase 4 — 真實整合**：本機 server + 安全措施 → Claude hooks adapter + hook 安裝器 → JSONL tailer（補充）→ Webhook 文件/範例 → 多 Agent/多 session 座位分配。_驗收_：真實 Claude Code session 的 工具→動作→完成 流程正確；等待批准會黏著；Origin/無 token 請求被拒；畸形 JSONL 不崩潰；無事件時進 STALE 而非 IDLE。
- **Phase 5 — 正式化**：品質檔、休眠喚醒、背景節流、30 分鐘 soak test、4+ 角色壓測、視覺回歸 CI、打包簽章（mac notarize / win）、使用者文件。_驗收_：soak 無記憶體成長；三平台安裝包可啟動。

## 11. 決策紀錄（對原建議的取捨）

- **採納** ChatGPT：Premium Stylized、事件 schema 擴充（session/eventId/sequence）、Hooks 優先、安全清單、分階段、視覺回歸。
- **調整**：Gemini/ChatGPT 的 WebSocket 通道**移除**（Main→Renderer 用 IPC 已足夠，少一個攻擊面）；`UNKNOWN` action 改為「保留最後有效狀態 + 診斷」，另以 `STALE` 表示「很久沒消息」，避免把「不知道」當成一種動作；將原本單一 `action` 拆成 `presence` + `activity`，才能表達「等待批准時仍保留先前活動」；`THINKING` 明確標為推定。
- **保留**：Draw calls <100 作為參考目標而非硬性規則；原 PRD 的 FSM 映射表（改為資料驅動）。
- **新增**：KTX2/Meshopt 壓縮、授權登錄、hook CLI「永不阻擋 Agent」、hooks 安裝需使用者確認 diff、唯讀視覺化非目標。

## 12. 風險與待驗證

1. Claude Code hooks 的確切事件名/欄位/是否支援 http hook → Phase 4 前查官方文件並以實機驗證（可能影響 hook CLI 設計）。
2. 高品質免費角色 GLB + 完整動畫集不易取得 → Phase 1/2 之間設「資產關卡」：若無合適資產，改用 Blender 自製/重定向，或縮減動畫集（以 Overlay 補表現力）。
3. 透明視窗 + 陰影 + 後製在各平台表現不一 → 列為可選，預設不透明。
4. 「看起來漂亮」需人眼判斷 → Phase 1 結束必須由使用者驗收截圖基準。

## 13. 驗證方式（端到端）

- `pnpm test`：shared reducer/轉換表/去重/逾時、adapter 解析（含畸形輸入 fuzz）、server 安全（無 token、帶 Origin、超大 body、錯誤 JSON 皆被拒）
- `pnpm dev` + `tools/simulator`：跑全情境，肉眼 + Playwright 截圖比對固定相機基準
- 真實：安裝 hooks → 跑一次 Claude Code 任務（讀檔/改檔/Bash/批准提示/完成）→ 對照角色動作
- 效能：診斷面板記錄 FPS/draw calls；30 分鐘 soak（腳本化模擬事件）觀察記憶體曲線
- 安全：檢查清單（contextIsolation、CSP、IPC 驗證、server 綁定位址）寫成自動化測試

## 14. 核准後的第一個動作

將本計劃定稿為 `docs/SPEC.md`，建立 `docs/PROGRESS.md`，開始 **Phase 0**。
