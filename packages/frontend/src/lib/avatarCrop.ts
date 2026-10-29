export const AVATAR_OUTPUT_SIZE = 512

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
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

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
