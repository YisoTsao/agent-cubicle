// AgentCubicle simulator CLI.
//
//   pnpm sim list                         list scenarios
//   pnpm sim print <name> [--speed N]     print the timed events as NDJSON ({ at, event } per line)
//
// Phase 4 adds `--post` to deliver events to the app's local webhook (POST /api/event).
import { SCENARIOS, expandScenario, scenarioByName } from '../../packages/shared/src/sim/scenarios'

function usage(code = 1): never {
  console.error('usage: sim list | sim print <scenario> [--speed N]')
  process.exit(code)
}

const [cmd, name, ...rest] = process.argv.slice(2)

if (cmd === 'list') {
  for (const s of SCENARIOS) console.log(`${s.name.padEnd(18)} ${s.description}`)
} else if (cmd === 'print') {
  const scenario = name ? scenarioByName(name) : undefined
  if (!scenario) {
    console.error(`unknown scenario "${name ?? ''}". Try: sim list`)
    process.exit(1)
  }
  const i = rest.indexOf('--speed')
  const speed = i >= 0 ? Number(rest[i + 1]) : 1
  if (!Number.isFinite(speed) || speed <= 0) usage()
  const timeline = expandScenario(scenario, {
    runId: Date.now().toString(36),
    startTime: Date.now(),
    speed,
  })
  for (const line of timeline) console.log(JSON.stringify(line))
} else {
  usage(cmd === undefined || cmd === '--help' ? 0 : 1)
}
