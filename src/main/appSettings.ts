import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

// User preferences persisted in userData/settings.json (SPEC §8). Invalid or missing files fall
// back to defaults field by field; writes are debounced so dragging the window is cheap.

const Bounds = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().min(320).max(16384),
  height: z.number().int().min(240).max(16384),
})

export const AppSettingsSchema = z.object({
  quality: z.enum(['high', 'balanced', 'low']).catch('balanced'),
  alwaysOnTop: z.boolean().catch(false),
  bounds: Bounds.optional().catch(undefined),
})

export type AppSettings = z.infer<typeof AppSettingsSchema>

/** What the renderer may change. */
export const SettingsPatch = z
  .object({ quality: z.enum(['high', 'balanced', 'low']), alwaysOnTop: z.boolean() })
  .partial()
  .strict()

export class SettingsStore {
  private data: AppSettings
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly path = join(app.getPath('userData'), 'settings.json')

  constructor() {
    let raw: unknown = {}
    try {
      raw = JSON.parse(readFileSync(this.path, 'utf8'))
    } catch {
      // first run or unreadable: defaults
    }
    this.data = AppSettingsSchema.parse(raw && typeof raw === 'object' ? raw : {})
  }

  get(): AppSettings {
    return { ...this.data }
  }

  update(patch: { [K in keyof AppSettings]?: AppSettings[K] | undefined }): AppSettings {
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
    this.data = AppSettingsSchema.parse({ ...this.data, ...defined })
    this.scheduleWrite()
    return this.get()
  }

  /** Write immediately (on quit). */
  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    try {
      writeFileSync(this.path, JSON.stringify(this.data, null, 2) + '\n')
    } catch (err) {
      console.error('[settings] write failed', err)
    }
  }

  private scheduleWrite(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 400)
  }
}
