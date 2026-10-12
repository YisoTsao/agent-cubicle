# AgentCubicle 使用說明手冊

AgentCubicle 是一個在 macOS 上執行的桌面 App，會把本機 AI Agent（例如 Claude Code、VS Code Copilot Chat）的工作狀態，顯示成一間等角視角的小辦公室。讀檔時角色翻書、寫程式時打字、跑指令時走到終端機、等你批准時舉手、完成時歡呼、出錯時抓頭。

- **只觀察、不控制**：不會批准、阻擋或修改任何 agent 的行為。
- **隱私**：不讀取或轉送 prompt 與檔案內容；名牌上的路徑只顯示檔名。所有資料留在本機。

---

## 第一部分：在新的 Mac 上建置並安裝

本節以 Apple Silicon（arm64）Mac、macOS 15 為例，已在這台機器實際跑過（安裝、型別檢查、348 個單元測試、打包、打包版 smoke test 全部通過）。Intel Mac 的步驟相同，只是打包時改用 `--x64`。

### 1. 準備環境

| 需要          | 版本 / 說明                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------- |
| Node.js       | **22**（專案在 Node 12 下會失敗，請務必確認 `node -v` 是 v22.x）                            |
| pnpm          | **12.8.1**（由 `package.json` 的 `packageManager` 指定）                                    |
| Git           | 取得原始碼用                                                                                |

建議用 nvm 安裝 Node 22：

```sh
nvm install 22
nvm use 22
node -v        # 應顯示 v22.x
```

> **常見問題**：如果 `which -a node` 第一個是很舊的 Node（例如 v12），`pnpm install` 最後一步 `install-electron` 會失敗，並出現 `Cannot find module '@electron/get'`。把 Node 22 放到 PATH 最前面即可。

### 2. 取得原始碼並安裝依賴

```sh
git clone <專案網址> agent-cubicle
cd agent-cubicle
npx -y pnpm@12.8.1 install
```

安裝過程會自動下載 Electron，耗時數分鐘。

> **常見問題**：若全域的 `pnpm` 指令在切換版本時報 `Failed to switch pnpm to v12.8.1`，代表全域 pnpm 的快取損壞。改用上面的 `npx -y pnpm@12.8.1` 即可，不需要修全域安裝。若仍遇到，於指令前加上 `npm_config_manage_package_manager_versions=false`。

### 3. 產生 App（DMG / ZIP）

沒有 Apple Developer ID 憑證時，請關閉自動尋找簽章身分（會產出未簽章版）：

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false npx -y pnpm@12.8.1 dist:mac -- --arm64   # Apple Silicon
CSC_IDENTITY_AUTO_DISCOVERY=false npx -y pnpm@12.8.1 dist:mac -- --x64     # Intel
```

完成後 `dist/` 會有：

| 檔案                                   | 用途                                 |
| -------------------------------------- | ------------------------------------ |
| `AgentCubicle-0.0.1-arm64.dmg`         | 安裝磁碟映像（拖進「應用程式」）     |
| `AgentCubicle-0.0.1-arm64-mac.zip`     | 壓縮版                               |
| `dist/mac-arm64/AgentCubicle.app`      | 直接可執行的 App                     |

### 4. 安裝到「應用程式」

方法 A：打開 `.dmg`，把 **AgentCubicle** 拖進「應用程式」。

方法 B（終端機）：

```sh
ditto dist/mac-arm64/AgentCubicle.app /Applications/AgentCubicle.app
```

第一次開啟：

1. 在「應用程式」中對 AgentCubicle **按右鍵 → 「打開」→「打開」**（未簽章版只需要做一次）。
2. 若從網路下載後出現「已損毀，無法打開」，移除隔離標記：

```sh
xattr -cr /Applications/AgentCubicle.app
```

> 在自己這台機器上建置的 App 沒有隔離標記，通常可以直接打開。

### 5. （可選）驗證

```sh
npx -y pnpm@12.8.1 test              # 單元測試
npx -y pnpm@12.8.1 typecheck         # 型別檢查
npx -y pnpm@12.8.1 dist:dir && npx -y pnpm@12.8.1 test:packaged   # 打包版啟動測試
```

---

## 第二部分：開始使用

### 1. 開啟 App

從「應用程式」或 Launchpad 開啟 AgentCubicle。辦公室會出現在視窗中，目前沒有 agent 時，角色會坐在沙發上喝咖啡。

### 2. 連接 Claude Code

1. 點右下角「**設定**」，打開「**設定與連接**」面板。
2. 捲到「**Claude Code**」區，按「**連接 Claude Code…**」。
3. 檢查畫面上 `~/.claude/settings.json` 的差異。只會新增標有 `agentcubicle-hook` 的觀察用 hooks，並且只讀取事件，不會阻擋或控制 Claude。
4. 確認無誤後按「**確認套用**」。原檔會先備份為 `settings.json.agentcubicle-backup-<時間>`。
5. 之後開啟的 Claude Code session 都會出現在辦公室裡。

要移除：同一個地方按「**中斷連接…**」。

> 沒有安裝 hooks 時，AgentCubicle 會讀取 `~/.claude/projects/` 下的紀錄檔推估活動，較不精準，也**無法**偵測「等待批准」。

### 3. 連接 VS Code Copilot Chat

不需要設定。只要本機有 VS Code（穩定版或 Insiders），AgentCubicle 會**唯讀**監看 Copilot Chat 的聊天紀錄，每個聊天顯示成一個 agent，名牌是「GitHub Copilot · 工作區資料夾名」。

- 只取工具種類與檔名；你的提問、Copilot 的回答與終端機指令都不會讀取或顯示。
- 只追蹤 App 啟動後新增的內容。
- 這是 Copilot 未公開的紀錄格式，VS Code 或擴充更新後可能失效。

「設定與連接」面板的「**VS Code Copilot Chat（唯讀）**」區會顯示目前監看幾個聊天檔、轉成幾個事件。

### 4. 其他 Agent（Webhook）

自製或其他 agent 可以用 HTTP POST 把事件送到本機伺服器。「設定與連接」面板的「**其他 Agent（Webhook）**」區會顯示事件網址；Token 位於 `~/.agentcubicle/token`，以 `Authorization: Bearer` 傳送。範例請見 `docs/INTEGRATIONS.md`。

### 5. 看懂角色的動作

| 狀態         | 角色動作       | 提示                 |
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

---

## 第三部分：設定面板（「設定與連接」）

| 區塊                       | 可以做什麼                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| **顯示**                   | 畫質選「高 / 平衡 / 省電」；勾選「視窗永遠置頂」。省電會關閉環境光遮蔽與光暈，限制在 30 FPS。視窗最小化或被遮住時一律暫停繪製。 |
| **場景**                   | 切換整個辦公室風格：溫暖辦公室（預設）、夜晚小屋、駭客基地、太空站。只改佈置與燈光，角色動線不變。         |
| **辦公室**                 | 選 **2 / 4 / 6 張桌子**（預設 2 張）。桌子越多，房間往前延伸，同時能坐在桌前的 agent 越多，超過的會到等待區。 |
| **視角**                   | 「固定等角」（預設）或「自由旋轉」。自由旋轉時：左鍵拖曳轉動、滾輪縮放；按「重設視角」或切回固定等角回到預設畫面。 |
| **角色**                   | 選擇角色外觀：預設組合、上班族、You never know（黃色小鴨）、Kuro（黑色兔耳）、Naughty（紅色小熊）、Nicky（藍色貓咪）、Belle（粉紅長毛）、John（奶油色狗）、自動。只改外觀，狀態與動作相同。 |
| **本機事件伺服器**         | 顯示伺服器是否「監聽中 127.0.0.1:埠號」。                                                               |
| **Claude Code**            | 連接或中斷 hooks（見第二部分第 2 節）。                                                                 |
| **Claude Code 紀錄檔（輔助）** | 顯示正在監看幾個 session。                                                                          |
| **VS Code Copilot Chat（唯讀）** | 顯示監看的聊天檔數量與事件數。                                                                    |
| **其他 Agent（Webhook）**  | 顯示 webhook 網址與 Token 位置。                                                                        |

### 指定單一座位的角色

直接**點場景裡的角色**，底部會彈出選單，選一個角色就套用到它的座位；選「預設」就取消指定，回到「角色」區的選擇。指定會存進 `settings.json`，重開 App 仍然保留。

---

## 第四部分：多個 agent 同時工作

- 每個 session 一個角色。辦公桌數量依「辦公室」設定（預設兩張）；桌子不夠時，多出的 agent 會使用共用的終端機與沙發，或在等待區。
- 超過容量時，畫面會顯示「+N」。
- 若某個 agent 很久沒有消息，角色會停在原地並顯示「？」，AgentCubicle 不會假裝它已完成。

---

## 第五部分：疑難排解

| 狀況                            | 處理                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 「Port 9876 is already in use」 | 關掉另一個 AgentCubicle，或用環境變數 `CUBICLE_PORT` 指定其他埠（hooks 會自動跟著新埠，不需重裝）。    |
| 連接後角色沒反應                | 在「設定與連接」確認「最近事件」時間；若一直沒有事件，重新開一個 Claude Code session 再試。             |
| 「已損毀，無法打開」            | 執行 `xattr -cr /Applications/AgentCubicle.app`。                                                       |
| 第一次打開被擋                  | 對 App 按右鍵 →「打開」→「打開」。                                                                      |
| `pnpm install` 在 electron 步驟失敗 | 確認 `node -v` 是 v22（見第一部分第 1 節）。                                                       |
| settings.json 格式錯誤          | AgentCubicle 不會覆寫無法解析的檔案；修正後再試。                                                       |
| 想完全移除                      | 先在「設定與連接」按「中斷連接…」，再刪除 `/Applications/AgentCubicle.app` 與 `~/.agentcubicle`。        |

---

## 附錄：資料位置

| 項目                        | 位置                                              |
| --------------------------- | ------------------------------------------------- |
| App 設定                    | `~/.agentcubicle/`（含 `token`）                   |
| Claude Code 設定與備份      | `~/.claude/settings.json`、`settings.json.agentcubicle-backup-<時間>` |
| Copilot Chat 紀錄（唯讀）   | `~/Library/Application Support/Code/User/`        |
| 建置產物                    | 專案的 `dist/`（可隨時刪除重建）                  |

有興趣的開發細節請見 `README.md`、`docs/SPEC.md` 與 `docs/PROGRESS.md`。
