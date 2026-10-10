# 連接 AI Agent

AgentCubicle 只「觀察」agent，不會控制、批准或阻擋任何動作。所有來源最後都會轉成同一種事件
（`AgentEvent`，定義在 `packages/shared/src/events.ts`），交給狀態機處理。

| 來源                        | 精準度                                      | 設定                               |
| --------------------------- | ------------------------------------------- | ---------------------------------- |
| Claude Code hooks           | 最高（即時、有順序、含等待批准）            | App 右下「連接」→ 連接 Claude Code |
| Claude Code 紀錄檔（JSONL） | 輔助（工具開始/結束、回合結束；無等待批准） | 自動，無需設定                     |
| Webhook                     | 依送出端而定                                | `POST /api/event`                  |

## Claude Code（hooks）

按下「連接 Claude Code…」後，App 會先顯示 `~/.claude/settings.json` 的完整 diff，確認後才寫入，並先備份原檔。
加入的是**同步的 command hook**：

```sh
curl -s -o /dev/null --connect-timeout 0.3 -m 0.5 -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $(cat '~/.agentcubicle/token')" --data-binary @- "$(cat '~/.agentcubicle/hook-url')" \
  >/dev/null 2>&1; exit 0 # agentcubicle-hook
```

- 永遠 `exit 0` 且沒有輸出 → Claude Code 視為「沒有決定」，**不會被阻擋或改變行為**。
- App 沒開時 curl 立即失敗、靜默結束，不會出現 hook error。
- 用同步而不是 `async`：hooks 依序執行，事件順序有保證（async hook 各自是背景程序，可能顛倒）。
- 每次多約數毫秒延遲（本機連線）。
- 訂閱事件：`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PermissionRequest`、`PostToolUse`、
  `PostToolUseFailure`、`Notification(permission_prompt)`、`Stop`、`StopFailure`、`SessionEnd`。
- **不會**轉送 prompt 文字、檔案內容；路徑只保留檔名。

移除：同一個按鈕「中斷連接…」，一樣先看 diff。

## Webhook（其他 agent）

連線資訊：`~/.agentcubicle/endpoint.json`（`eventUrl`）與 `~/.agentcubicle/token`（僅本人可讀）。

```sh
TOKEN=$(cat ~/.agentcubicle/token)
URL=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.agentcubicle/endpoint.json")))["eventUrl"])')

curl -X POST "$URL" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "eventId": "my-agent-0001",
  "agentId": "my-agent",
  "agentName": "My Agent",
  "sessionId": "run-42",
  "type": "TOOL_STARTED",
  "toolName": "write_file",
  "toolKind": "WRITE",
  "detail": "src/app.py",
  "timestamp": '"$(date +%s000)"',
  "source": "webhook"
}'
```

Python：

```python
import json, os, time, urllib.request, uuid

home = os.path.expanduser("~/.agentcubicle")
url = json.load(open(f"{home}/endpoint.json"))["eventUrl"]
token = open(f"{home}/token").read().strip()

def emit(type, **extra):
    event = {"eventId": str(uuid.uuid4()), "agentId": "my-agent", "agentName": "My Agent",
             "sessionId": "run-42", "type": type, "timestamp": int(time.time() * 1000),
             "source": "webhook", **extra}
    req = urllib.request.Request(url, json.dumps(event).encode(), method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    try:
        urllib.request.urlopen(req, timeout=0.5)
    except OSError:
        pass  # app not running: never let visualization break your agent

emit("TASK_STARTED")
emit("TOOL_STARTED", toolName="run_tests", toolKind="EXEC", detail="pytest")
emit("TOOL_COMPLETED", toolName="run_tests", toolKind="EXEC", success=True)
emit("TASK_COMPLETED")
```

事件類型：`SESSION_STARTED`、`TASK_STARTED`、`TOOL_STARTED`、`TOOL_COMPLETED`、`APPROVAL_REQUIRED`、
`TASK_COMPLETED`、`TASK_FAILED`、`SESSION_ENDED`、`HEARTBEAT`。`toolKind`：`READ`、`SEARCH`、`WRITE`、`EXEC`、`OTHER`。
可選 `sequence`（每個 session 遞增）以處理亂序。90 秒沒有事件會顯示「?」（STALE），長任務請送 `HEARTBEAT`。

回應：`202 applied`、`200 duplicate|out-of-order`、`400 invalid`、`401` token 錯誤、`413` 超過 16 KB、`429` 太頻繁。

## 安全

- 只綁定 `127.0.0.1`，並檢查連線來源。
- 需要 Bearer token（首次啟動隨機產生 256-bit，存在 `~/.agentcubicle/token`，權限 600）。
- 帶 `Origin` 標頭的請求（瀏覽器網頁）一律拒絕；`Host` 必須是 `127.0.0.1` / `localhost`（防 DNS rebinding）。
- 只接受 `application/json`，有大小與頻率限制。伺服器只接受「觀察事件」，不提供任何讀檔或執行功能。

## 模擬器

```sh
pnpm sim list
pnpm sim post normal-task --speed 2   # 推送到執行中的 App
```
