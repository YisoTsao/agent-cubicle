import type { SessionState } from '@shared/events'
import type { PresentationState } from './presentation'
import { DEFAULT_STYLE, type ChibiStyle } from './rig/chibiRig'

// SessionState (presence + activity, from the main-process reducer) → what the character shows.

export function toPresentation(s: SessionState): PresentationState {
  switch (s.presence) {
    case 'ACTIVE':
      switch (s.activity) {
        case 'READ':
          return 'READ'
        case 'WRITE':
          return 'WRITE'
        case 'EXEC':
          return 'EXEC'
        case 'THINKING':
        case 'NONE':
          return 'THINKING'
      }
    // eslint-disable-next-line no-fallthrough -- inner switch is exhaustive
    case 'WAITING_APPROVAL':
      return 'WAITING_APPROVAL'
    case 'COMPLETED':
      return 'COMPLETED'
    case 'ERROR':
      return 'ERROR'
    case 'STALE':
      return 'STALE'
    case 'IDLE':
      return 'IDLE'
  }
}

// Agent identity → outfit. Styles are cached so a character's style object is stable across
// snapshots (a new object would rebuild its rig).
const KNOWN: Record<string, Partial<ChibiStyle>> = {
  'claude-code': { shirt: '#d4866a', hair: '#4a3328' },
  codex: { shirt: '#6b8f6a', hair: '#2f2b28' },
  copilot: { shirt: '#7d9bb8', hair: '#6b4a32' },
  aider: { shirt: '#e3b75a', hair: '#3b2a22' },
}
const SHIRTS = ['#d4866a', '#6b8f6a', '#7d9bb8', '#e3b75a', '#b07cc6', '#e8b4a6']
const HAIRS = ['#4a3328', '#2f2b28', '#6b4a32', '#8a5a3b']
const styles = new Map<string, ChibiStyle>()

export function styleFor(agentId: string): ChibiStyle {
  let style = styles.get(agentId)
  if (!style) {
    let h = 0
    for (const ch of agentId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    style = {
      ...DEFAULT_STYLE,
      shirt: SHIRTS[h % SHIRTS.length]!,
      hair: HAIRS[(h >>> 8) % HAIRS.length]!,
      ...KNOWN[agentId],
    }
    styles.set(agentId, style)
  }
  return style
}
