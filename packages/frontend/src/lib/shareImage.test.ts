import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSharePayload,
  canShareFile,
  dailyCardFileName,
  dailyCardUrl,
  shareWithOptionalImage,
  type ShareNavigator,
} from './shareImage'

const card = () => new File([new Uint8Array([137, 80, 78, 71])], 'the-box-2026-10-10.png', { type: 'image/png' })

function fakeNav(opts: { canShare?: boolean; failWith?: Array<string | null> } = {}) {
  const calls: ShareData[] = []
  const failures = [...(opts.failWith ?? [])]
  const nav: ShareNavigator = {
    share: async (data) => {
      calls.push(data)
      const name = failures.shift()
      if (name) {
        const err = new Error(name)
        err.name = name
        throw err
      }
    },
  }
  if (opts.canShare !== undefined) nav.canShare = () => opts.canShare!
  return { nav, calls }
}

describe('dailyCard helpers', () => {
  test('card URL targets the OG PNG with date and lang', () => {
    assert.equal(dailyCardUrl('2026-10-10', 'fr'), '/api/og/daily.png?date=2026-10-10&lang=fr')
  })

  test('file name carries the date', () => {
    assert.equal(dailyCardFileName('2026-10-10'), 'the-box-2026-10-10.png')
  })
})

describe('canShareFile', () => {
  test('false without navigator, share or canShare', () => {
    assert.equal(canShareFile(undefined, card()), false)
    assert.equal(canShareFile({ canShare: () => true }, card()), false)
    assert.equal(canShareFile(fakeNav().nav, card()), false)
  })

  test('follows canShare and survives a throwing canShare', () => {
    assert.equal(canShareFile(fakeNav({ canShare: true }).nav, card()), true)
    assert.equal(canShareFile(fakeNav({ canShare: false }).nav, card()), false)
    const throwing: ShareNavigator = { share: async () => {}, canShare: () => { throw new TypeError('x') } }
    assert.equal(canShareFile(throwing, card()), false)
  })
})

describe('buildSharePayload', () => {
  test('attaches the card when the browser accepts files', () => {
    const file = card()
    const payload = buildSharePayload('txt', file, fakeNav({ canShare: true }).nav)
    assert.deepEqual(payload, { title: 'The Box', text: 'txt', files: [file] })
  })

  test('text only when files are not shareable or the card is missing', () => {
    assert.deepEqual(buildSharePayload('txt', card(), fakeNav({ canShare: false }).nav), { title: 'The Box', text: 'txt' })
    assert.deepEqual(buildSharePayload('txt', null, fakeNav({ canShare: true }).nav), { title: 'The Box', text: 'txt' })
  })
})

describe('shareWithOptionalImage', () => {
  test('shares the card in one call', async () => {
    const { nav, calls } = fakeNav({ canShare: true })
    assert.equal(await shareWithOptionalImage(nav, 'txt', card()), 'shared')
    assert.equal(calls.length, 1)
    assert.equal(calls[0]!.files?.length, 1)
  })

  test('falls back to text when the file share is refused', async () => {
    const { nav, calls } = fakeNav({ canShare: true, failWith: ['NotAllowedError'] })
    assert.equal(await shareWithOptionalImage(nav, 'txt', card()), 'shared')
    assert.equal(calls.length, 2)
    assert.deepEqual(calls[1], { title: 'The Box', text: 'txt' })
  })

  test('a cancel is not retried', async () => {
    const { nav, calls } = fakeNav({ canShare: true, failWith: ['AbortError'] })
    assert.equal(await shareWithOptionalImage(nav, 'txt', card()), 'cancelled')
    assert.equal(calls.length, 1)
  })

  test('text-only failure reports failed without retry', async () => {
    const { nav, calls } = fakeNav({ failWith: ['NotAllowedError'] })
    assert.equal(await shareWithOptionalImage(nav, 'txt', card()), 'failed')
    assert.equal(calls.length, 1)
  })

  test('no share function reports failed', async () => {
    assert.equal(await shareWithOptionalImage({}, 'txt', null), 'failed')
  })
})
