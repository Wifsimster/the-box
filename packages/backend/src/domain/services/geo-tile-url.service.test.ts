import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { GeoMapTilesConfig } from '@the-box/types'
import { formatTileUrl } from './geo-tile-url.service.js'

const XYZ: GeoMapTilesConfig = {
  urlTemplate: 'https://example.com/{z}/{x}/{y}.png',
  minZoom: 0,
  maxZoom: 5,
  tileSize: 256,
  scheme: 'xyz',
}

const WOW: GeoMapTilesConfig = {
  urlTemplate: 'https://cdn.example.com/azeroth/tile_z{z}_{x}_{y}.png',
  minZoom: 0,
  maxZoom: 5,
  tileSize: 256,
  scheme: 'xyz-padded2-inverted',
}

describe('formatTileUrl — xyz', () => {
  it('substitutes z/x/y verbatim', () => {
    assert.equal(
      formatTileUrl(XYZ, 3, 12, 7),
      'https://example.com/3/12/7.png',
    )
  })

  it('handles zoom edges', () => {
    assert.equal(formatTileUrl(XYZ, 0, 0, 0), 'https://example.com/0/0/0.png')
    assert.equal(formatTileUrl(XYZ, 5, 31, 31), 'https://example.com/5/31/31.png')
  })
})

describe('formatTileUrl — xyz-padded2-inverted (World-of-MapCraft)', () => {
  it('zero-pads x and y to two digits', () => {
    const url = formatTileUrl(WOW, WOW.maxZoom, 0, 0)
    assert.equal(
      url,
      'https://cdn.example.com/azeroth/tile_z0_00_00.png',
      'deepest leaflet zoom maps to URL z=minZoom; x/y zero-padded',
    )
  })

  it('inverts z so leaflet maxZoom -> URL minZoom', () => {
    // Most zoomed-out leaflet view (z=minZoom=0) should request URL z=5.
    assert.equal(
      formatTileUrl(WOW, 0, 1, 2),
      'https://cdn.example.com/azeroth/tile_z5_01_02.png',
    )
  })

  it('preserves coordinates above 9 with the 2-digit pad', () => {
    assert.equal(
      formatTileUrl(WOW, WOW.maxZoom, 84, 68),
      'https://cdn.example.com/azeroth/tile_z0_84_68.png',
    )
  })

  it('round-trips every zoom level for the (0,0) tile', () => {
    // Snapshot all 6 levels to catch any off-by-one regression on the
    // z-inversion. URL z values must monotonically decrease as leaflet z
    // grows (deeper Leaflet zoom = lower URL z).
    const urlZs = [0, 1, 2, 3, 4, 5].map(
      (leafletZ) => formatTileUrl(WOW, leafletZ, 0, 0).match(/tile_z(\d+)/)![1],
    )
    assert.deepEqual(urlZs, ['5', '4', '3', '2', '1', '0'])
  })
})
