# PROGRESS

| Phase             | 狀態                  | 備註                              |
| ----------------- | --------------------- | --------------------------------- |
| 0 骨架            | ✅ 完成（2026-10-10） | 見下                              |
| 1 視覺原型        | ✅ 完成（2026-10-10） | 使用者驗收美術方向                |
| 2 角色動畫        | 未開始                |                                   |
| 3 狀態機 + 模擬器 | 未開始                |                                   |
| 4 真實整合        | 未開始                | 先驗證 Claude Code hooks 官方文件 |
| 5 正式化          | 未開始                |                                   |

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
