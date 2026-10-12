import multer from 'multer'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import type { RequestHandler } from 'express'
import { v4 as uuidv4 } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Avatar uploads directory (served publicly under /uploads/avatars)
export const avatarsPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'uploads', 'avatars')

// Raw uploads land outside the public uploads tree: they are re-encoded into
// avatarsPath and then deleted, so the client's original bytes (EXIF, GPS,
// anything) are never reachable over HTTP, not even for a moment.
const incomingAvatarsPath = path.join(os.tmpdir(), 'the-box-avatar-incoming')

for (const dir of [avatarsPath, incomingAvatarsPath]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// Configure storage for avatar uploads
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, incomingAvatarsPath)
  },
  filename: (_req, _file, cb) => {
    cb(null, `${uuidv4()}.upload`)
  },
})

export const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

class InvalidAvatarTypeError extends Error {
  constructor() {
    super('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.')
    this.name = 'InvalidAvatarTypeError'
  }
}

// File filter for images only
const imageFileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new InvalidAvatarTypeError())
  }
}

export const AVATAR_MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10MB

// Avatar upload middleware (max 10MB)
export const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: AVATAR_MAX_UPLOAD_BYTES,
    files: 1,
  },
})

/**
 * `avatarUpload.single('avatar')`, with client mistakes answered as 4xx JSON
 * instead of falling through to the generic 500 handler.
 */
export const avatarUploadSingle: RequestHandler = (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err?: unknown) => {
    if (!err) {
      next()
      return
    }
    if (err instanceof InvalidAvatarTypeError) {
      res.status(400).json({ success: false, error: { code: 'INVALID_FILE_TYPE', message: err.message } })
      return
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'Maximum size is 10 MB' } })
        return
      }
      res.status(400).json({ success: false, error: { code: 'INVALID_UPLOAD', message: err.message } })
      return
    }
    next(err)
  })
}

// Helper to get public URL for avatar
export function getAvatarUrl(filename: string): string {
  return `/uploads/avatars/${filename}`
}

// Helper to delete old avatar file
export async function deleteAvatarFile(avatarUrl: string): Promise<void> {
  if (!avatarUrl || !avatarUrl.startsWith('/uploads/avatars/')) {
    return
  }
  const filename = path.basename(avatarUrl.replace('/uploads/avatars/', ''))
  const filepath = path.join(avatarsPath, filename)
  try {
    await fs.promises.unlink(filepath)
  } catch {
    // File doesn't exist or already deleted, ignore
  }
}
