import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { queueLogger } from '../../logger/logger.js'

const log = queueLogger.child({ worker: 'maps-fetch-html' })

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const MAX_IMAGE_BYTES = 25 * 1024 * 1024 // 25 MB hard cap
const REQUEST_TIMEOUT_MS = 20_000

export interface FetchedImage {
  bytes: Buffer
  contentType: string | null
  width?: number
  height?: number
}

/**
 * SHA256 hex of a buffer. Used to dedup images across providers — if Steam
 * and RAWG mirror the same JPEG, we only want one candidate row.
 */
export function sha256OfBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * Download image bytes with a size cap and timeout, then peek at JPEG/PNG
 * headers to extract dimensions without a heavy dependency. Returns null on
 * any failure rather than throwing — the caller treats null as parse_error.
 */
export async function fetchImageBytes(url: string): Promise<FetchedImage | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!res.ok) {
      log.debug({ url, status: res.status }, 'image fetch failed')
      return null
    }
    const contentLength = Number(res.headers.get('content-length') ?? 0)
    if (contentLength && contentLength > MAX_IMAGE_BYTES) {
      log.warn({ url, contentLength }, 'image too large; skipping')
      return null
    }
    const arrayBuffer = await res.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      log.warn({ url, size: arrayBuffer.byteLength }, 'image exceeded cap')
      return null
    }
    const bytes = Buffer.from(arrayBuffer)
    const dims = peekDimensions(bytes)
    return {
      bytes,
      contentType: res.headers.get('content-type'),
      width: dims?.width,
      height: dims?.height,
    }
  } catch (err) {
    log.debug({ url, err: String(err) }, 'image fetch threw')
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Read width/height from PNG/JPEG/GIF/WebP headers without a parser library.
 * Returns null for anything we don't recognise — caller stores 0,0 in that
 * case (the admin chooser still works on whatever the page renders).
 */
function peekDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null

  // PNG: 89 50 4E 47 0D 0A 1A 0A, IHDR width/height at offset 16 / 20.
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }

  // GIF: 47 49 46 38, width/height at 6/8 little-endian.
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  }

  // JPEG: scan for SOFn marker.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++
        continue
      }
      const marker = buf[i + 1]!
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15.
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          height: buf.readUInt16BE(i + 5),
          width: buf.readUInt16BE(i + 7),
        }
      }
      const segLen = buf.readUInt16BE(i + 2)
      i += 2 + segLen
    }
  }

  // WebP: 52 49 46 46 .. 57 45 42 50; VP8/VP8L/VP8X variants.
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    // VP8X (extended): width-1 / height-1 at 24/27 (24-bit LE).
    if (buf[12] === 0x56 && buf[15] === 0x20 /* "VP8 " */) {
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      }
    }
  }

  return null
}
