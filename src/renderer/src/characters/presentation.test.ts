import { describe, expect, it } from 'vitest'
import { CHIBI_MANIFEST } from './manifest'
import { PLACES } from './places'
import { PRESENTATION, PRESENTATION_STATES, gestureFor, placeIdFor } from './presentation'

describe('presentation map', () => {
  it.each(PRESENTATION_STATES)('%s uses gesture-layer clips for every posture', (state) => {
    for (const posture of ['sit', 'sit_sofa', 'stand'] as const) {
      expect(CHIBI_MANIFEST.clips[gestureFor(state, posture)].layer).toBe('gesture')
    }
  })

  it.each(PRESENTATION_STATES)('%s resolves to a known place', (state) => {
    expect(PLACES[placeIdFor(state, 'desk-a', 'lounge')]).toBeDefined()
  })

  it('keeps "stay" states where the character already is', () => {
    expect(placeIdFor('COMPLETED', 'desk-a', 'terminal')).toBe('terminal')
    expect(PRESENTATION.STALE.place).toBe('stay')
  })
})
