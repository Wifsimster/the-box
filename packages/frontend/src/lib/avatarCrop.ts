/**
 * Avatar crop → canvas helpers. The math is pure (unit tested); the canvas
 * helpers are thin wrappers that only run in a browser.
 */

/** Side, in pixels, of the square avatar sent to the server. */
export const AVATAR_OUTPUT_SIZE = 512

/** Encoder quality for the exported avatar (WebP, or the JPEG fallback). */
export const AVATAR_EXPORT_QUALITY = 0.85

export const AVATAR_MIN_ZOOM = 1
export const AVATAR_MAX_ZOOM = 4
export const AVATAR_ZOOM_STEP = 0.05

export interface PixelArea {
  x: number
  y: number
  width: number
  height: number
}

export interface DrawParams {
  /** Source rectangle, in natural image pixels. */
  sx: number
  sy: number
  sw: number
  sh: number
  /** Destination rectangle on the output canvas. */
  dx: number
  dy: number
  dw: number
  dh: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * Map the area picked in the cropper (natural image pixels, possibly a pixel
 * off the image edge because the cropper rounds) onto a square output canvas.
 *
 * The square area is first clamped to the image; the part that remains is
 * drawn where it belongs on the canvas, so a rounding overflow never stretches
 * the picture. Returns `null` when nothing of the image is inside the area.
 */
export function computeAvatarDrawParams(
  area: PixelArea,
  image: { width: number; height: number },
  outputSize: number = AVATAR_OUTPUT_SIZE,
): DrawParams | null {
  if (area.width <= 0 || area.height <= 0 || image.width <= 0 || image.height <= 0) return null

  const left = clamp(area.x, 0, image.width)
  const top = clamp(area.y, 0, image.height)
  const right = clamp(area.x + area.width, 0, image.width)
  const bottom = clamp(area.y + area.height, 0, image.height)
  const sw = right - left
  const sh = bottom - top
  if (sw <= 0 || sh <= 0) return null

  const scaleX = outputSize / area.width
  const scaleY = outputSize / area.height
  return {
    sx: left,
    sy: top,
    sw,
    sh,
    dx: (left - area.x) * scaleX,
    dy: (top - area.y) * scaleY,
    dw: sw * scaleX,
    dh: sh * scaleY,
  }
}

/** Keep a zoom value inside the slider range, snapped to its step. */
export function clampAvatarZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return AVATAR_MIN_ZOOM
  const snapped = Math.round(zoom / AVATAR_ZOOM_STEP) * AVATAR_ZOOM_STEP
  return Number(clamp(snapped, AVATAR_MIN_ZOOM, AVATAR_MAX_ZOOM).toFixed(2))
}

export interface ExportFormat {
  type: 'image/webp' | 'image/jpeg'
  filename: string
}

export const AVATAR_EXPORT_FORMATS: readonly ExportFormat[] = [
  { type: 'image/webp', filename: 'avatar.webp' },
  { type: 'image/jpeg', filename: 'avatar.jpg' },
]

/**
 * A browser that cannot encode the requested type silently hands back a PNG.
 * Accept the blob only when it really has the type we asked for.
 */
export function isExpectedBlob(blob: Blob | null, format: ExportFormat): blob is Blob {
  return blob !== null && blob.size > 0 && blob.type === format.type
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image could not be decoded'))
    image.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Render the cropped square at 512x512 and encode it (WebP, JPEG fallback).
 * Re-drawing through a canvas also drops EXIF/GPS and keeps only the first
 * frame of an animated GIF.
 */
export async function renderAvatarCrop(src: string, area: PixelArea): Promise<File> {
  const image = await loadImage(src)
  const params = computeAvatarDrawParams(area, { width: image.naturalWidth, height: image.naturalHeight })
  if (!params) throw new Error('Empty crop area')

  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_OUTPUT_SIZE
  canvas.height = AVATAR_OUTPUT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, params.sx, params.sy, params.sw, params.sh, params.dx, params.dy, params.dw, params.dh)

  for (const format of AVATAR_EXPORT_FORMATS) {
    const blob = await canvasToBlob(canvas, format.type, AVATAR_EXPORT_QUALITY)
    if (isExpectedBlob(blob, format)) {
      return new File([blob], format.filename, { type: format.type })
    }
  }
  throw new Error('Canvas export failed')
}
