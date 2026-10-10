import type { ToolKind } from '@shared/events'

// Claude Code tool name → activity kind, and a short, privacy-safe detail for the name tag.
// Shared by the hook adapter and the transcript (JSONL) adapter.

const KIND: Record<string, ToolKind> = {
  Read: 'READ',
  NotebookRead: 'READ',
  Grep: 'SEARCH',
  Glob: 'SEARCH',
  LS: 'SEARCH',
  WebSearch: 'SEARCH',
  WebFetch: 'SEARCH',
  ToolSearch: 'SEARCH',
  Edit: 'WRITE',
  MultiEdit: 'WRITE',
  Write: 'WRITE',
  NotebookEdit: 'WRITE',
  Bash: 'EXEC',
  BashOutput: 'EXEC',
  KillShell: 'EXEC',
  KillBash: 'EXEC',
  PowerShell: 'EXEC',
  Monitor: 'EXEC',
}

export function toolKind(toolName: string): ToolKind {
  return KIND[toolName] ?? 'OTHER'
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined

/**
 * The most useful one-line description of a tool call. Never includes file contents or prompts;
 * paths are reduced to basenames later by the hub (SPEC §8).
 */
export function toolDetail(toolName: string, input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined
  const i = input as Record<string, unknown>
  const raw =
    str(i['file_path']) ??
    str(i['notebook_path']) ??
    str(i['path']) ??
    str(i['pattern']) ??
    str(i['query']) ??
    str(i['url']) ??
    (toolName === 'Bash' || toolName === 'PowerShell' ? firstLine(str(i['command'])) : undefined) ??
    str(i['description'])
  return raw?.slice(0, 120)
}

function firstLine(s: string | undefined): string | undefined {
  return s?.split('\n')[0]?.trim() || undefined
}

/** "Claude Code · project" — tells parallel sessions apart on the name tag. */
export function claudeAgentName(cwd: unknown): string {
  const project = typeof cwd === 'string' ? cwd.split(/[\\/]/).filter(Boolean).at(-1) : undefined
  return (project ? `Claude Code · ${project}` : 'Claude Code').slice(0, 64)
}
