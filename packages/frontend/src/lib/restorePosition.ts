export interface RestorePositionInput {
  persistedPosition: number
  isSameChallenge: boolean
  backendPosition: number
  correctPositions: ReadonlySet<number>
  totalScreenshots: number
}

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

  for (let offset = 1; offset < totalScreenshots; offset++) {
    const candidate = ((preferred - 1 + offset) % totalScreenshots) + 1
    if (!correctPositions.has(candidate)) return candidate
  }
  return preferred
}
