import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import sharp from 'sharp'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { User } from '@the-box/types'
import { createAvatarUploadHandler } from './avatar-upload.handler.js'
import { AVATAR_SIZE, normalizeAvatarImage } from '../../infrastructure/images/avatar-image.js'

interface Reply {
  status: number
  body: { success: boolean; data?: User; error?: { code: string } }
}

async function postAvatar(
  baseUrl: string,
  file: { name: string; type: string; bytes: Buffer } | null
): Promise<Reply> {
  const form = new FormData()
  if (file) form.append('avatar', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name)
  else form.append('other', 'x')
  const res = await fetch(`${baseUrl}/avatar`, { method: 'POST', body: form })
  return { status: res.status, body: (await res.json()) as Reply['body'] }
}

describe('POST /avatar (createAvatarUploadHandler)', () => {
  let tmp: string
  let avatarsDir: string
  let incomingDir: string
  let server: Server
  let baseUrl: string
  let currentAvatarUrl: string | null
  let deleted: string[]

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-route-'))
    avatarsDir = path.join(tmp, 'avatars')
    incomingDir = path.join(tmp, 'incoming')
    fs.mkdirSync(avatarsDir)
    fs.mkdirSync(incomingDir)

    const upload = multer({ dest: incomingDir, limits: { fileSize: 10 * 1024 * 1024 } })
    const app = express()
    app.post(
      '/avatar',
      (req, _res, next) => {
        req.userId = 'user-1'
        next()
      },
      upload.single('avatar'),
      createAvatarUploadHandler({
        avatarsDir,
        normalizeImage: normalizeAvatarImage,
        findCurrentAvatarUrl: async () => currentAvatarUrl,
        updateAvatarUrl: async (userId, avatarUrl) => {
          currentAvatarUrl = avatarUrl
          return { id: userId, avatarUrl } as User
        },
        deleteAvatarFile: async (url) => {
          deleted.push(url)
        },
        toAvatarUrl: (filename) => `/uploads/avatars/${filename}`,
      })
    )
    app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR' } })
    })
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve())
    })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  beforeEach(() => {
    currentAvatarUrl = '/uploads/avatars/old.png'
    deleted = []
  })

  after(() => {
    server.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('stores a 512x512 WebP without metadata and removes the raw upload', async () => {
    const bytes = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: { r: 120, g: 40, b: 200 } },
    })
      .withExif({ IFD0: { Make: 'TestCam', Copyright: 'gps-owner' } })
      .jpeg()
      .toBuffer()

    const res = await postAvatar(baseUrl, { name: 'photo.jpg', type: 'image/jpeg', bytes })

    assert.equal(res.status, 200)
    const avatarUrl = res.body.data?.avatarUrl
    assert.match(avatarUrl ?? '', /^\/uploads\/avatars\/[0-9a-f-]{36}\.webp$/)
    const stored = path.join(avatarsDir, path.basename(avatarUrl!))
    const meta = await sharp(stored).metadata()
    assert.equal(meta.format, 'webp')
    assert.equal(meta.width, AVATAR_SIZE)
    assert.equal(meta.height, AVATAR_SIZE)
    assert.equal(meta.exif, undefined)
    assert.ok(!fs.readFileSync(stored).includes('gps-owner'))
    assert.deepEqual(fs.readdirSync(avatarsDir), [path.basename(avatarUrl!)])
    assert.deepEqual(fs.readdirSync(incomingDir), [], 'raw upload removed')
    assert.deepEqual(deleted, ['/uploads/avatars/old.png'])
  })

  it('answers 400 INVALID_IMAGE for bytes that are not an image, and keeps the old avatar', async () => {
    const before = fs.readdirSync(avatarsDir)
    const res = await postAvatar(baseUrl, {
      name: 'avatar.png',
      type: 'image/png',
      bytes: Buffer.from('<?php echo "not an image"; ?>'),
    })

    assert.equal(res.status, 400)
    assert.equal(res.body.success, false)
    assert.equal(res.body.error?.code, 'INVALID_IMAGE')
    assert.equal(currentAvatarUrl, '/uploads/avatars/old.png')
    assert.deepEqual(deleted, [])
    assert.deepEqual(fs.readdirSync(avatarsDir), before, 'nothing written')
    assert.deepEqual(fs.readdirSync(incomingDir), [], 'raw upload removed')
  })

  it('answers 400 NO_FILE when the form has no avatar field', async () => {
    const res = await postAvatar(baseUrl, null)
    assert.equal(res.status, 400)
    assert.equal(res.body.error?.code, 'NO_FILE')
  })
})
