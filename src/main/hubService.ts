import { BrowserWindow } from 'electron'
import { EventHub, type HubConfig } from '@shared/hub'
import { IpcChannel, type StateSnapshot } from '@shared/ipc'
import { expandScenario, scenarioByName, scenarioDuration } from '@shared/sim/scenarios'

// Owns the authoritative EventHub in the main process (SPEC §3): real clock, periodic tick for
// timeouts, coalesced snapshot broadcast to renderers, and the dev-only scenario runner.

const TICK_MS = 500

export interface ScenarioRun {
  runId: string
  name: string
  durationMs: number
}

export class HubService {
  readonly hub: EventHub
  private seats = 2
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private broadcastQueued = false
  private simTimers: ReturnType<typeof setTimeout>[] = []
  private readonly unsubscribe: () => void

  constructor() {
    this.hub = new EventHub(Date.now, this.defaults)
    this.unsubscribe = this.hub.onChange(() => this.queueBroadcast())
  }

  /** Seats the hub assigns (the renderer's desk count). */
  private get defaults(): Partial<HubConfig> {
    return { seats: this.seats }
  }

  /** The office has this many desks now. */
  setSeats(seats: number): void {
    this.seats = seats
    this.hub.setSeats(seats)
  }

  start(): void {
    this.tickTimer ??= setInterval(() => {
      try {
        this.hub.tick()
      } catch (err) {
        console.error('[hub] tick failed', err)
      }
    }, TICK_MS)
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.tickTimer = null
    this.cancelSimulation()
    this.unsubscribe()
  }

  snapshot(): StateSnapshot {
    return this.hub.snapshot()
  }

  /** Dev: play a scenario into the hub (replaces any running one). */
  runScenario(name: string, speed = 1): ScenarioRun {
    const scenario = scenarioByName(name)
    if (!scenario) throw new Error(`Unknown scenario "${name}"`)
    this.cancelSimulation()
    this.hub.configure({ ...this.defaults, ...scenario.hubConfig })
    const runId = Date.now().toString(36)
    const timeline = expandScenario(scenario, { runId, startTime: Date.now(), speed })
    for (const { at, event } of timeline) {
      this.simTimers.push(setTimeout(() => this.hub.ingest(event), at))
    }
    return { runId, name, durationMs: scenarioDuration(scenario, speed) }
  }

  /** Dev: stop the simulator and clear every session. */
  reset(): void {
    this.cancelSimulation()
    this.hub.configure(this.defaults)
    this.hub.clear()
  }

  private cancelSimulation(): void {
    this.simTimers.forEach(clearTimeout)
    this.simTimers = []
  }

  /** Coalesce bursts of changes into one IPC message per macrotask. */
  private queueBroadcast(): void {
    if (this.broadcastQueued) return
    this.broadcastQueued = true
    setImmediate(() => {
      this.broadcastQueued = false
      const snapshot = this.snapshot()
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IpcChannel.StateChanged, snapshot)
      }
    })
  }
}
