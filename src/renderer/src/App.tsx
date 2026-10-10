import { useEffect, useState } from 'react'
import type { PingResult } from '@shared/ipc'

type PingState =
  | { status: 'pending' }
  | { status: 'ok'; result: PingResult }
  | { status: 'error'; message: string }

export function App() {
  const [ping, setPing] = useState<PingState>({ status: 'pending' })

  useEffect(() => {
    window.cubicle
      .ping()
      .then((result) => setPing({ status: 'ok', result }))
      .catch((err: unknown) => setPing({ status: 'error', message: String(err) }))
  }, [])

  return (
    <main className="shell">
      <h1>AgentCubicle</h1>
      <p className="subtitle">Phase 0 skeleton — 3D scene arrives in Phase 1.</p>
      <p data-testid="ipc-status">
        {ping.status === 'pending' && 'IPC: connecting…'}
        {ping.status === 'ok' && `IPC: pong (v${ping.result.appVersion})`}
        {ping.status === 'error' && `IPC: error — ${ping.message}`}
      </p>
    </main>
  )
}
