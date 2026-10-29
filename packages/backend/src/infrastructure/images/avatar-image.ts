import fs from 'node:fs'
import sharp from 'sharp'

export const AVATAR_SIZE = 512

export const AVATAR_WEBP_QUALITY = 85

export const AVATAR_MAX_INPUT_PIXELS = 100_000_000

export class InvalidAvatarImageError extends Error {
  constructor(cause: unknown) {
    super('Uploaded file is not a readable image', { cause })
    this.name = 'InvalidAvatarImageError'
  }
}

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
