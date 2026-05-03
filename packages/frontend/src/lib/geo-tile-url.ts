import type { GeoMapTilesConfig } from '@the-box/types'

// Format a tile URL by substituting {z}/{x}/{y} according to the scheme.
// Mirrors `packages/backend/src/domain/services/geo-tile-url.service.ts` —
// keep the two in sync. Duplicated rather than shipped via @the-box/types so
// the types package can stay declarations-only.
export function formatTileUrl(
  config: GeoMapTilesConfig,
  z: number,
  x: number,
  y: number,
): string {
  switch (config.scheme) {
    case 'xyz':
      return config.urlTemplate
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y))
    case 'xyz-padded2-inverted': {
      const urlZ = config.maxZoom - z + config.minZoom
      const pad = (n: number) => String(n).padStart(2, '0')
      return config.urlTemplate
        .replace('{z}', String(urlZ))
        .replace('{x}', pad(x))
        .replace('{y}', pad(y))
    }
  }
}
