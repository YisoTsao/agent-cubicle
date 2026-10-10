// Soak test (SPEC §10 Phase 5): run the built app under continuous multi-agent load and check
// for memory / GPU resource growth and event build-up.
//
//   pnpm build && SOAK_MINUTES=30 pnpm soak
//
// Writes docs/soak/soak-<timestamp>.json and .md. Exit code 1 if a criterion fails.
import { _electron as electron } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isolatedEnv } from '../../tests/isolatedEnv'

const MINUTES = Number(process.env['SOAK_MINUTES'] ?? 30)
const SAMPLE_MS = 30_000
const WARMUP_MS = Math.min(120_000, (MINUTES * 60_000) / 5)
const ROOT = resolve(__dirname, '../..')

interface Sample {
  t: number
  mainHeapMB: number
  mainRssMB: number
  rendererHeapMB: number
  totalWorkingSetMB: number
  geometries: number
  textures: number
  programs: number
  fps: number
  drawCalls: number
  sessions: number
  characters: number
}

const mb = (b: number) => Math.round((b / 1024 / 1024) * 10) / 10
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)]! : 0
}

async function main() {
  const env = isolatedEnv({ CUBICLE_DIAGNOSTICS: '1', CUBICLE_QUALITY: 'balanced' })
  const app = await electron.launch({
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info', ROOT],
    env,
  })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as unknown as { __cubicleDev?: unknown }).__cubicleDev)
  const endpointFile = join(env['CUBICLE_HOME']!, 'endpoint.json')
  while (!existsSync(endpointFile)) await new Promise((r) => setTimeout(r, 100))
  const { eventUrl } = JSON.parse(readFileSync(endpointFile, 'utf8')) as { eventUrl: string }
  const token = readFileSync(join(env['CUBICLE_HOME']!, 'token'), 'utf8').trim()

  const start = Date.now()
  const end = start + MINUTES * 60_000
  let stop = false

  // Load 1: simulator scenarios back to back through the real hub.
  const scenarios = [
    'normal-task',
    'approval',
    'failure-recovery',
    'out-of-order',
    'disconnect',
    'multi-session',
  ]
  const scenarioLoop = (async () => {
    for (let i = 0; !stop; i++) {
      const r = await page.evaluate(
        (n) => window.cubicle.dev.runScenario(n, 3),
        scenarios[i % scenarios.length]!,
      )
      await new Promise((res) => setTimeout(res, r.durationMs + 4000))
    }
  })()

  // Load 2: three extra webhook agents doing random work (keeps 4+ characters busy).
  let seq = 0
  const kinds = ['READ', 'WRITE', 'EXEC', 'SEARCH'] as const
  const webhookLoop = (async () => {
    while (!stop) {
      const agent = `soak-${seq % 3}`
      const type = Math.random() < 0.5 ? 'TOOL_STARTED' : 'TOOL_COMPLETED'
      await fetch(eventUrl, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: `soak-${seq++}`,
          agentId: agent,
          agentName: `Soak ${agent}`,
          sessionId: agent,
          type,
          toolKind: kinds[seq % kinds.length],
          detail: `file-${seq % 50}.ts`,
          success: true,
          timestamp: Date.now(),
          source: 'webhook',
        }),
      }).catch(() => undefined)
      await new Promise((res) => setTimeout(res, 300))
    }
  })()

  // Load 3: periodic character respawn (full rig/mixer/prop lifecycle).
  const respawnLoop = setInterval(() => {
    void page.evaluate(() =>
      (window as unknown as { __cubicleDev: { respawn(): void } }).__cubicleDev.respawn(),
    )
  }, 5 * 60_000)

  const samples: Sample[] = []
  while (Date.now() < end) {
    await new Promise((res) => setTimeout(res, Math.min(SAMPLE_MS, end - Date.now())))
    const main = await app.evaluate(({ app }) => {
      ;(globalThis as unknown as { gc?: () => void }).gc?.()
      const m = process.memoryUsage()
      const ws = app.getAppMetrics().reduce((sum, p) => sum + p.memory.workingSetSize, 0) // KB
      return { heap: m.heapUsed, rss: m.rss, ws }
    })
    const r = await page.evaluate(async () => {
      ;(window as unknown as { gc?: () => void }).gc?.()
      const dev = (
        window as unknown as {
          __cubicleDev: { stats(): Record<string, number> | null; agents(): unknown[] }
        }
      ).__cubicleDev
      const snap = await window.cubicle.getSnapshot()
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      return {
        stats: dev.stats(),
        heap: mem?.usedJSHeapSize ?? 0,
        sessions: snap.sessions.length,
        characters: dev.agents().length,
      }
    })
    const s: Sample = {
      t: Math.round((Date.now() - start) / 1000),
      mainHeapMB: mb(main.heap),
      mainRssMB: mb(main.rss),
      rendererHeapMB: mb(r.heap),
      totalWorkingSetMB: Math.round(main.ws / 1024),
      geometries: r.stats?.['geometries'] ?? 0,
      textures: r.stats?.['textures'] ?? 0,
      programs: r.stats?.['programs'] ?? 0,
      fps: r.stats?.['fps'] ?? 0,
      drawCalls: r.stats?.['drawCalls'] ?? 0,
      sessions: r.sessions,
      characters: r.characters,
    }
    samples.push(s)
    console.log(JSON.stringify(s))
  }

  stop = true
  clearInterval(respawnLoop)
  await Promise.race([
    Promise.all([scenarioLoop, webhookLoop]),
    new Promise((r) => setTimeout(r, 3000)),
  ])
  await app.close()

  // Analysis: compare the steady state right after warm-up with the end of the run.
  const steady = samples.filter((s) => s.t * 1000 >= WARMUP_MS)
  const k = Math.max(1, Math.floor(steady.length / 5))
  const early = steady.slice(0, k)
  const late = steady.slice(-k)
  const growth = (f: (s: Sample) => number) => {
    const a = median(early.map(f))
    const b = median(late.map(f))
    return { early: a, late: b, pct: a ? Math.round(((b - a) / a) * 1000) / 10 : 0 }
  }
  const criteria = [
    { name: 'Main JS heap growth < 15%', ...growth((s) => s.mainHeapMB) },
    { name: 'Renderer JS heap growth < 15%', ...growth((s) => s.rendererHeapMB) },
    { name: 'GPU geometries do not grow', ...growth((s) => s.geometries) },
    { name: 'GPU textures do not grow', ...growth((s) => s.textures) },
    {
      name: 'Hub sessions stay bounded (≤ 8)',
      early: 0,
      late: Math.max(...samples.map((s) => s.sessions)),
      pct: 0,
    },
  ].map((c) => ({
    ...c,
    pass: c.name.startsWith('Hub')
      ? c.late <= 8
      : c.name.includes('GPU')
        ? c.late <= c.early
        : c.pct < 15,
  }))
  const fps = samples.map((s) => s.fps)
  const result = {
    date: new Date().toISOString(),
    minutes: MINUTES,
    platform: `${process.platform}-${process.arch}`,
    fps: { min: Math.min(...fps), median: median(fps) },
    maxCharacters: Math.max(...samples.map((s) => s.characters)),
    criteria,
    pass: criteria.every((c) => c.pass),
    samples,
  }
  const stamp = result.date.replace(/[:.]/g, '-').slice(0, 19)
  const out = join(ROOT, 'docs/soak', `soak-${stamp}`)
  writeFileSync(`${out}.json`, JSON.stringify(result, null, 2) + '\n')
  writeFileSync(
    `${out}.md`,
    [
      `# Soak test ${result.date}`,
      '',
      `- 時長：${MINUTES} 分鐘（${result.platform}，Balanced 畫質）`,
      `- 負載：6 個情境 3× 速輪播 + 3 個 webhook agent 每 300 ms 一個事件 + 每 5 分鐘 respawn`,
      `- 同時角色數最多：${result.maxCharacters}；FPS 中位數 ${result.fps.median}、最低 ${result.fps.min}`,
      `- 結果：**${result.pass ? 'PASS' : 'FAIL'}**`,
      '',
      '| 指標 | 暖機後 | 結束前 | 變化 | 結果 |',
      '| --- | --- | --- | --- | --- |',
      ...criteria.map(
        (c) => `| ${c.name} | ${c.early} | ${c.late} | ${c.pct}% | ${c.pass ? '✅' : '❌'} |`,
      ),
      '',
    ].join('\n'),
  )
  console.log(`\n${result.pass ? 'PASS' : 'FAIL'} — report: ${out}.md`)
  process.exit(result.pass ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
