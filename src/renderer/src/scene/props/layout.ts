// Spots on the back wall that other modules (routes, collision data) need without pulling in
// the React scene code.

export const TERMINAL = {
  /** Standing spot at the left end of the console (world x, z); slot 1 is `slotGap` to its right. */
  stand: [0.6, -1.88] as const,
  /** Two agents stand side by side, wide enough for two plush figures (0.8 m). */
  slotGap: 0.8,
  /** The console is centred between the two slots and wide enough to hold both. */
  center: 1.0,
  width: 1.6,
  /** Legs sit at the ends and are shallow (against the wall) so reaching arms clear them. */
  legInset: 0.775,
}

export const COFFEE_BAR = {
  /** Standing spot in front of the coffee bar (world x, z). */
  stand: [-0.4, -1.95] as const,
}

/** How many desks the office has (the setting); 2 is the original room. */
export const DESK_COUNTS = [2, 4, 6] as const
export type DeskCount = (typeof DESK_COUNTS)[number]
export const DEFAULT_DESKS: DeskCount = 2

export function isDeskCount(n: unknown): n is DeskCount {
  return DESK_COUNTS.includes(n as DeskCount)
}

/**
 * Extra floor (metres, towards +z) the room grows by to make space for more desks. Each added row
 * holds two desks side by side; rows are 2.6 m apart so a walking agent fits between them.
 */
export function roomExtra(desks: DeskCount): number {
  return desks === 2 ? 0 : desks === 4 ? 2.85 : 5.45
}
