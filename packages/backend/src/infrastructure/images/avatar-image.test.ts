import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {
  AVATAR_SIZE,
  InvalidAvatarImageError,
  normalizeAvatarImage,
} from './avatar-image.js'

describe('normalizeAvatarImage', () => {
  let tmp: string

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-image-'))
  })

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('turns a wide JPEG with EXIF into a 512x512 WebP without metadata', async () => {
    const input = path.join(tmp, 'wide.jpg')
    // Left half red, right half blue, plus EXIF that must not survive.
    await sharp({
      create: { width: 1200, height: 600, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 600, height: 600, channels: 3, background: { r: 0, g: 0, b: 255 } },
          })
            .png()
            .toBuffer(),
          left: 600,
          top: 0,
        },
      ])
      .withExif({ IFD0: { Make: 'TestCam', Model: 'Leaky', Copyright: 'secret-owner' } })
      .jpeg()
      .toFile(input)
    const inputMeta = await sharp(input).metadata()
    assert.ok(inputMeta.exif, 'fixture should carry EXIF')

    const output = path.join(tmp, 'wide.webp')
    await normalizeAvatarImage(input, output)

    const meta = await sharp(output).metadata()
    assert.equal(meta.format, 'webp')
    assert.equal(meta.width, AVATAR_SIZE)
    assert.equal(meta.height, AVATAR_SIZE)
    assert.equal(meta.exif, undefined)
    assert.equal(meta.xmp, undefined)
    assert.equal(meta.icc, undefined)
    assert.equal(meta.orientation, undefined)
    assert.ok(!fs.readFileSync(output).includes('secret-owner'))

    // Centre crop: the left edge comes from the red half, the right edge from the blue half.
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })
    const px = (x: number, y: number): [number, number, number] => {
      const i = (y * info.width + x) * info.channels
      return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]
    }
    const [lr, , lb] = px(5, 256)
    const [rr, , rb] = px(506, 256)
    assert.ok(lr > 200 && lb < 60, `left edge should be red, got ${px(5, 256)}`)
    assert.ok(rb > 200 && rr < 60, `right edge should be blue, got ${px(506, 256)}`)
  })

  it('applies the EXIF orientation before cropping', async () => {
    // Stored 600x300 (landscape) with orientation 6 (rotate 90° CW): displayed portrait.
    const input = path.join(tmp, 'rotated.jpg')
    await sharp({
      create: { width: 600, height: 300, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .composite([
        {
          // Top band of the stored image; after a 90° CW rotation it becomes the right band.
          input: await sharp({
            create: { width: 600, height: 60, channels: 3, background: { r: 255, g: 0, b: 0 } },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toFile(input)

    const output = path.join(tmp, 'rotated.webp')
    await normalizeAvatarImage(input, output)

    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })
    assert.equal(info.width, AVATAR_SIZE)
    assert.equal(info.height, AVATAR_SIZE)
    const i = (256 * info.width + 510) * info.channels
    const [r, g] = [data[i] ?? 0, data[i + 1] ?? 0]
    assert.ok(r > 200 && g < 80, `red band should end up on the right edge, got ${r},${g}`)
    assert.equal((await sharp(output).metadata()).orientation, undefined)
  })

  it('keeps only the first frame of an animated GIF', async () => {
    const input = path.join(tmp, 'anim.gif')
    const frame = (r: number, b: number) =>
      sharp({ create: { width: 64, height: 64, channels: 3, background: { r, g: 0, b } } })
        .raw()
        .toBuffer()
    // Two 64x64 frames: red, then blue.
    const frames = Buffer.concat([await frame(255, 0), await frame(0, 255)])
    await sharp(frames, { raw: { width: 64, height: 128, channels: 3, pageHeight: 64 } })
      .gif({ delay: [100, 100], loop: 0 })
      .toFile(input)
    assert.equal((await sharp(input).metadata()).pages, 2, 'fixture should be animated')

    const output = path.join(tmp, 'anim.webp')
    await normalizeAvatarImage(input, output)
    const meta = await sharp(output).metadata()
    assert.equal(meta.format, 'webp')
    assert.equal(meta.width, AVATAR_SIZE)
    assert.equal(meta.height, AVATAR_SIZE)
    assert.ok(!meta.pages || meta.pages === 1)
    const { data } = await sharp(output).raw().toBuffer({ resolveWithObject: true })
    const [r, , b] = [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0]
    assert.ok(r > 200 && b < 60, `the first (red) frame is kept, got ${r},${b}`)
  })

  it('throws InvalidAvatarImageError for bytes that are not an image', async () => {
    const input = path.join(tmp, 'fake.png')
    fs.writeFileSync(input, 'this is not a png')
    const output = path.join(tmp, 'fake.webp')
    await assert.rejects(normalizeAvatarImage(input, output), InvalidAvatarImageError)
    assert.equal(fs.existsSync(output), false)
  })

  it('throws InvalidAvatarImageError for a truncated image', async () => {
    const full = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer()
    const input = path.join(tmp, 'truncated.png')
    fs.writeFileSync(input, full.subarray(0, Math.floor(full.length / 3)))
    await assert.rejects(normalizeAvatarImage(input, path.join(tmp, 'truncated.webp')), InvalidAvatarImageError)
  })
})
