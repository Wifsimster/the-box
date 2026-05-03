import type { GeoMapTilesConfig } from '@the-box/types'

// Format a tile URL by substituting {z}/{x}/{y} according to the scheme.
//
// Inputs are in Leaflet-natural coordinates (z=minZoom is most zoomed-out;
// z=maxZoom is deepest). Schemes that disagree (e.g. World-of-MapCraft, where
// the URL's z=maxZoom is the most zoomed-out tile) are inverted here so the
// HEAD-probe in the worker hits the same tile coordinates the frontend will
// request. The frontend duplicates this function in `lib/geo-tile-url.ts` —
// the two must stay in sync.
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
      // Invert: deepest leaflet zoom (=maxZoom) maps to URL z=minZoom.
      const urlZ = config.maxZoom - z + config.minZoom
      const pad = (n: number) => String(n).padStart(2, '0')
      return config.urlTemplate
        .replace('{z}', String(urlZ))
        .replace('{x}', pad(x))
        .replace('{y}', pad(y))
    }
  }
}
