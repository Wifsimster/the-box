import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import type { User } from '@the-box/types'
import { InvalidAvatarImageError } from '../../infrastructure/images/avatar-image.js'

export interface AvatarUploadHandlerDeps {
  /** Directory where stored avatars live (served under /uploads/avatars). */
  avatarsDir: string
  /** Re-encode `inputPath` into the final avatar at `outputPath`. */
  normalizeImage(inputPath: string, outputPath: string): Promise<void>
  findCurrentAvatarUrl(userId: string): Promise<string | null | undefined>
  updateAvatarUrl(userId: string, avatarUrl: string): Promise<User | null>
  deleteAvatarFile(avatarUrl: string): Promise<void>
  toAvatarUrl(filename: string): string
  onUploaded?(userId: string, avatarUrl: string): void
}

async function removeQuietly(filePath: string): Promise<void> {
  await fs.promises.rm(filePath, { force: true }).catch(() => {})
}

/**
 * POST /api/user/avatar, after multer has written the raw upload to disk.
 * The raw file is never served: it is re-encoded to `<uuid>.webp` and then
 * removed, whether the re-encode worked or not.
 */
export function createAvatarUploadHandler(deps: AvatarUploadHandlerDeps): RequestHandler {
  return async (req, res, next) => {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' },
      })
      return
    }

    const rawPath = req.file.path
    const filename = `${randomUUID()}.webp`
    const outputPath = path.join(deps.avatarsDir, filename)

    try {
      // The raw upload is removed before any response leaves, success or not.
      let normalizeError: unknown = null
      try {
        await deps.normalizeImage(rawPath, outputPath)
      } catch (error) {
        normalizeError = error
      }
      await removeQuietly(rawPath)

      if (normalizeError) {
        await removeQuietly(outputPath)
        if (normalizeError instanceof InvalidAvatarImageError) {
          res.status(400).json({
            success: false,
            error: { code: 'INVALID_IMAGE', message: 'The uploaded file is not a readable image' },
          })
          return
        }
        throw normalizeError
      }

      const userId = req.userId!
      const oldAvatarUrl = await deps.findCurrentAvatarUrl(userId)
      const avatarUrl = deps.toAvatarUrl(filename)

      let updatedUser: User | null
      try {
        updatedUser = await deps.updateAvatarUrl(userId, avatarUrl)
      } catch (error) {
        await removeQuietly(outputPath)
        throw error
      }

      if (oldAvatarUrl) {
        await deps.deleteAvatarFile(oldAvatarUrl)
      }

      deps.onUploaded?.(userId, avatarUrl)
      res.json({ success: true, data: updatedUser })
    } catch (error) {
      next(error)
    }
  }
}
