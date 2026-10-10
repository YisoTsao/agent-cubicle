# PROGRESS

| Phase             | 狀態                  | 備註                              |
| ----------------- | --------------------- | --------------------------------- |
| 0 骨架            | ✅ 完成（2026-10-10） | 見下                              |
| 1 視覺原型        | 未開始                | 需使用者目視驗收                  |
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
- CSP 透過 `<meta>` 注入，`frame-ancestors` 在 meta 中無效（無害）；Phase 5 若改用自訂 `app://` protocol 可改成 response header
- CI workflow 尚未在 GitHub 上實際跑過（repo 尚無 remote）
- Renderer bundle 約 566KB（React 未 code-split，Phase 1 加入 three 後再評估）

**待辦（帶入 Phase 1）**

- 加入 three / @react-three/fiber / drei / zustand
- `RenderConfig`、辦公室場景、保底人形、固定展示相機、截圖基準
