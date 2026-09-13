// Pure copy builder for the GeoGamers daily push. Kept infra-free (like
// evening-nudge-copy) so it's unit-testable without pulling in the Redis-backed
// services barrel.

export function buildGeoGamersDailyCopy(locale: 'fr' | 'en'): { title: string; body: string } {
  if (locale === 'en') {
    return {
      title: 'Panorama — today\'s round is live!',
      body: "Today's game is live. Guess it and pin the spot — 200 points up for grabs.",
    }
  }
  return {
    title: 'Panorama — le run du jour est en ligne !',
    body: 'Le jeu du jour est en ligne. Devine-le et place le marqueur — 200 points à prendre.',
  }
}
