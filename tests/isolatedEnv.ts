import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Environment for launching the app under test without touching the developer's machine:
 * own userData, ~/.agentcubicle, ephemeral port, and a fake ~/.claude (settings + projects).
 */
export function isolatedEnv(extra: Record<string, string> = {}): Record<string, string> {
  const root = mkdtempSync(join(tmpdir(), 'cubicle-test-'))
  const projects = join(root, 'claude', 'projects')
  mkdirSync(projects, { recursive: true })
  return {
    ...(process.env as Record<string, string>),
    CUBICLE_USER_DATA: join(root, 'userData'),
    CUBICLE_HOME: join(root, 'agentcubicle'),
    CUBICLE_PORT: '0',
    CUBICLE_CLAUDE_SETTINGS: join(root, 'claude', 'settings.json'),
    CUBICLE_CLAUDE_PROJECTS: projects,
    CUBICLE_TRANSCRIPTS: 'off',
    // Test windows may be covered by other windows; don't let occlusion pause them.
    CUBICLE_KEEP_RENDERING: '1',
    ...extra,
  }
}
