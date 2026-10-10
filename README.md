# AgentCubicle

把本機 AI Agent（Claude Code、Codex CLI、Aider、自製 agent…）的工作狀態，變成一間溫暖的等角視角小辦公室：
讀檔時翻書、寫程式時打字、跑指令時走到終端機、等你批准時舉手、完成時歡呼、出錯時抓頭。

![多個 agent 同時工作](tests/visual/baseline/phase4-multi-agent.png)

- **只觀察、不控制**：不會批准、阻擋或修改任何 agent 的行為。
- **隱私**：不會讀取或轉送 prompt 與檔案內容；名牌上的路徑只顯示檔名。所有資料都留在本機。
- **多 agent**：每個 session 一個角色，兩張辦公桌、共用的終端機與沙發、等待區，再多就顯示「+N」。

## 安裝

到 Releases 下載對應平台的安裝檔（macOS `.dmg`、Windows `.exe`、Linux `.AppImage`），或自行建置：

```sh
pnpm install
pnpm dist        # 產出 dist/ 下的安裝檔（未簽章）
```

## 連接 Claude Code

1. 開啟 AgentCubicle，點右下角「**設定**」。
2. 在「Claude Code」區按「**連接 Claude Code…**」。
3. 檢查畫面上 `~/.claude/settings.json` 的差異（只會新增標有 `agentcubicle-hook` 的觀察用 hooks），按「**確認套用**」。
   原檔會先備份為 `settings.json.agentcubicle-backup-<時間>`。
4. 之後開的 Claude Code session 都會出現在辦公室裡。要移除：同一個地方按「中斷連接…」。

沒有安裝 hooks 時，AgentCubicle 也會讀取 `~/.claude/projects/` 下的紀錄檔推估活動（較不精準，沒有「等待批准」）。

其他 agent 請見 [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)（Webhook、curl / Python 範例）。

## 角色在做什麼？

| 狀態         | 角色           | 提示                 |
| ------------ | -------------- | -------------------- |
| 閒置         | 坐沙發喝咖啡   |                      |
| 思考（推定） | 托腮           | 淡色思考泡泡         |
| 讀檔 / 搜尋  | 在桌前看書     |                      |
| 寫檔         | 在桌前快速打字 | 螢幕亮起             |
| 執行指令     | 站在終端機前   | 程式碼捲動           |
| 等待批准     | 舉手揮動       | ⚠                    |
| 完成         | 歡呼           | ✓                    |
| 出錯         | 抓頭           | 紅色 ！、螢幕變紅    |
| 很久沒有消息 | 停在原地       | ？（不會假裝已完成） |

## 設定

「設定」面板可以調整畫質（高 / 平衡 / 省電）與視窗置頂。視窗最小化或被遮住時會自動暫停繪製；省電模式限制在 30 FPS。

## 疑難排解

| 狀況                            | 處理                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| 「Port 9876 is already in use」 | 關掉另一個 AgentCubicle，或用環境變數 `CUBICLE_PORT` 指定其他埠（hooks 會自動跟著新埠，不需重裝）。 |
| 連接後角色沒反應                | 在設定面板確認「最近事件」時間；若一直沒有事件，重新開一個 Claude Code session 再試。               |
| 想完全移除                      | 先在設定面板「中斷連接」，再刪除 App 與 `~/.agentcubicle`。                                         |
| settings.json 格式錯誤          | AgentCubicle 不會覆寫無法解析的檔案；修正後再試。                                                   |

## 開發

```sh
pnpm dev                                   # 開發模式
CUBICLE_DIAGNOSTICS=1 pnpm dev             # 顯示診斷與 Dev 面板（F3）
pnpm sim list / pnpm sim post normal-task  # 模擬器
pnpm test && pnpm test:e2e                 # 單元 + 端到端測試
pnpm screenshots                           # 固定視角截圖基準
pnpm dist:dir && pnpm test:packaged        # 打包版 smoke test
pnpm build && SOAK_MINUTES=30 pnpm soak    # 長時間穩定性測試
```

架構與規格：[docs/SPEC.md](docs/SPEC.md)；進度與量測：[docs/PROGRESS.md](docs/PROGRESS.md)。
