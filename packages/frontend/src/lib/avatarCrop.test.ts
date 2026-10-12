import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  AVATAR_EXPORT_FORMATS,
  AVATAR_MAX_ZOOM,
  AVATAR_MIN_ZOOM,
  clampAvatarZoom,
  computeAvatarDrawParams,
  isExpectedBlob,
} from './avatarCrop'

describe('computeAvatarDrawParams', () => {
  it('maps a centred square of a wide screenshot onto the whole 512 canvas', () => {
    const params = computeAvatarDrawParams({ x: 420, y: 0, width: 1080, height: 1080 }, { width: 1920, height: 1080 })
    assert.deepEqual(params, { sx: 420, sy: 0, sw: 1080, sh: 1080, dx: 0, dy: 0, dw: 512, dh: 512 })
  })

  it('scales a zoomed-in area up to the output size', () => {
    const params = computeAvatarDrawParams({ x: 100, y: 50, width: 256, height: 256 }, { width: 800, height: 600 })
    assert.deepEqual(params, { sx: 100, sy: 50, sw: 256, sh: 256, dx: 0, dy: 0, dw: 512, dh: 512 })
  })

  it('clamps a rounding overflow past the right/bottom edge without stretching', () => {
    // Cropper rounded the area one pixel past a 1000x1000 image.
    const params = computeAvatarDrawParams({ x: 1, y: 1, width: 1000, height: 1000 }, { width: 1000, height: 1000 })
    assert.ok(params)
    assert.equal(params.sw, 999)
    assert.equal(params.sh, 999)
    assert.equal(params.dx, 0)
    assert.equal(params.dy, 0)
    // Same scale on both axes: 512 / 1000 per source pixel.
    assert.ok(Math.abs(params.dw - 999 * 0.512) < 1e-9)
    assert.ok(Math.abs(params.dh - 999 * 0.512) < 1e-9)
  })

  it('offsets the drawing when the area starts before the image', () => {
    const params = computeAvatarDrawParams({ x: -10, y: -20, width: 200, height: 200 }, { width: 400, height: 400 })
    assert.ok(params)
    assert.equal(params.sx, 0)
    assert.equal(params.sy, 0)
    assert.equal(params.sw, 190)
    assert.equal(params.sh, 180)
    assert.ok(Math.abs(params.dx - 10 * 2.56) < 1e-9)
    assert.ok(Math.abs(params.dy - 20 * 2.56) < 1e-9)
  })

  it('honours a custom output size', () => {
    const params = computeAvatarDrawParams({ x: 0, y: 0, width: 50, height: 50 }, { width: 50, height: 50 }, 128)
    assert.deepEqual(params, { sx: 0, sy: 0, sw: 50, sh: 50, dx: 0, dy: 0, dw: 128, dh: 128 })
  })

  it('returns null for an empty area or an area outside the image', () => {
    assert.equal(computeAvatarDrawParams({ x: 0, y: 0, width: 0, height: 10 }, { width: 10, height: 10 }), null)
    assert.equal(computeAvatarDrawParams({ x: 50, y: 50, width: 10, height: 10 }, { width: 10, height: 10 }), null)
    assert.equal(computeAvatarDrawParams({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 }), null)
  })
})

describe('clampAvatarZoom', () => {
  it('keeps values inside the slider range', () => {
    assert.equal(clampAvatarZoom(0.2), AVATAR_MIN_ZOOM)
    assert.equal(clampAvatarZoom(99), AVATAR_MAX_ZOOM)
    assert.equal(clampAvatarZoom(Number.NaN), AVATAR_MIN_ZOOM)
  })

  it('snaps to the slider step', () => {
    assert.equal(clampAvatarZoom(1.234), 1.25)
    assert.equal(clampAvatarZoom(2.01), 2)
  })
})

describe('isExpectedBlob', () => {
  const [webp] = AVATAR_EXPORT_FORMATS
  it('accepts a blob of the requested type', () => {
    assert.equal(isExpectedBlob(new Blob(['x'], { type: 'image/webp' }), webp!), true)
  })

  it('rejects the PNG a browser returns when it cannot encode WebP', () => {
    assert.equal(isExpectedBlob(new Blob(['x'], { type: 'image/png' }), webp!), false)
  })

  it('rejects null and empty blobs', () => {
    assert.equal(isExpectedBlob(null, webp!), false)
    assert.equal(isExpectedBlob(new Blob([], { type: 'image/webp' }), webp!), false)
  })

  it('falls back from WebP to JPEG', () => {
    assert.deepEqual(
      AVATAR_EXPORT_FORMATS.map((f) => f.type),
      ['image/webp', 'image/jpeg'],
    )
  })
})
