// AgentCubicle simulator CLI.
//
//   pnpm sim list                                list scenarios
//   pnpm sim print <name> [--speed N]            print the timed events as NDJSON
//   pnpm sim post  <name> [--speed N]            play the scenario into the running app
//                                                (POST /api/event, using ~/.agentcubicle)
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { SCENARIOS, expandScenario, scenarioByName } from '../../packages/shared/src/sim/scenarios'

function usage(code = 1): never {
  console.error(
    'usage: sim list | sim print <scenario> [--speed N] | sim post <scenario> [--speed N]',
  )
  process.exit(code)
}

function connection(): { url: string; token: string } {
  const home = process.env['CUBICLE_HOME'] || join(homedir(), '.agentcubicle')
  try {
    const endpoint = JSON.parse(readFileSync(join(home, 'endpoint.json'), 'utf8')) as {
      eventUrl: string
    }
    const token = readFileSync(join(home, 'token'), 'utf8').trim()
    return { url: endpoint.eventUrl, token }
  } catch {
    console.error(`AgentCubicle connection info not found in ${home}. Is the app running?`)
    process.exit(1)
  }
}

async function post(name: string, speed: number): Promise<void> {
  const scenario = scenarioByName(name)!
  const { url, token } = connection()
  const timeline = expandScenario(scenario, {
    runId: Date.now().toString(36),
    startTime: Date.now(),
    speed,
  })
  const start = Date.now()
  for (const { at, event } of timeline) {
    const wait = start + at - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    // Re-stamp with the real send time so the app's ordering matches what you watch.
    const body = JSON.stringify({ ...event, timestamp: Date.now() })
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body,
    }).catch((err: Error) => {
      console.error(`POST failed: ${err.message}`)
      process.exit(1)
    })
    const { outcome } = (await res.json()) as { outcome?: string }
    console.log(
      `${(at / 1000).toFixed(1).padStart(5)}s  ${event.type.padEnd(18)} ${res.status} ${outcome ?? ''}`,
    )
  }
}

const [cmd, name, ...rest] = process.argv.slice(2)
const i = rest.indexOf('--speed')
const speed = i >= 0 ? Number(rest[i + 1]) : 1
if (!Number.isFinite(speed) || speed <= 0) usage()

if (cmd === 'list') {
  for (const s of SCENARIOS) console.log(`${s.name.padEnd(18)} ${s.description}`)
} else if (cmd === 'print' || cmd === 'post') {
  const scenario = name ? scenarioByName(name) : undefined
  if (!scenario) {
    console.error(`unknown scenario "${name ?? ''}". Try: sim list`)
    process.exit(1)
  }
  if (cmd === 'print') {
    const timeline = expandScenario(scenario, {
      runId: Date.now().toString(36),
      startTime: Date.now(),
      speed,
    })
    for (const line of timeline) console.log(JSON.stringify(line))
  } else {
    await post(scenario.name, speed)
  }
} else {
  usage(cmd === undefined || cmd === '--help' ? 0 : 1)
}
