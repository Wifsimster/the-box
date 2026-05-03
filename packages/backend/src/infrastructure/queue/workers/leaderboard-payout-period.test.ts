import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { priorMonthLabel } from './leaderboard-payout-period.js'

describe('priorMonthLabel', () => {
    it('returns the previous month for a mid-month date', () => {
        const out = priorMonthLabel(new Date(Date.UTC(2026, 4, 15, 12, 0, 0)))
        assert.equal(out.year, 2026)
        assert.equal(out.month, 4)
        assert.equal(out.label, '2026-04')
    })

    it('returns December of prior year for a January date', () => {
        const out = priorMonthLabel(new Date(Date.UTC(2026, 0, 1, 0, 30, 0)))
        assert.equal(out.year, 2025)
        assert.equal(out.month, 12)
        assert.equal(out.label, '2025-12')
    })

    it('returns the same prior month regardless of UTC time within day 1', () => {
        // Cron fires at 00:30 UTC on the 1st; verify the boundary.
        const earlyFirst = priorMonthLabel(new Date(Date.UTC(2026, 5, 1, 0, 30, 0)))
        const lateFirst = priorMonthLabel(new Date(Date.UTC(2026, 5, 1, 23, 59, 59)))
        assert.deepEqual(earlyFirst, lateFirst)
        assert.equal(earlyFirst.label, '2026-05')
    })

    it('pads single-digit months with a leading zero', () => {
        const out = priorMonthLabel(new Date(Date.UTC(2026, 3, 5, 0, 0, 0)))
        assert.equal(out.label, '2026-03')
    })

    it('handles December → November of same year', () => {
        const out = priorMonthLabel(new Date(Date.UTC(2026, 11, 1, 0, 30, 0)))
        assert.equal(out.year, 2026)
        assert.equal(out.month, 11)
        assert.equal(out.label, '2026-11')
    })
})
