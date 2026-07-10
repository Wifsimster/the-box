import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createParty,
  joinParty,
  leaveParty,
  startParty,
  submitGameGuess,
  submitLocation,
  allConnectedDone,
  revealRound,
  advanceRound,
  scoreboard,
  PartyError,
  PARTY_MAX_PLAYERS,
  type PartyRoundContent,
} from './geogamers-party.service.js'
import type { GeoGamersPartyConfig } from '@the-box/types'

const CONFIG: GeoGamersPartyConfig = { rounds: 3, timerSeconds: 45 }

function content(i: number): PartyRoundContent {
  return {
    geoScreenshotMetaId: 100 + i,
    gameId: 10 + i,
    gameName: `Game ${i}`,
    geoMapId: 900 + i,
    canonical: { x: 0.5, y: 0.5 },
  }
}
const CONTENTS = [content(0), content(1), content(2)]

function lobbyOf2() {
  let p = createParty({ code: 'ABCDEF', host: { id: 'h', name: 'Host' }, config: CONFIG, nowMs: 0 })
  p = joinParty(p, { id: 'p2', name: 'Bob' })
  return p
}

describe('party lobby', () => {
  it('creates a lobby with the host', () => {
    const p = createParty({ code: 'ABCDEF', host: { id: 'h', name: 'Host' }, config: CONFIG, nowMs: 0 })
    assert.equal(p.status, 'lobby')
    assert.equal(p.players.length, 1)
    assert.equal(p.players[0]!.isHost, true)
    assert.equal(p.currentRound, -1)
  })

  it('normalizes an invalid config', () => {
    const p = createParty({ code: 'X', host: { id: 'h', name: 'H' }, config: { rounds: 7, timerSeconds: 99 }, nowMs: 0 })
    assert.equal(p.config.rounds, 5)
    assert.equal(p.config.timerSeconds, 45)
  })

  it('caps the lobby at 4 players', () => {
    let p = createParty({ code: 'X', host: { id: 'h', name: 'H' }, config: CONFIG, nowMs: 0 })
    p = joinParty(p, { id: 'a', name: 'A' })
    p = joinParty(p, { id: 'b', name: 'B' })
    p = joinParty(p, { id: 'c', name: 'C' })
    assert.equal(p.players.length, PARTY_MAX_PLAYERS)
    assert.throws(() => joinParty(p, { id: 'd', name: 'D' }), (e) => e instanceof PartyError && e.code === 'LOBBY_FULL')
  })

  it('treats a re-join by same id as reconnect (no duplicate)', () => {
    let p = lobbyOf2()
    p = joinParty(p, { id: 'p2', name: 'Bob2' })
    assert.equal(p.players.length, 2)
    assert.equal(p.players.find((x) => x.id === 'p2')!.name, 'Bob2')
  })

  it('removes a leaver in the lobby and migrates host', () => {
    let p = lobbyOf2()
    p = leaveParty(p, 'h')
    assert.equal(p.players.length, 1)
    assert.equal(p.hostId, 'p2')
    assert.equal(p.players[0]!.isHost, true)
  })
})

describe('party start', () => {
  it('requires content count to equal configured rounds', () => {
    const p = lobbyOf2()
    assert.throws(() => startParty(p, [content(0)]), (e) => e instanceof PartyError && e.code === 'ROUND_COUNT_MISMATCH')
  })

  it('loads round 0 and seeds results for all players', () => {
    const p = startParty(lobbyOf2(), CONTENTS)
    assert.equal(p.status, 'in_round')
    assert.equal(p.currentRound, 0)
    assert.equal(p.rounds.length, 3)
    assert.ok(p.rounds[0]!.results['h'])
    assert.ok(p.rounds[0]!.results['p2'])
    assert.equal(p.rounds[0]!.results['h']!.done, false)
  })
})

describe('party round play', () => {
  it('correct first guess locks 100 game points then a perfect pin → 200', () => {
    let p = startParty(lobbyOf2(), CONTENTS)
    p = submitGameGuess(p, 'h', true)
    assert.equal(p.rounds[0]!.results['h']!.gamePoints, 100)
    assert.equal(p.rounds[0]!.results['h']!.solvedGame, true)
    p = submitLocation(p, 'h', { x: 0.5, y: 0.5 }, 0, false)
    const r = p.rounds[0]!.results['h']!
    assert.equal(r.locationPoints, 100)
    assert.equal(r.totalPoints, 200)
    assert.equal(r.done, true)
  })

  it('rejects a location before phase 1 resolves', () => {
    let p = startParty(lobbyOf2(), CONTENTS)
    assert.throws(() => submitLocation(p, 'h', { x: 0.5, y: 0.5 }, 0, false), (e) => e instanceof PartyError && e.code === 'WRONG_PHASE')
  })

  it('three wrong guesses exhaust phase 1 to 0 but still allow a pin', () => {
    let p = startParty(lobbyOf2(), CONTENTS)
    p = submitGameGuess(p, 'h', false)
    p = submitGameGuess(p, 'h', false)
    p = submitGameGuess(p, 'h', false)
    assert.equal(p.rounds[0]!.results['h']!.gamePoints, 0)
    p = submitLocation(p, 'h', { x: 0.5, y: 0.5 }, 0, false)
    assert.equal(p.rounds[0]!.results['h']!.totalPoints, 100)
  })

  it('rejects a second phase-1 guess after solving', () => {
    let p = startParty(lobbyOf2(), CONTENTS)
    p = submitGameGuess(p, 'h', true)
    assert.throws(() => submitGameGuess(p, 'h', false), (e) => e instanceof PartyError && e.code === 'WRONG_PHASE')
  })

  it('wrong map floors location to ~0', () => {
    let p = startParty(lobbyOf2(), CONTENTS)
    p = submitGameGuess(p, 'h', true)
    p = submitLocation(p, 'h', { x: 0.5, y: 0.5 }, 0, true)
    assert.ok(p.rounds[0]!.results['h']!.locationPoints! <= 1)
  })
})

describe('party round transitions', () => {
  it('allConnectedDone flips only when every connected player is done', () => {
    let p = startParty(lobbyOf2(), CONTENTS)
    p = submitGameGuess(p, 'h', true)
    p = submitLocation(p, 'h', { x: 0.5, y: 0.5 }, 0, false)
    assert.equal(allConnectedDone(p), false)
    p = submitGameGuess(p, 'p2', true)
    p = submitLocation(p, 'p2', { x: 0.5, y: 0.5 }, 0.1, false)
    assert.equal(allConnectedDone(p), true)
  })

  it('reveal force-times-out stragglers and marks the round revealed', () => {
    let p = startParty(lobbyOf2(), CONTENTS)
    p = submitGameGuess(p, 'h', true)
    p = submitLocation(p, 'h', { x: 0.5, y: 0.5 }, 0, false)
    // p2 never played
    p = revealRound(p)
    assert.equal(p.status, 'reveal')
    assert.equal(p.rounds[0]!.revealed, true)
    assert.equal(p.rounds[0]!.results['p2']!.done, true)
    assert.equal(p.rounds[0]!.results['p2']!.totalPoints, 0)
  })

  it('advances through all rounds then finishes', () => {
    let p = startParty(lobbyOf2(), CONTENTS)
    for (let i = 0; i < 3; i++) {
      p = submitGameGuess(p, 'h', true)
      p = submitLocation(p, 'h', { x: 0.5, y: 0.5 }, 0, false)
      p = submitGameGuess(p, 'p2', true)
      p = submitLocation(p, 'p2', { x: 0.5, y: 0.5 }, 0.5, false)
      p = revealRound(p)
      p = advanceRound(p)
    }
    assert.equal(p.status, 'finished')
  })

  it('advanceRound is rejected outside the reveal screen', () => {
    const p = startParty(lobbyOf2(), CONTENTS)
    assert.throws(() => advanceRound(p), (e) => e instanceof PartyError && e.code === 'NOT_REVEAL')
  })
})

describe('party scoreboard', () => {
  it('accumulates revealed-round totals and ranks players', () => {
    let p = startParty(lobbyOf2(), CONTENTS)
    // Round 0: host 200, p2 100
    p = submitGameGuess(p, 'h', true)
    p = submitLocation(p, 'h', { x: 0.5, y: 0.5 }, 0, false)
    p = submitGameGuess(p, 'p2', true)
    p = submitLocation(p, 'p2', { x: 0.5, y: 0.5 }, 1, false) // ~0 location → 100 total
    p = revealRound(p)
    const board = scoreboard(p)
    assert.equal(board[0]!.playerId, 'h')
    assert.equal(board[0]!.total, 200)
    assert.equal(board[1]!.playerId, 'p2')
    assert.equal(board[1]!.total, 100)
  })

  it('excludes an unrevealed in-progress round from the scoreboard', () => {
    let p = startParty(lobbyOf2(), CONTENTS)
    p = submitGameGuess(p, 'h', true)
    p = submitLocation(p, 'h', { x: 0.5, y: 0.5 }, 0, false)
    // not revealed yet
    assert.equal(scoreboard(p).find((s) => s.playerId === 'h')!.total, 0)
  })
})

describe('party disconnect mid-game', () => {
  it('keeps a disconnected player (scores persist) and lets the round close', () => {
    let p = startParty(lobbyOf2(), CONTENTS)
    p = submitGameGuess(p, 'h', true)
    p = submitLocation(p, 'h', { x: 0.5, y: 0.5 }, 0, false)
    p = leaveParty(p, 'p2') // disconnect mid-round
    assert.equal(p.players.length, 2)
    assert.equal(p.players.find((x) => x.id === 'p2')!.connected, false)
    // now all CONNECTED players (just host) are done
    assert.equal(allConnectedDone(p), true)
  })
})
