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
 * The one-line description shown on the name tag: a file or folder name, nothing else. Commands,
 * search patterns, URLs and task descriptions are terminal-like text that clutters the tag (and
 * may hold secrets), so they are never shown. Paths are reduced to basenames later by the hub
 * (SPEC §8); file contents and prompts are never read.
 */
export function toolDetail(_toolName: string, input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined
  const i = input as Record<string, unknown>
  return (str(i['file_path']) ?? str(i['notebook_path']) ?? str(i['path']))?.slice(0, 120)
}

/** "Claude Code · project" — tells parallel sessions apart on the name tag. */
export function claudeAgentName(cwd: unknown): string {
  const project = typeof cwd === 'string' ? cwd.split(/[\\/]/).filter(Boolean).at(-1) : undefined
  return (project ? `Claude Code · ${project}` : 'Claude Code').slice(0, 64)
}
