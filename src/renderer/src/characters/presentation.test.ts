import { describe, expect, it } from 'vitest'
import { CHIBI_MANIFEST } from './manifest'
import { PLACES, PLACE_GROUPS } from './places'
import { PRESENTATION, PRESENTATION_STATES, gestureFor, placeIdFor } from './presentation'

describe('presentation map', () => {
  it.each(PRESENTATION_STATES)('%s uses gesture-layer clips for every posture', (state) => {
    for (const posture of ['sit', 'sit_sofa', 'stand'] as const) {
      expect(CHIBI_MANIFEST.clips[gestureFor(state, posture)].layer).toBe('gesture')
    }
  })

  it.each(PRESENTATION_STATES)('%s resolves to a known place', (state) => {
    const target = placeIdFor(state, 'desk-a', 'lounge:0')
    expect(PLACE_GROUPS[target] ?? PLACES[target]).toBeDefined()
  })

  it('keeps completed agents in place and sends stale agents to the lounge', () => {
    expect(placeIdFor('COMPLETED', 'desk-a', 'terminal:1')).toBe('terminal:1')
    expect(placeIdFor('STALE', 'desk-a', 'desk-a')).toBe('lounge')
    expect(PRESENTATION.STALE.place).toBe('lounge')
  })
})
