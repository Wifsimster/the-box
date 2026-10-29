import path from 'path'
import type { Response } from 'express'

export function resolveUploadRelativePath(uploadsPath: string, imageUrl: string): string | null {
  const filePath = path.resolve(uploadsPath, imageUrl.replace('/uploads/', ''))
  if (!filePath.startsWith(uploadsPath + path.sep)) {
    return null
  }
  return path.relative(uploadsPath, filePath)
}

export function sendUploadFile(
  res: Response,
  uploadsPath: string,
  relativePath: string,
  options: { maxAge: string; headers: Record<string, string> },
  onError: (err: Error) => void
): void {
  res.sendFile(relativePath, { ...options, root: uploadsPath }, (err) => {
    if (err) onError(err)
  })
}
