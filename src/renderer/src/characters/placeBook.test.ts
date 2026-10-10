import { beforeEach, describe, expect, it } from 'vitest'
import { claimSlot, releaseAll, resetPlaceBook } from './placeBook'

beforeEach(resetPlaceBook)

describe('placeBook', () => {
  it('gives two agents different terminal slots and refuses a third', () => {
    expect(claimSlot('a', 'terminal', null)?.id).toBe('terminal:0')
    expect(claimSlot('b', 'terminal', null)?.id).toBe('terminal:1')
    expect(claimSlot('c', 'terminal', null)).toBeNull()
  })

  it('keeps an agent in its current slot of the same group', () => {
    claimSlot('a', 'lounge', null)
    claimSlot('b', 'lounge', null)
    expect(claimSlot('b', 'lounge', 'lounge:1')?.id).toBe('lounge:1')
  })

  it('frees the old slot when moving and on releaseAll', () => {
    claimSlot('a', 'terminal', null)
    expect(claimSlot('a', 'lounge', 'terminal:0')?.id).toBe('lounge:0')
    expect(claimSlot('b', 'terminal', null)?.id).toBe('terminal:0')
    releaseAll('b')
    expect(claimSlot('c', 'terminal', null)?.id).toBe('terminal:0')
  })

  it('treats desks as single-slot groups', () => {
    expect(claimSlot('a', 'desk-a', null)?.id).toBe('desk-a')
    expect(claimSlot('b', 'desk-a', null)).toBeNull()
  })
})
