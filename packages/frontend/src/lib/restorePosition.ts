export interface RestorePositionInput {
  /** Position from localStorage, or 0 when there is none. */
  persistedPosition: number
  /** True when the persisted state belongs to the challenge being restored. */
  isSameChallenge: boolean
  /** `current_position` of the server session. */
  backendPosition: number
  /** Positions the server already counts as solved. */
  correctPositions: ReadonlySet<number>
  totalScreenshots: number
}

// Pick the position a resumed daily session opens on. The locally persisted
// position wins over the server's (it keeps the player where they were), but
// never when that position is already solved: after a correct guess the store
// stays on the solved position until the result card advances, so a reload in
// that window resumed there and the next submit got 409 POSITION_ALREADY_SOLVED.
export function pickRestorePosition({
  persistedPosition,
  isSameChallenge,
  backendPosition,
  correctPositions,
  totalScreenshots,
}: RestorePositionInput): number {
  const persistedValid = isSameChallenge && persistedPosition > 0 && persistedPosition <= totalScreenshots
  const preferred = persistedValid ? persistedPosition : backendPosition

  for (const candidate of [preferred, backendPosition]) {
    if (candidate > 0 && candidate <= totalScreenshots && !correctPositions.has(candidate)) {
      return candidate
    }
  }

  // Both are solved: take the next unsolved position after the preferred one,
  // wrapping around. If every position is solved, the session is complete and
  // the preferred position is as good as any.
  for (let offset = 1; offset < totalScreenshots; offset++) {
    const candidate = ((preferred - 1 + offset) % totalScreenshots) + 1
    if (!correctPositions.has(candidate)) return candidate
  }
  return preferred
}
