import { PLACES, PLACE_GROUPS, type Place } from './places'

// Who occupies which slot. Characters claim a slot when they commit to a place and release it
// when they leave or unmount, so shared spots are never double-booked.

const owner = new Map<string, string>() // slotId → agentId

/**
 * Resolve a place *group* (or slot id) to a concrete slot for `agentId`. Keeps the agent's
 * current slot if it is already in that group. Returns null when every slot is taken.
 */
export function claimSlot(
  agentId: string,
  groupOrSlot: string,
  currentSlot: string | null,
): Place | null {
  const slots = PLACE_GROUPS[groupOrSlot] ?? (PLACES[groupOrSlot] ? [groupOrSlot] : [])
  if (currentSlot && slots.includes(currentSlot) && owner.get(currentSlot) === agentId)
    return PLACES[currentSlot]!
  const free = slots.find((id) => !owner.has(id) || owner.get(id) === agentId)
  if (!free) return null
  if (currentSlot && currentSlot !== free) releaseSlot(agentId, currentSlot)
  owner.set(free, agentId)
  return PLACES[free]!
}

export function releaseSlot(agentId: string, slotId: string | null): void {
  if (slotId && owner.get(slotId) === agentId) owner.delete(slotId)
}

export function releaseAll(agentId: string): void {
  for (const [slot, who] of owner) if (who === agentId) owner.delete(slot)
}

/** Test helper. */
export function resetPlaceBook(): void {
  owner.clear()
}
