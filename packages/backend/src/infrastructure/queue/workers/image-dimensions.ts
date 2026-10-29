const HEADER_BYTES = 65536

export interface ProbedDimensions {
  width: number
  height: number
  format: 'png' | 'jpeg' | 'webp'
}

export async function probeImageDimensions(
  url: string,
  userAgent: string,
): Promise<ProbedDimensions | null> {
  let buf: Uint8Array
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        Range: `bytes=0-${HEADER_BYTES - 1}`,
        Accept: 'image/*,*/*;q=0.8',
      },
    })
    if (!res.ok && res.status !== 206) return null
    buf = new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
  return parseDimensions(buf)
}

export function parseDimensions(buf: Uint8Array): ProbedDimensions | null {
  if (buf.length < 12) return null

  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf.length >= 24
  ) {
    const width = readUint32BE(buf, 16)
    const height = readUint32BE(buf, 20)
    if (width > 0 && height > 0) return { width, height, format: 'png' }
    return null
  }

  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++
        continue
      }
      const marker = buf[i + 1]!
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
        i += 2
        continue
      }
      const isSof =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      const segLen = (buf[i + 2]! << 8) | buf[i + 3]!
      if (isSof) {
        const height = (buf[i + 5]! << 8) | buf[i + 6]!
        const width = (buf[i + 7]! << 8) | buf[i + 8]!
        if (width > 0 && height > 0) return { width, height, format: 'jpeg' }
        return null
      }
      i += 2 + segLen
    }
    return null
  }

  if (
    buf.length >= 30 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    const chunk = String.fromCharCode(buf[12]!, buf[13]!, buf[14]!, buf[15]!)
    if (chunk === 'VP8 ') {
      const width = ((buf[26]! | (buf[27]! << 8)) & 0x3fff) >>> 0
      const height = ((buf[28]! | (buf[29]! << 8)) & 0x3fff) >>> 0
      if (width > 0 && height > 0) return { width, height, format: 'webp' }
    }
    if (chunk === 'VP8L' && buf.length >= 25) {
      const b0 = buf[21]!
      const b1 = buf[22]!
      const b2 = buf[23]!
      const b3 = buf[24]!
      const width = 1 + (((b1 & 0x3f) << 8) | b0)
      const height =
        1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >>> 6))
      if (width > 0 && height > 0) return { width, height, format: 'webp' }
    }
    if (chunk === 'VP8X' && buf.length >= 30) {
      const width = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16))
      const height = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16))
      if (width > 0 && height > 0) return { width, height, format: 'webp' }
    }
  }

  return null
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset]! << 24) >>> 0) +
    (buf[offset + 1]! << 16) +
    (buf[offset + 2]! << 8) +
    buf[offset + 3]!
  )
}
