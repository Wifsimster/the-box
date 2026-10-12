import fs from 'node:fs'
import sharp from 'sharp'

/** Side, in pixels, of every stored avatar. */
export const AVATAR_SIZE = 512

/** WebP quality used for stored avatars. */
export const AVATAR_WEBP_QUALITY = 85

/**
 * Refuse inputs larger than 100 megapixels (a 108 MP phone photo still
 * passes). A 10 MB PNG can otherwise expand to gigabytes once decoded.
 */
export const AVATAR_MAX_INPUT_PIXELS = 100_000_000

/** The uploaded bytes are not an image sharp can decode (or it is too large). */
export class InvalidAvatarImageError extends Error {
  constructor(cause: unknown) {
    super('Uploaded file is not a readable image', { cause })
    this.name = 'InvalidAvatarImageError'
  }
}

/**
 * Re-encode an uploaded avatar whatever the client sent: apply the EXIF
 * orientation, crop to a centred 512x512 square, encode as WebP. Sharp drops
 * every metadata block (EXIF, GPS, XMP, ICC after sRGB conversion) unless asked
 * to keep it. Only the first frame of an animated GIF/WebP is read.
 *
 * Decoding and encoding happen in memory so that a decode failure (400) is
 * never confused with a disk write failure (500).
 */
export async function normalizeAvatarImage(inputPath: string, outputPath: string): Promise<void> {
  let output: Buffer
  try {
    output = await sharp(inputPath, {
      failOn: 'error',
      limitInputPixels: AVATAR_MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: AVATAR_WEBP_QUALITY })
      .toBuffer()
  } catch (error) {
    throw new InvalidAvatarImageError(error)
  }
  await fs.promises.writeFile(outputPath, output)
}
