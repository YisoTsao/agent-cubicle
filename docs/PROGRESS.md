# PROGRESS

| Phase             | 狀態                  | 備註                                  |
| ----------------- | --------------------- | ------------------------------------- |
| 0 骨架            | ✅ 完成（2026-10-10） | 見下                                  |
| 1 視覺原型        | ✅ 完成（2026-10-10） | 使用者驗收美術方向                    |
| 2 角色動畫        | ✅ 完成（2026-10-10） | 使用者驗收動作                        |
| 3 狀態機 + 模擬器 | ✅ 完成（2026-10-10） | 使用者驗收                            |
| 4 真實整合        | ✅ 完成（2026-10-10） | 使用者驗收；真實 Claude Code 驗證延後 |
| 5 正式化          | ✅ 完成（2026-10-10） | soak PASS                             |

每階段完成後補：測試結果 / 已知限制 / 待辦。

---

## Phase 0 — 骨架

**交付**

- electron-vite 5 + Vite 8 + React 19 + TypeScript 6（strict、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）
- `packages/shared`：`AgentEvent` zod schema（SPEC §4）、`SessionState` 型別、IPC 契約（`IpcChannel`、`CubicleApi`）
- Main：單實例鎖、未捕捉例外記錄不崩潰、`hardenSession`（拒絕所有權限）、`hardenWebContents`（擋導航/新視窗/webview）、IPC handler 驗證來源 frame
- Preload：sandbox 下以 CJS 打包（`externalizeDeps: false`），只暴露 `ping / getSnapshot / onState`
- Renderer：CSP 由 Vite plugin 注入（build 嚴格；dev 放寬 inline script 與 HMR socket）
- ESLint 分層規則：`packages/shared` 禁 import electron/node/three/react；renderer 禁 import electron/node/main/preload
- CI：GitHub Actions（mac / win / linux），format → lint → typecheck → unit → e2e

**測試結果**

- `pnpm test`：6/6 通過（schema 驗證、webPreferences 安全基線）
- `pnpm test:e2e`：8/8 通過（開窗、IPC ping、webPreferences、無 Node globals、bridge 只有 3 個 key、CSP 嚴格、window.open 被擋、導航被擋、權限被拒）
- `pnpm lint` / `pnpm typecheck` / `pnpm format:check`：通過
- `pnpm dev`：啟動無錯誤

**已知限制**

- TypeScript 停在 6.x：typescript-eslint 8 尚不支援 TS 7（typescript-eslint#10940）
- CSP 透過 `<meta>` 注入（meta 不支援 `frame-ancestors`，已移除）；Phase 5 若改用自訂 `app://` protocol 可改成 response header
- CI workflow 尚未在 GitHub 上實際跑過（repo 尚無 remote）
- Renderer bundle 約 566KB（React 未 code-split，Phase 1 加入 three 後再評估）

**待辦（帶入 Phase 1）**

- 加入 three / @react-three/fiber / drei / zustand
- `RenderConfig`、辦公室場景、保底人形、固定展示相機、截圖基準

---

## Phase 1 — 視覺原型（分支 `phase-1-visual`）

**交付**

- `config/render.ts`：RenderConfig 單一來源（ACES Filmic、sRGB、曝光、PCFSoft 陰影、正交等角相機、品質檔 High/Balanced/Low、配色表）
- 場景（全部程式生成，無第三方資產）：地板木紋（CanvasTexture）、雙牆剖面 + 窗、2 個工作站（`WORKSTATIONS`，供 Phase 4 座位分配）、書櫃（InstancedMesh 書本）、終端機台 + 機櫃（EXEC 區）、沙發/地毯/茶几/落地燈（IDLE 區）、植物、掛畫、時鐘
- 保底角色 `PlaceholderCharacter`：Q 版人形、坐姿打字、呼吸/眨眼/頭部微動/打字手部（次要動畫層）
- 燈光：主光（暖色、柔陰影）+ Hemisphere + Lightformer 程式化 IBL（不需下載 HDR）+ 落地燈點光
- 後製：N8AO（AO）、Bloom（螢幕/LED）、Vignette、SMAA；依品質檔開關
- `StaticBatch`：靜態家具依材質合併，draw calls 449 → 140
- 診斷：`StatsProbe`（FPS、draw calls、triangles、geometries、textures、programs），F3 或 Ctrl+Shift+D 切換
- 展示模式：`CUBICLE_SHOWCASE=1` 凍結時間，截圖可重現；`CUBICLE_QUALITY`、`CUBICLE_DIAGNOSTICS`
- 截圖基準：`pnpm screenshots` → `tests/visual/baseline/*.png|json`

**驗收回饋後的調整（使用者選擇：氛圍 + 佈局）**

- 氛圍：曝光 1.05→1.14、主光更暖（#ffdcae）、牆色/背景偏暖、落地燈加亮；窗戶投射到地板的暖色光斑（程式化 decal，含窗格，無額外陰影光源）
- 佈局：房間 6 m → 5.4 m 更緊湊；新增咖啡吧（窗下，Phase 2 IDLE 喝咖啡點位 `COFFEE_BAR.stand`）、桌上方壁架、沙發邊几；植物整併避免遮擋機櫃

**量測（M 系列 Mac、1920×1080，showcase）**

| Case          | DPR     | Quality  | FPS             | Draw calls\* | Triangles |
| ------------- | ------- | -------- | --------------- | ------------ | --------- |
| 1080p-1x      | 1       | balanced | 120（螢幕上限） | 143          | 230k      |
| 1080p-2x      | 2 → 1.5 | balanced | ~109            | 143          | 230k      |
| 1080p-2x-high | 2       | high     | ~61             | 143          | 230k      |
| 1080p-1x-low  | 1       | low      | 120             | 113          | 230k      |

\* 含陰影 pass 與後製 pass 的整幀總數。

**測試結果**

- unit 6/6、e2e 9/9（新增：WebGL canvas 掛載）、visual capture 4/4、lint/typecheck/format 通過

**已知限制**

- Draw calls 143 高於 100 參考目標：剩餘大宗是保底角色（~35 個 mesh × 主 pass + 陰影 pass）。Phase 2 換成單一 skinned GLB 後預期降到 ~80
- Triangles 230k 偏高（RoundedBox 倒角），目前不影響 FPS；若低階 GPU 不足再降 smoothness 或改烘焙
- 截圖基準是「人工審查用」，尚未做像素差異自動比對（不同 GPU 會有細微差異）
- electron-vite 5 的 peer 宣告為 vite ≤7，目前使用 vite 8 實測正常
- 2× High 約 62 FPS，接近下限；Balanced 才是 HiDPI 預設

**驗收**：使用者確認美術方向（2026-10-10）

---

## Phase 2 — 角色動畫（分支 `phase-2-animation`）

**資產決策**：尚無可用的第三方 rigged GLB（SPEC 風險 #2）。保底 Q 版角色升級為真正的骨架角色：
單一 `SkinnedMesh`（18 骨、剛性蒙皮、頂點色 → 1 draw call）+ 程式撰寫的 `AnimationClip`，
與未來 GLB 走完全相同的 manifest → `AnimationMixer` → crossfade 管線。換成 GLB 時只需新增 manifest。

**交付**

- `characters/rig/`：`skeleton.ts`（骨架、分層骨骼遮罩）、`chibiRig.ts`（單一 SkinnedMesh、依 agent 配色）、`ik.ts`（雙骨 IK，手部精準落在鍵盤/書/杯子）、`chibiClips.ts`（15 個 clip）
- `manifest.ts`：角色動畫契約（role → clip、loop/once、fallback 鏈、once 後的 then），`resolveClips` 驗證並回報缺漏
- `AnimationController.ts`：posture（下半身+脊椎）與 gesture（頭+手臂）兩層獨立 crossfade；同 role 重複請求為 no-op；缺 clip 走 fallback，永不中斷渲染；`dispose()` 釋放 mixer 快取
- `Locomotion.ts` + `places.ts`：桌 A/桌 B/終端機/咖啡吧/沙發；經 approach 點與中央 hub 走路；速度、轉向速率、單幀時間皆有上限 → 不瞬移
- `presentation.ts`：資料驅動的狀態對照表（place / gesture / 依姿勢覆寫 / overlay / 螢幕 / 終端機）；手持道具依 gesture 決定（mug、book）
- 次要動畫：眨眼、呼吸（骨骼縮放，不與 clip 衝突）
- Overlay：思考泡泡、⚠、紅色 !、✓、?（canvas sprite，全域共用貼圖，進場彈出）；THINKING/STALE 以淡化顯示「推定」
- 道具連動：桌上螢幕 idle/active/error（紅），終端機 EXEC 時程式碼行捲動發光（從 StaticBatch 移出成 live 元件）
- Dev 面板（F3）：9 個狀態按鈕 + demo loop；`window.__cubicleDev`（setState / respawn / stats / pose）
- 啟動參數：`CUBICLE_STATE`、`CUBICLE_DEMO=1`

**測試結果**

- unit 67/67：IK 往返、manifest fallback/循環、controller（分層、no-op、crossfade、once→then、缺 clip、dispose）、所有地點間走路連續性（20 條路線）、中途改道、卡頓夾制、presentation 表完整性
- e2e 14/14，新增：
  - WRITE→EXEC→IDLE→READ 三段真實走路：root 單幀位移 ≤ 0.055 m、hips 骨骼單幀位移 < 0.08 m（無瞬移）
  - 100 次狀態切換 + 10 次 respawn：geometries/textures 不增長。**已做反向驗證**：拿掉 `rig.dispose()` 時測試失敗（74 → 83）
- visual：9 個狀態 close-up + contact sheet；Phase 1 場景基準已更新

**量測（1920×1080）**：draw calls 143 → **107**（角色由 ~35 mesh 變 1 個 skinned mesh）；Balanced 2× ~108 FPS、High 2× ~63 FPS

**已知限制**

- 角色仍為程式生成 Q 版；正式 GLB 角色（含臉部表情）待資產決策
- 沙發座深大於 Q 版腿長，採「腿伸直坐」造型
- 走路路線為手工 waypoint（hub 中轉），非 navmesh；多 agent 互相避讓留待 Phase 4 座位分配時處理
- `react-hooks/immutability` 規則對 `scene/`、`characters/` 關閉（Three.js 物件本質上是 imperative 的）
- 視覺基準仍為人工審查，未做像素比對

**驗收**：使用者確認動作方向（2026-10-10）

---

## Phase 3 — 狀態機 + 模擬器（分支 `phase-3-state-machine`）

**交付**

- `packages/shared/src/reducer.ts`：純函式 session 狀態機（SPEC §4）
  - TOOL_STARTED → ACTIVE + 工具活動（READ/SEARCH→READ、WRITE、EXEC；未知工具 → 推定 THINKING）
  - TOOL_COMPLETED → 推定 THINKING；**單一工具失敗 ≠ 任務失敗**
  - WAITING_APPROVAL 黏著，只有工具/任務/結束事件能解除；HEARTBEAT 不行；**永不逾時**
  - ERROR 黏著直到新的 TASK_STARTED；COMPLETED 顯示 3 秒後回 IDLE
  - ACTIVE 靜默 90 秒 → STALE（保留原活動，**不**回 IDLE、不當作成功）；STALE 5 分鐘 → IDLE；STALE 收到任何事件即恢復
- `packages/shared/src/hub.ts`：`EventHub`（時鐘注入、無計時器，main 與測試行為一致）
  - zod 驗證（壞資料不拋錯、不改狀態、記入診斷）、eventId 去重（LRU 2000）、依 sequence（無則 timestamp）丟棄過舊事件
  - 座位分配：穩定、不搬動已就座者；結束的 session 停留 15 秒才釋放座位；超額顯示 overflow
  - `detail` 預設只保留檔名（`cat /Users/me/x/a.txt` → `cat a.txt`）
- 模擬器：6 個情境（normal-task、approval、failure-recovery、out-of-order、disconnect、multi-session），純資料 + `expandScenario`
- Main：`HubService`（500 ms tick、合併推送快照、情境執行器），開發用 IPC（列表/執行/重設/診斷，**打包版拒絕**，參數以 zod 驗證），`CUBICLE_SIMULATE=<name>[@speed]`
- Renderer：IPC 快照 → `toPresentation` → 角色；agent 依 id 固定配色；名牌（名稱 + 目前檔案）；live / manual 兩種來源
- **換地點防抖 1 秒**＋走路 1.05 → 1.5 m/s：短工具呼叫不會讓角色來回奔走（測試中發現的實際體驗問題）
- Dev 面板改版：情境 + 速度、manual 狀態、agent 列表、hub 診斷計數
- `pnpm sim list | print <name> [--speed N]`：輸出 NDJSON 時間軸（Phase 4 加 `--post`）

**測試結果**

- unit 112/112：每條 §4 規則一個測試、ingestion（無效/重複/亂序/timestamp 後備/session 獨立/座位/路徑去敏）、6 個情境以假時鐘完整播放並比對狀態序列、`toPresentation` 對照
- e2e 19/19，新增 5 項：normal-task 依序經過 THINKING→READ→WRITE→EXEC→COMPLETED→IDLE 且角色實際走到終端機與沙發；approval 黏著後恢復；multi-session 兩桌兩名牌互不覆蓋；out-of-order 角色從未出現遲到的 READ；開發用 IPC 拒絕非法參數
- Phase 0 安全測試同步更新（bridge 多一個 `dev` 命名空間，由 main 端把關）

**已知限制**

- 沒有座位的 session（第 3 個以上）目前只計數、不畫角色；排隊/站立顯示留到 Phase 4
- 名牌用 drei `<Html>`（DOM），多 agent 時效能可接受，數量很大時再考慮改 sprite
- 系統休眠喚醒後所有 ACTIVE session 會立即判定 STALE（符合規則，但 Phase 5 再評估是否放寬）
- CLI 尚不能推送事件（等 Phase 4 的本機 server）

**驗收**：使用者確認（2026-10-10）

---

## Phase 4 — 真實整合（分支 `phase-4-integration`）

**事前驗證**：對照官方 hooks 文件（code.claude.com/docs/en/hooks，2026-10）。官方已支援 `http` 型與 `async` command hook，
但兩者都不適合本用途：http 型在 App 關閉時每次工具呼叫都會顯示 hook error；async 型各自是背景程序，Pre/PostToolUse 可能顛倒。
因此採**同步 command hook + curl**（0.3/0.5 秒逾時、輸出全丟棄、永遠 `exit 0`）：順序有保證、App 關閉時靜默、永不阻擋 Claude。

**交付**

- Adapters（純函式）：Claude hooks（10 種事件，含 `PermissionRequest`、`PostToolUseFailure`、`StopFailure`）、Claude JSONL 紀錄（prompt / tool_use / tool_result / end_turn，略過 sidechain）；不轉送 prompt、檔案內容
- 本機 server：127.0.0.1 + 來源檢查、Bearer token（timing-safe）、拒絕 `Origin`、`Host` 白名單（防 DNS rebinding）、JSON-only、大小限制（event 16 KB / hook 1 MB）、限流；只接受觀察事件
- `~/.agentcubicle`：token、endpoint.json、hook-url（權限 600）；hook 指令執行時才讀取，換 token/埠不需重裝
- Ingest router：同一 session 一旦有 hooks，JSONL 推估即忽略
- JSONL 監聽：啟動不重播歷史、近期 session 宣告、新檔從頭讀、半行緩衝、截斷重置、忽略 subagent 紀錄
- Hook 安裝器：純函式編輯（冪等、只動自己的條目、移除後完全還原）；plan → diff → 使用者確認 → 檔案未變才寫、先備份、原子替換
- 多 agent：hub 座位偏好；地點槽位（終端機 2、沙發 2、咖啡吧 1、等待區 2）；滿了退回自己的桌子；超額顯示「+N」
- UI：「連接」面板（伺服器、Claude Code 連接/中斷含 diff、紀錄檔、Webhook）
- `pnpm sim post <name>`、`docs/INTEGRATIONS.md`（curl / Python 範例、安全說明）
- 測試隔離：`tests/isolatedEnv.ts`，所有 e2e/截圖都用暫存的 userData、`~/.agentcubicle`、`~/.claude` 與隨機埠，不碰開發者環境

**測試結果**

- unit 210/210：adapters、hook 設定編輯、**真實 sh + curl 執行 hook 指令**（送達 token/payload；App 關閉時 exit 0、無輸出、<1.5 秒）、JSONL 監聽（真實檔案系統）、座位偏好、槽位
- e2e 31/31，新增 12 項：server 安全矩陣（無/錯 token、Origin、Host、content-type、壞 JSON、無效事件、超大、錯方法/路徑）、webhook 驅動角色且路徑去敏、重複事件、**從 UI 連接 → 以實際安裝的指令跑完整 Claude 流程（寫檔 → 等待批准 → 完成）→ 中斷後設定完全還原**、預覽後檔案被改則拒絕寫入、JSONL 驅動角色、5 個 agent 的桌位/等待區/+N 與兩個 EXEC 分到不同終端機槽位

**已知限制**

- 尚未用真實 Claude Code 驗證（需使用者同意；建議 `claude --settings <暫存檔> -p` 不動正式設定）
- Windows：hook 指令假設 `sh` + `curl`（Git Bash）；PowerShell 版本待 Phase 5
- 沒有碰撞避讓：走路途中角色可能互相穿過（各自的目的地不會重疊）
- 連接面板的設定檔路徑顯示兩次（小瑕疵）

**驗收**：使用者確認截圖（2026-10-10）；使用者選擇暫不以真實 Claude Code 驗證（需耗用額度），已改以「實際安裝的 hook 指令 + 官方格式 payload」e2e 驗證

---

## Phase 5 — 正式化（分支 `phase-5-production`）

**交付**

- 長時間常駐：視窗不可見（最小化/隱藏/被完全遮住）時 `frameloop="never"`；「省電」畫質改為 demand 模式 30 FPS；狀態仍由 main 持續更新
- 偏好設定持久化（`userData/settings.json`，zod 驗證、逐欄位回退預設、寫入防抖）：畫質、視窗置頂、視窗位置與大小（僅在仍位於螢幕上時還原）
- 「設定」面板新增「顯示」區（高 / 平衡 / 省電、永遠置頂）；修正設定檔路徑重複顯示
- 休眠喚醒：`powerMonitor.resume` 重建 JSONL 監聽（從檔尾重新開始，不重播）；監聽器另加 2 秒檔案大小輪詢作為檔案系統事件的保險（測試在高負載下發現事件可能延遲/遺失）
- 安全收緊：可信 renderer 從「任何 file://」改為「僅 App 自己的 renderer 目錄」
- Windows：hook 指令路徑改用正斜線（Git Bash 可讀）
- **Soak test 抓到的實際缺陷**：沒有送 `SessionEnd` 就被關掉的 session 會以 IDLE 永遠留在 hub。新增 `idleExpireMs`（預設 30 分鐘）自動清除；模擬情境補上 `SESSION_ENDED`
- 打包：electron-builder（mac dmg+zip、win nsis、linux AppImage），簽章/公證以環境變數啟用；`dependencies` 只留 main 執行期需要的 `zod`（renderer 全部打包進 bundle），asar 僅 9.1 MB；暫用 App 圖示
- `pnpm test:packaged`：對打包版驗證（`app.isPackaged`、開發用 IPC 被拒、CSP 嚴格、本機 server 與 webhook 可用、設定重啟後保留）
- `pnpm soak`：長時間穩定性測試（情境 3× 輪播 + 3 個 webhook agent + 每 5 分鐘 respawn，每 30 秒強制 GC 後取樣），報告寫入 `docs/soak/`
- CI：三平台加上打包 + 打包版 smoke test、macOS 截圖上傳為 artifact；新增 `release.yml`（推 `v*` tag 產出三平台安裝檔到 draft release）
- 使用者文件：`README.md`（安裝、連接、角色狀態對照、設定、疑難排解、開發指令）

**測試結果**

- unit 212/212、e2e 31/31、visual 15/15、packaged smoke 1/1（macOS arm64 打包版）
- **Soak 30 分鐘：PASS**（`docs/soak/soak-2026-10-10T11-56-26.md`）

| 指標                         | 暖機後     | 結束前                  |
| ---------------------------- | ---------- | ----------------------- |
| Main JS heap                 | 8.2 MB     | 8.3 MB（+1.2%）         |
| 所有程序總 working set       | 446 MB     | 420 MB                  |
| GPU geometries / textures    | 79 / 54    | 79 / 54                 |
| Hub sessions                 | 5–6        | 5–6（修正前會持續增加） |
| FPS（同時 4 角色、Balanced） | 中位數 120 | 最低 114                |

**量測（1920×1080）**：Balanced 2× ~109 FPS、High 2× ~64 FPS、省電 30 FPS（上限生效）；draw calls 105（省電 75）

**已知限制**

- 這次 soak 的 renderer heap 取自 Chromium 粗粒度化的 `performance.memory`（固定 57.5 MB），以總 working set 佐證；工具已加 `--enable-precise-memory-info`，下次即為精確值
- 只在 macOS arm64 實際打包與執行；Windows / Linux 打包與打包版測試已寫進 CI，但 repo 尚無 remote，未實際跑過
- 未簽章、未公證（需 Apple Developer / Windows 憑證，`release.yml` 已預留）；App 圖示為暫用版本
- Windows 的 hook 指令依賴 Git Bash + curl（Claude Code on Windows 預設），未在 Windows 實測
- 走路時角色可能互相穿過（無碰撞避讓）；真實 Claude Code 端到端驗證仍待使用者同意

---

## v1 收尾（分支 `post-v1-polish`）

使用者要求完成所有「尚未做到」的項目並立即以 Claude Code 測試。

| 項目                               | 結果                                                                                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 真實 Claude Code 驗證              | ✅ `pnpm verify:claude`：隔離的 App + 暫存 settings + `claude --settings <暫存> -p`（不動正式設定）。Claude Code 2.1.296 實測：6 個 hook 事件，角色 IDLE → THINKING → READ → THINKING → COMPLETED → IDLE，名牌顯示 `package.json` |
| 角色互相穿過                       | ✅ `crowd.ts`：走路時互相推開，迎面相遇各自往右閃；只改繪製位置、不改路線/槽位；平滑、有上限；單元測試                                                                                                                            |
| 視窗隱藏時停止繪製（Phase 5 缺口） | ✅ e2e 發現 macOS 上 `BrowserWindow.hide()` 不會改 `visibilityState`；改由 main 傳送 hide/minimize/show/restore 事件與頁面可見度合併判斷；新增 e2e（隱藏、最小化皆停止，恢復後繼續）                                              |
| 測試被其他視窗遮住而停住           | ✅ 測試專用 `CUBICLE_KEEP_RENDERING`（`isolatedEnv` 預設開啟）；正式行為由上一項 e2e 覆蓋                                                                                                                                         |
| JSONL 監聽在高負載漏事件           | ✅ 輪詢保險再補強：也重新掃描目錄找新檔案                                                                                                                                                                                         |
| 正式 App 圖示                      | ✅ `pnpm icon`：直接用 App 的 3D 場景渲染（乾淨擷取，無 vignette）合成圓角圖示                                                                                                                                                    |
| Linux 打包與執行                   | ✅ Mac 上交叉產出 AppImage（128 MB）；linux-arm64 打包版在 Playwright 官方容器 + Xvfb 內通過 smoke test                                                                                                                           |
| Windows 打包                       | ✅ Mac 上交叉產出 NSIS 安裝檔（113 MB，PE32+ x86-64）；**無法在此實際執行**，待 CI（windows-latest）或實機                                                                                                                        |
| 簽章 / 公證                        | ⛔ 需要 Apple Developer ID 與 Windows 程式碼簽章憑證（使用者提供）；`release.yml` 已預留 secrets                                                                                                                                  |
| 推上 GitHub 讓 CI 跑三平台         | ⛔ 需使用者提供／同意遠端 repo（對外動作）                                                                                                                                                                                        |

**測試結果**：unit 215/215、e2e 32/32、packaged smoke：macOS arm64 ✅、Linux arm64（容器）✅、soak 30 分鐘 PASS（Phase 5）

**清理**：Phase 0 測試時遺留的 `pnpm dev` 孤兒程序（埠 5174，執行舊程式碼並占住 userData 的單一實例鎖）已關閉；之後的工具都改用隔離的 userData。
