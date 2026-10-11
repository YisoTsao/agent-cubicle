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
