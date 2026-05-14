import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isPrivateOrReservedIp,
  signWebhookBody,
  validateWebhookUrl,
} from './webhook-signer.service.js'

// Pure-logic tests only. The DNS-resolving `resolveWebhookUrlSafely` is
// covered by integration tests that can stub /etc/hosts or the resolver;
// here we lock down the synchronous gates that everything else depends on.

describe('isPrivateOrReservedIp', () => {
  it('flags IPv4 private + reserved ranges', () => {
    for (const ip of [
      '10.0.0.1',
      '10.255.255.255',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.0.1',
      '127.0.0.1',
      '169.254.169.254', // AWS metadata
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '224.0.0.1',
      '240.0.0.1',
    ]) {
      assert.equal(isPrivateOrReservedIp(ip), true, `${ip} should be flagged`)
    }
  })

  it('accepts IPv4 public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '142.250.190.46', '172.32.0.1']) {
      assert.equal(isPrivateOrReservedIp(ip), false, `${ip} should be accepted`)
    }
  })

  it('flags IPv6 loopback / ULA / link-local', () => {
    for (const ip of ['::1', 'fc00::1', 'fd12:3456::1', 'fe80::1']) {
      assert.equal(isPrivateOrReservedIp(ip), true, `${ip} should be flagged`)
    }
  })

  it('flags IPv4-mapped private addresses', () => {
    assert.equal(isPrivateOrReservedIp('::ffff:10.0.0.1'), true)
    assert.equal(isPrivateOrReservedIp('::ffff:127.0.0.1'), true)
  })

  it('accepts public IPv6 addresses', () => {
    assert.equal(isPrivateOrReservedIp('2606:4700:4700::1111'), false)
  })

  it('returns true for malformed strings (fail closed)', () => {
    assert.equal(isPrivateOrReservedIp('not-an-ip'), true)
  })
})

describe('validateWebhookUrl', () => {
  const ownApi = 'https://thebox.app'

  it('accepts a vanilla public HTTPS URL', () => {
    assert.deepEqual(validateWebhookUrl('https://hooks.example.com/box', ownApi), { ok: true })
  })

  it('rejects non-HTTPS', () => {
    assert.deepEqual(validateWebhookUrl('http://hooks.example.com/', ownApi), {
      ok: false,
      code: 'NOT_HTTPS',
    })
  })

  it('rejects malformed URLs', () => {
    assert.equal(validateWebhookUrl('not a url', ownApi).code, 'INVALID_URL')
  })

  it('rejects loopback hostnames literally', () => {
    assert.equal(validateWebhookUrl('https://localhost/box', ownApi).code, 'BLOCKED_HOST')
  })

  it('rejects literal private IPs', () => {
    assert.equal(validateWebhookUrl('https://10.0.0.5/x', ownApi).code, 'PRIVATE_IP')
    assert.equal(validateWebhookUrl('https://127.0.0.1/x', ownApi).code, 'PRIVATE_IP')
  })

  it('rejects metadata IPs', () => {
    assert.equal(
      validateWebhookUrl('https://169.254.169.254/latest/meta-data/', ownApi).code,
      'METADATA_IP',
    )
  })

  it('rejects our own host even on a different port', () => {
    assert.equal(validateWebhookUrl('https://thebox.app:8443/x', ownApi).code, 'OWN_HOST')
  })

  it('fails closed when ownApiUrl is malformed', () => {
    assert.equal(validateWebhookUrl('https://hooks.example.com', 'not-a-url').code, 'OWN_HOST')
  })
})

describe('signWebhookBody', () => {
  it('produces deterministic `t=…,v1=…` signatures for the same inputs', () => {
    const a = signWebhookBody('whsec_demo', '{"hello":1}', 1_700_000_000_000)
    const b = signWebhookBody('whsec_demo', '{"hello":1}', 1_700_000_000_000)
    assert.deepEqual(a, b)
    assert.match(a.signature, /^t=\d+,v1=[a-f0-9]{64}$/)
  })

  it('changes signature when the body changes', () => {
    const a = signWebhookBody('whsec_demo', '{"hello":1}', 1_700_000_000_000)
    const b = signWebhookBody('whsec_demo', '{"hello":2}', 1_700_000_000_000)
    assert.notEqual(a.signature, b.signature)
  })

  it('changes signature when the secret changes', () => {
    const a = signWebhookBody('whsec_a', '{}', 1_700_000_000_000)
    const b = signWebhookBody('whsec_b', '{}', 1_700_000_000_000)
    assert.notEqual(a.signature, b.signature)
  })

  it('encodes the timestamp in seconds, not ms', () => {
    const sig = signWebhookBody('s', '{}', 1_700_000_000_000)
    assert.equal(sig.timestamp, 1_700_000_000)
    assert.match(sig.signature, /^t=1700000000,/)
  })
})
