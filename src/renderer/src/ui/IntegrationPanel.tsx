import { useCallback, useEffect, useState } from 'react'
import type { HookPlanView, IntegrationStatus } from '@shared/ipc'
import type { QualityLevel } from '../config/render'
import { useSettings } from '../store/settings'

// "連接" panel (SPEC §5): server status, Claude Code hook install/uninstall with a mandatory
// diff preview, transcript watcher status and webhook details for custom agents.

function ago(ts: number): string {
  if (!ts) return '尚未收到'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return `${s} 秒前`
  if (s < 3600) return `${Math.round(s / 60)} 分鐘前`
  return `${Math.round(s / 3600)} 小時前`
}

export function IntegrationPanel({ onClose }: { onClose(): void }) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [plan, setPlan] = useState<HookPlanView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    window.cubicle.integration.status().then(setStatus, (e: unknown) => setError(String(e)))
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [refresh])

  const preview = async (action: 'install' | 'uninstall') => {
    setError(null)
    try {
      setPlan(await window.cubicle.integration.planHooks(action))
    } catch (e) {
      setError(messageOf(e))
    }
  }

  const apply = async () => {
    if (!plan) return
    setBusy(true)
    setError(null)
    try {
      setStatus(await window.cubicle.integration.applyHooks(plan.planId))
      setPlan(null)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  const server = status?.server
  const hooks = status?.hooks
  const quality = useSettings((s) => s.quality)
  const setQuality = useSettings((s) => s.setQuality)
  const alwaysOnTop = useSettings((s) => s.alwaysOnTop)
  const setAlwaysOnTop = useSettings((s) => s.setAlwaysOnTop)

  return (
    <div className="panel" role="dialog" aria-label="設定與連接" data-testid="integration-panel">
      <div className="panel__header">
        <span>設定與連接</span>
        <button className="panel__close" onClick={onClose} aria-label="關閉">
          ×
        </button>
      </div>

      <section>
        <h3>顯示</h3>
        <div className="row" role="radiogroup" aria-label="畫質">
          {QUALITY_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={quality === value}
              className={quality === value ? 'primary' : ''}
              onClick={() => setQuality(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted small">
          省電會關閉環境光遮蔽與光暈，並限制在 30 FPS；視窗看不到時一律暫停繪製。
        </p>
        <label className="small">
          <input
            type="checkbox"
            checked={alwaysOnTop}
            onChange={(e) => setAlwaysOnTop(e.target.checked)}
          />{' '}
          視窗永遠置頂
        </label>
      </section>

      <section>
        <h3>本機事件伺服器</h3>
        {server?.state === 'listening' && (
          <p>
            <span className="dot dot--ok" /> 監聽中 <code>127.0.0.1:{server.port}</code>
          </p>
        )}
        {server?.state === 'error' && (
          <p>
            <span className="dot dot--err" /> {server.message}
          </p>
        )}
        {server?.state === 'stopped' && <p className="muted">未啟動</p>}
      </section>

      <section>
        <h3>Claude Code</h3>
        {hooks && (
          <>
            <p>
              <span className={`dot ${hooks.installed ? 'dot--ok' : 'dot--off'}`} />{' '}
              {hooks.installed ? '已連接（hooks）' : '未連接'}
              {hooks.installed && (
                <span className="muted"> · 最近事件：{ago(hooks.lastEventAt)}</span>
              )}
            </p>
            <p className="muted small">設定檔：{hooks.path}</p>
            {hooks.error && <p className="error">{hooks.error}</p>}
            {!plan && (
              <button
                data-testid="hooks-toggle"
                onClick={() => void preview(hooks.installed ? 'uninstall' : 'install')}
              >
                {hooks.installed ? '中斷連接…' : '連接 Claude Code…'}
              </button>
            )}
          </>
        )}
        {plan && (
          <div className="plan" data-testid="hook-plan">
            <p>
              {plan.action === 'install'
                ? '將在上述設定檔加入以下觀察用 hooks（只讀取事件，不會阻擋或控制 Claude）：'
                : '將從上述設定檔移除 AgentCubicle 的 hooks：'}
              {!plan.fileExists && '（檔案不存在，將會建立）'}
            </p>
            <pre className="diff" data-testid="hook-diff">
              {plan.diff.split('\n').map((line, i) => (
                <span
                  key={i}
                  className={line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : ''}
                >
                  {line}
                  {'\n'}
                </span>
              ))}
            </pre>
            <p className="muted small">
              會先備份原檔（.agentcubicle-backup-時間戳），寫入前再次確認檔案沒有被修改。
            </p>
            <div className="row">
              <button
                className="primary"
                disabled={busy || plan.noop}
                onClick={() => void apply()}
                data-testid="hook-apply"
              >
                {plan.noop ? '沒有變更' : '確認套用'}
              </button>
              <button onClick={() => setPlan(null)}>取消</button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3>Claude Code 紀錄檔（輔助）</h3>
        {status && (
          <p>
            <span className={`dot ${status.transcripts.enabled ? 'dot--ok' : 'dot--off'}`} />{' '}
            {status.transcripts.enabled ? `監看 ${status.transcripts.files} 個 session` : '已停用'}
            <span className="muted small"> · {status.transcripts.root}</span>
          </p>
        )}
        <p className="muted small">
          未安裝 hooks 時，從 JSONL 紀錄推估工具使用；已透過 hooks 回報的 session 會以 hooks 為準。
        </p>
      </section>

      <section>
        <h3>其他 Agent（Webhook）</h3>
        {server?.state === 'listening' && (
          <p className="small">
            <code>POST {server.eventUrl}</code>
            <br />
            <span className="muted">
              Token：~/.agentcubicle/token（Authorization: Bearer）。範例見 docs/INTEGRATIONS.md
            </span>
          </p>
        )}
      </section>

      {error && <p className="error">{error}</p>}
    </div>
  )
}

const QUALITY_OPTIONS: [QualityLevel, string][] = [
  ['high', '高'],
  ['balanced', '平衡'],
  ['low', '省電'],
]

function messageOf(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  // Electron prefixes IPC errors with "Error invoking remote method '…': Error: "
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
