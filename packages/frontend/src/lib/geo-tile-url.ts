import type { GeoMapTilesConfig } from '@the-box/types'

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
