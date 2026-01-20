import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Avatar uploads directory
const avatarsPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'uploads', 'avatars')

// Ensure avatars directory exists
if (!fs.existsSync(avatarsPath)) {
  fs.mkdirSync(avatarsPath, { recursive: true })
}

// Configure storage for avatar uploads
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, avatarsPath)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const uniqueName = `${uuidv4()}${ext}`
    cb(null, uniqueName)
  },
})

// File filter for images only
const imageFileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'))
  }
}

// Avatar upload middleware (max 5MB)
export const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
})

// Helper to get public URL for avatar
export function getAvatarUrl(filename: string): string {
  return `/uploads/avatars/${filename}`
}

// Helper to delete old avatar file
export async function deleteAvatarFile(avatarUrl: string): Promise<void> {
  if (!avatarUrl || !avatarUrl.startsWith('/uploads/avatars/')) {
    return
  }
  const filename = avatarUrl.replace('/uploads/avatars/', '')
  const filepath = path.join(avatarsPath, filename)
  try {
    await fs.promises.unlink(filepath)
  } catch {
    // File doesn't exist or already deleted, ignore
  }
}
