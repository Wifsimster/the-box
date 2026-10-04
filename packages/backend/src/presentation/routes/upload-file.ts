import path from 'path'
import type { Response } from 'express'

// Map a stored `/uploads/...` URL to a path relative to `uploadsPath`,
// refusing any value whose resolved path escapes the uploads directory.
// imageUrl comes from the DB (admin-managed), but a crafted
// `/uploads/../...` value must not turn an image route into an
// arbitrary-file read.
export function resolveUploadRelativePath(uploadsPath: string, imageUrl: string): string | null {
  const filePath = path.resolve(uploadsPath, imageUrl.replace('/uploads/', ''))
  if (!filePath.startsWith(uploadsPath + path.sep)) {
    return null
  }
  return path.relative(uploadsPath, filePath)
}

// Stream an upload with `root` set. `send` refuses dot-segments in the
// path it is given, so passing an absolute path broke every image when the
// checkout lives under a dot-directory (e.g. `.worktrees/`). With `root`,
// only the part below `uploadsPath` is checked.
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
