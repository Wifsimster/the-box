import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { encryptSecret, decryptSecret } from './secret-box.js'

describe('secret-box (AES-256-GCM)', () => {
  it('round-trips a value', () => {
    const plain = 'whsec_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
    assert.equal(decryptSecret(encryptSecret(plain)), plain)
  })

  it('round-trips unicode and empty strings', () => {
    for (const plain of ['', 'héllo · wörld 🎮', 'a']) {
      assert.equal(decryptSecret(encryptSecret(plain)), plain)
    }
  })

  it('produces a fresh IV each call — same input, different ciphertext', () => {
    const a = encryptSecret('same-input')
    const b = encryptSecret('same-input')
    assert.notEqual(a, b)
    assert.equal(decryptSecret(a), 'same-input')
    assert.equal(decryptSecret(b), 'same-input')
  })

  it('emits the iv.tag.ciphertext three-part shape', () => {
    assert.equal(encryptSecret('x').split('.').length, 3)
  })

  it('returns null for malformed input rather than throwing', () => {
    for (const bad of ['', 'not-encrypted', 'a.b', 'a.b.c.d', 'x.y.z']) {
      assert.equal(decryptSecret(bad), null)
    }
  })

  it('returns null when the ciphertext is tampered (auth tag fails)', () => {
    const encoded = encryptSecret('tamper-me')
    const [iv, tag] = encoded.split('.')
    const tampered = [iv, tag, Buffer.from('garbagegarbage').toString('base64')].join('.')
    assert.equal(decryptSecret(tampered), null)
  })

  it('returns null when the auth tag is swapped', () => {
    const a = encryptSecret('value-a')
    const b = encryptSecret('value-b')
    const [ivA, , ctA] = a.split('.')
    const [, tagB] = b.split('.')
    assert.equal(decryptSecret([ivA, tagB, ctA].join('.')), null)
  })
})

describe('createSecretBox (app settings)', () => {
  it('round-trips through the app-settings box', async () => {
    const { appSettingSecretBox } = await import('./secret-box.js')
    const key = 'sk-ant-api03-test-value-not-real-0000'
    const enc = appSettingSecretBox.encrypt(key)
    assert.ok(!enc.includes(key))
    assert.equal(appSettingSecretBox.decrypt(enc), key)
  })

  it('separates domains: a webhook box cannot read an app-setting value', async () => {
    const { appSettingSecretBox, decryptSecret } = await import('./secret-box.js')
    assert.equal(decryptSecret(appSettingSecretBox.encrypt('cross-domain')), null)
  })

  it('a rotated server secret cannot decrypt old values (reads as null)', async () => {
    const { createSecretBox } = await import('./secret-box.js')
    const before = createSecretBox('the-box/app-setting/v1', 'old-secret-old-secret-old-secret-00')
    const after = createSecretBox('the-box/app-setting/v1', 'new-secret-new-secret-new-secret-00')
    assert.equal(after.decrypt(before.encrypt('value')), null)
  })
})
