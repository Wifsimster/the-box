import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { resolveUploadRelativePath, sendUploadFile } from './upload-file.js'

describe('resolveUploadRelativePath', () => {
  const root = path.resolve('/srv/app/uploads')

  it('maps a stored /uploads/ URL to a path below the uploads dir', () => {
    assert.equal(
      resolveUploadRelativePath(root, '/uploads/screenshots/42.jpg'),
      path.join('screenshots', '42.jpg')
    )
  })

  it('refuses a URL that escapes the uploads dir', () => {
    assert.equal(resolveUploadRelativePath(root, '/uploads/../../etc/passwd'), null)
    assert.equal(resolveUploadRelativePath(root, '/uploads/'), null)
  })
})

describe('sendUploadFile', () => {
  // The checkout path contains a dot-directory, as in `.worktrees/<name>`.
  let tmp: string
  let uploadsPath: string
  let server: Server
  let baseUrl: string

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-file-'))
    uploadsPath = path.join(tmp, '.worktrees', 'the-box', 'uploads')
    fs.mkdirSync(path.join(uploadsPath, 'screenshots'), { recursive: true })
    fs.writeFileSync(path.join(uploadsPath, 'screenshots', '1.png'), 'png-bytes')

    const app = express()
    app.get('/image/:name', (req, res, next) => {
      const rel = resolveUploadRelativePath(uploadsPath, `/uploads/screenshots/${req.params.name}`)
      if (!rel) {
        res.status(404).end()
        return
      }
      sendUploadFile(res, uploadsPath, rel, { maxAge: '1d', headers: { 'Content-Type': 'image/png' } }, next)
    })
    app.get('/absolute', (_req, res) => {
      res.sendFile(path.join(uploadsPath, 'screenshots', '1.png'), (err) => {
        if (err) res.status((err as { status?: number }).status ?? 500).end()
      })
    })
    app.use((err: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(err.status ?? 500).end()
    })
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve())
    })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  after(() => {
    server.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('serves a file when the uploads dir sits under a dot-directory', async () => {
    const res = await fetch(`${baseUrl}/image/1.png`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'image/png')
    assert.equal(await res.text(), 'png-bytes')
  })

  it('documents the regression: an absolute path under a dot-directory is refused', async () => {
    const res = await fetch(`${baseUrl}/absolute`)
    assert.equal(res.status, 404)
  })

  it('still refuses dotfiles below the uploads dir', async () => {
    fs.writeFileSync(path.join(uploadsPath, 'screenshots', '.hidden.png'), 'secret')
    const res = await fetch(`${baseUrl}/image/.hidden.png`)
    assert.notEqual(res.status, 200)
  })
})
