import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { reactivationBucket, isHoldoutUser } from './reactivation-bucket.js'
import {
    REACTIVATION_COPY_BAN_LIST,
    buildReactivationEmail,
} from '../../email/reactivation-email.js'

describe('reactivationBucket', () => {
    it('is deterministic per user_id', () => {
        const a = reactivationBucket('user-abc')
        const b = reactivationBucket('user-abc')
        assert.equal(a, b)
    })

    it('returns a value in [0, 99]', () => {
        for (const id of ['a', 'user-1', 'a-very-long-uuid-12345-67890', '🚀-emoji-id']) {
            const v = reactivationBucket(id)
            assert.ok(v >= 0 && v < 100, `expected 0-99, got ${v} for ${id}`)
        }
    })

    it('produces a holdout share roughly equal to HOLDOUT_PERCENT (10%)', () => {
        // With 5 000 randomly-generated user ids the empirical share should
        // sit comfortably inside ±2pp of 10% (binomial std-dev at this n
        // is ~0.4pp). If this ever flakes, the hash is broken.
        let holdoutCount = 0
        const N = 5000
        for (let i = 0; i < N; i++) {
            const id = `synthetic-user-${i}-${Math.random().toString(36).slice(2)}`
            if (isHoldoutUser(id)) holdoutCount++
        }
        const share = (holdoutCount / N) * 100
        assert.ok(share >= 8 && share <= 12, `expected 8-12% holdout, got ${share.toFixed(2)}%`)
    })

    it('isHoldoutUser is consistent with reactivationBucket < 10', () => {
        for (const id of ['user-1', 'user-2', 'user-3', 'user-4', 'user-5']) {
            const expected = reactivationBucket(id) < 10
            assert.equal(isHoldoutUser(id), expected, `disagreement for ${id}`)
        }
    })
})

describe('reactivation email copy', () => {
    const playUrl = 'https://thebox.example/fr/play'

    for (const locale of ['fr', 'en'] as const) {
        it(`${locale} copy is free of ban-listed words and patterns`, () => {
            const { subject, html, text } = buildReactivationEmail({
                locale,
                playUrl,
            })
            const corpus = [subject, html, text].join('\n').toLowerCase()
            for (const banned of REACTIVATION_COPY_BAN_LIST[locale]) {
                assert.ok(
                    !corpus.includes(banned.toLowerCase()),
                    `${locale} copy contains forbidden token "${banned}". The reactivation tone is invitation, not loss-aversion — see PRD.`
                )
            }
        })

        it(`${locale} copy emits a CTA pointing to the play URL`, () => {
            const { html, text } = buildReactivationEmail({ locale, playUrl })
            assert.ok(html.includes(playUrl), `${locale} html should embed playUrl`)
            assert.ok(text.includes(playUrl), `${locale} text should include playUrl`)
        })

        it(`${locale} subject is declarative (no exclamation stacking, no question marks)`, () => {
            const { subject } = buildReactivationEmail({ locale, playUrl })
            assert.ok(
                !/!{2,}/.test(subject),
                `${locale} subject should not stack exclamation marks: "${subject}"`
            )
            assert.ok(
                !subject.includes('?'),
                `${locale} subject should be declarative, not interrogative-anxious: "${subject}"`
            )
        })
    }
})
