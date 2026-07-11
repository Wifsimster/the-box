import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildManualCaptureCandidates,
  isValidCaptureUrl,
  manualCaptureExternalId,
} from './geo-manual-capture.service.js'

describe('isValidCaptureUrl', () => {
  it('accepts absolute http(s) image URLs (with query strings)', () => {
    assert.equal(isValidCaptureUrl('https://cdn.example.com/shots/a.jpg'), true)
    assert.equal(isValidCaptureUrl('http://example.com/x.PNG'), true)
    assert.equal(
      isValidCaptureUrl('https://static.wikia.nocookie.net/x/Yharnam.png?cb=123'),
      true,
    )
    // Fandom/Wikia CDN pattern: extension followed by /revision/latest.
    assert.equal(
      isValidCaptureUrl(
        'https://static.wikia.nocookie.net/bloodborne/images/0/03/Central_Yharnam_concept_art_1.jpg/revision/latest?cb=20180727134944',
      ),
      true,
    )
  })

  it('rejects non-image, non-http, and malformed URLs', () => {
    assert.equal(isValidCaptureUrl('https://example.com/page.html'), false)
    assert.equal(isValidCaptureUrl('ftp://example.com/a.jpg'), false)
    assert.equal(isValidCaptureUrl('/relative/a.jpg'), false)
    assert.equal(isValidCaptureUrl('not a url'), false)
    assert.equal(isValidCaptureUrl(''), false)
  })
})

describe('manualCaptureExternalId', () => {
  it('is deterministic and trimming-stable', () => {
    const a = manualCaptureExternalId('https://e.com/a.jpg')
    const b = manualCaptureExternalId('  https://e.com/a.jpg  ')
    assert.equal(a, b)
    assert.match(a, /^manual:[0-9a-f]{32}$/)
  })

  it('differs for different URLs', () => {
    assert.notEqual(
      manualCaptureExternalId('https://e.com/a.jpg'),
      manualCaptureExternalId('https://e.com/b.jpg'),
    )
  })
})

describe('buildManualCaptureCandidates', () => {
  it('drops invalid URLs and collapses duplicates', () => {
    const out = buildManualCaptureCandidates([
      'https://e.com/a.jpg',
      '  https://e.com/a.jpg  ', // dup after trim
      'https://e.com/page.html', // invalid
      'https://e.com/b.png',
      'garbage',
    ])
    assert.equal(out.length, 2)
    assert.deepEqual(
      out.map((c) => c.imageUrl).sort(),
      ['https://e.com/a.jpg', 'https://e.com/b.png'],
    )
    for (const c of out) {
      assert.equal(c.source, 'manual')
      assert.match(c.externalId, /^manual:[0-9a-f]{32}$/)
    }
  })

  it('returns an empty list when nothing is valid', () => {
    assert.deepEqual(buildManualCaptureCandidates(['x', 'https://e.com/y.html']), [])
  })
})
