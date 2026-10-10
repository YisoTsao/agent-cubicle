// Spots on the back wall that other modules (routes, collision data) need without pulling in
// the React scene code.

export const TERMINAL = {
  /** Standing spot in front of the terminal console (world x, z). */
  stand: [1.0, -1.88] as const,
}

export const COFFEE_BAR = {
  /** Standing spot in front of the coffee bar (world x, z). */
  stand: [-0.3, -1.95] as const,
}
