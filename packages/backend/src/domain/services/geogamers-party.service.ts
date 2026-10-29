import type {
  GeoGamersParty,
  GeoGamersPartyConfig,
  GeoGamersPartyPlayer,
  GeoGamersPartyRound,
  GeoGamersPartyRoundResult,
  GeoPoint,
} from '@the-box/types'
import {
  gamePointsForAttempt,
  locationPointsFromDistance,
  GEOGAMERS_ATTEMPTS_MAX,
} from './geogamers-scoring.service.js'

export const PARTY_MAX_PLAYERS = 4
export const PARTY_MIN_PLAYERS = 1
export const PARTY_ALLOWED_ROUNDS = [3, 5, 10] as const
export const PARTY_ALLOWED_TIMERS = [30, 45, 60] as const

export class PartyError extends Error {
  constructor(
    message: string,
    public code:
      | 'LOBBY_FULL'
      | 'NOT_LOBBY'
      | 'NOT_IN_ROUND'
      | 'NOT_REVEAL'
      | 'PLAYER_NOT_FOUND'
      | 'ALREADY_DONE'
      | 'WRONG_PHASE'
      | 'NO_PLAYERS'
      | 'NO_CONTENT'
      | 'ROUND_COUNT_MISMATCH'
      | 'INVALID_CONFIG',
  ) {
    super(message)
    this.name = 'PartyError'
  }
}

export interface PartyRoundContent {
  geoScreenshotMetaId: number
  gameId: number
  gameName: string
  geoMapId: number
  canonical: GeoPoint
}

function emptyResult(playerId: string): GeoGamersPartyRoundResult {
  return {
    playerId,
    attemptsUsed: 0,
    gamePoints: null,
    solvedGame: false,
    guess: null,
    locationPoints: null,
    totalPoints: null,
    done: false,
  }
}

function roundFromContent(index: number, content: PartyRoundContent): GeoGamersPartyRound {
  return {
    index,
    geoScreenshotMetaId: content.geoScreenshotMetaId,
    gameId: content.gameId,
    gameName: content.gameName,
    geoMapId: content.geoMapId,
    canonical: content.canonical,
    results: {},
    revealed: false,
  }
}

function normalizeConfig(config: GeoGamersPartyConfig): GeoGamersPartyConfig {
  const rounds = (PARTY_ALLOWED_ROUNDS as readonly number[]).includes(config.rounds)
    ? config.rounds
    : 5
  const timerSeconds = (PARTY_ALLOWED_TIMERS as readonly number[]).includes(config.timerSeconds)
    ? config.timerSeconds
    : 45
  return { rounds, timerSeconds }
}

export function createParty(input: {
  code: string
  host: { id: string; name: string }
  config: GeoGamersPartyConfig
  nowMs: number
}): GeoGamersParty {
  return {
    code: input.code,
    status: 'lobby',
    config: normalizeConfig(input.config),
    hostId: input.host.id,
    players: [{ id: input.host.id, name: input.host.name, isHost: true, connected: true }],
    currentRound: -1,
    rounds: [],
    createdAtMs: input.nowMs,
  }
}

export function joinParty(
  party: GeoGamersParty,
  player: { id: string; name: string },
): GeoGamersParty {
  const existing = party.players.find((p) => p.id === player.id)
  if (existing) {
    return {
      ...party,
      players: party.players.map((p) =>
        p.id === player.id ? { ...p, connected: true, name: player.name } : p,
      ),
    }
  }
  if (party.status !== 'lobby') throw new PartyError('game already started', 'NOT_LOBBY')
  if (party.players.length >= PARTY_MAX_PLAYERS) throw new PartyError('lobby full', 'LOBBY_FULL')
  const newPlayer: GeoGamersPartyPlayer = {
    id: player.id,
    name: player.name,
    isHost: false,
    connected: true,
  }
  return { ...party, players: [...party.players, newPlayer] }
}

export function leaveParty(party: GeoGamersParty, playerId: string): GeoGamersParty {
  const leaving = party.players.find((p) => p.id === playerId)
  if (!leaving) return party

  let players: GeoGamersPartyPlayer[]
  if (party.status === 'lobby') {
    players = party.players.filter((p) => p.id !== playerId)
  } else {
    players = party.players.map((p) => (p.id === playerId ? { ...p, connected: false } : p))
  }

  let hostId = party.hostId
  if (leaving.isHost) {
    const nextHost = players.find((p) => p.connected) ?? players[0]
    if (nextHost) {
      hostId = nextHost.id
      players = players.map((p) => ({ ...p, isHost: p.id === nextHost.id }))
    }
  }
  return { ...party, players, hostId }
}

export function startParty(party: GeoGamersParty, contents: PartyRoundContent[]): GeoGamersParty {
  if (party.status !== 'lobby') throw new PartyError('already started', 'NOT_LOBBY')
  if (party.players.length < PARTY_MIN_PLAYERS) throw new PartyError('no players', 'NO_PLAYERS')
  if (contents.length === 0) throw new PartyError('no round content', 'NO_CONTENT')
  if (contents.length !== party.config.rounds) {
    throw new PartyError('content count must equal configured rounds', 'ROUND_COUNT_MISMATCH')
  }
  const rounds = contents.map((c, i) => {
    const round = roundFromContent(i, c)
    return round
  })
  const first = seedResults(rounds[0]!, party.players)
  rounds[0] = first
  return { ...party, status: 'in_round', currentRound: 0, rounds }
}

function seedResults(round: GeoGamersPartyRound, players: GeoGamersPartyPlayer[]): GeoGamersPartyRound {
  const results = { ...round.results }
  for (const p of players) {
    if (!results[p.id]) results[p.id] = emptyResult(p.id)
  }
  return { ...round, results }
}

function currentRound(party: GeoGamersParty): GeoGamersPartyRound {
  if (party.status !== 'in_round') throw new PartyError('not in a round', 'NOT_IN_ROUND')
  const r = party.rounds[party.currentRound]
  if (!r) throw new PartyError('not in a round', 'NOT_IN_ROUND')
  return r
}

function withRound(party: GeoGamersParty, round: GeoGamersPartyRound): GeoGamersParty {
  const rounds = party.rounds.map((r) => (r.index === round.index ? round : r))
  return { ...party, rounds }
}

export function submitGameGuess(
  party: GeoGamersParty,
  playerId: string,
  correct: boolean,
): GeoGamersParty {
  const round = currentRound(party)
  const result = round.results[playerId]
  if (!result) throw new PartyError('player not in round', 'PLAYER_NOT_FOUND')
  if (result.done) throw new PartyError('already done this round', 'ALREADY_DONE')
  if (result.solvedGame || result.gamePoints !== null) {
    throw new PartyError('phase 1 already resolved', 'WRONG_PHASE')
  }
  const attemptsUsed = result.attemptsUsed + 1
  let gamePoints: number | null = result.gamePoints
  let solvedGame = result.solvedGame as boolean
  if (correct) {
    solvedGame = true
    gamePoints = gamePointsForAttempt(attemptsUsed)
  } else if (attemptsUsed >= GEOGAMERS_ATTEMPTS_MAX) {
    gamePoints = 0
  }
  const updated: GeoGamersPartyRoundResult = { ...result, attemptsUsed, gamePoints, solvedGame }
  return withRound(party, { ...round, results: { ...round.results, [playerId]: updated } })
}

export function submitLocation(
  party: GeoGamersParty,
  playerId: string,
  guess: GeoPoint,
  distance: number,
  wrongMap: boolean,
): GeoGamersParty {
  const round = currentRound(party)
  const result = round.results[playerId]
  if (!result) throw new PartyError('player not in round', 'PLAYER_NOT_FOUND')
  if (result.done) throw new PartyError('already done this round', 'ALREADY_DONE')
  const phase1Resolved = result.solvedGame || result.attemptsUsed >= GEOGAMERS_ATTEMPTS_MAX
  if (!phase1Resolved) throw new PartyError('identify the game first', 'WRONG_PHASE')

  const locationPoints = locationPointsFromDistance(wrongMap ? 1 : distance)
  const gamePoints = result.gamePoints ?? 0
  const updated: GeoGamersPartyRoundResult = {
    ...result,
    guess,
    locationPoints,
    gamePoints,
    totalPoints: gamePoints + locationPoints,
    done: true,
  }
  return withRound(party, { ...round, results: { ...round.results, [playerId]: updated } })
}

export function timeoutPlayer(party: GeoGamersParty, playerId: string): GeoGamersParty {
  const round = currentRound(party)
  const result = round.results[playerId]
  if (!result || result.done) return party
  const gamePoints = result.gamePoints ?? 0
  const locationPoints = result.locationPoints ?? 0
  const updated: GeoGamersPartyRoundResult = {
    ...result,
    gamePoints,
    locationPoints,
    totalPoints: gamePoints + locationPoints,
    done: true,
  }
  return withRound(party, { ...round, results: { ...round.results, [playerId]: updated } })
}

export function allConnectedDone(party: GeoGamersParty): boolean {
  if (party.status !== 'in_round') return false
  const round = party.rounds[party.currentRound]
  if (!round) return false
  const connected = party.players.filter((p) => p.connected)
  if (connected.length === 0) return false
  return connected.every((p) => round.results[p.id]?.done)
}

export function revealRound(party: GeoGamersParty): GeoGamersParty {
  if (party.status !== 'in_round') throw new PartyError('not in a round', 'NOT_IN_ROUND')
  let next = party
  const round = party.rounds[party.currentRound]!
  for (const p of party.players) {
    if (!round.results[p.id]?.done) next = timeoutPlayer(next, p.id)
  }
  const closed = next.rounds.map((r) =>
    r.index === party.currentRound ? { ...r, revealed: true } : r,
  )
  return { ...next, rounds: closed, status: 'reveal' }
}

export function advanceRound(party: GeoGamersParty): GeoGamersParty {
  if (party.status !== 'reveal') throw new PartyError('not on the reveal screen', 'NOT_REVEAL')
  const nextIndex = party.currentRound + 1
  if (nextIndex >= party.rounds.length) {
    return { ...party, status: 'finished' }
  }
  const seeded = seedResults(party.rounds[nextIndex]!, party.players)
  const rounds = party.rounds.map((r) => (r.index === nextIndex ? seeded : r))
  return { ...party, status: 'in_round', currentRound: nextIndex, rounds }
}

export function scoreboard(
  party: GeoGamersParty,
): Array<{ playerId: string; name: string; total: number }> {
  const totals = new Map<string, number>()
  for (const round of party.rounds) {
    if (!round.revealed) continue
    for (const r of Object.values(round.results)) {
      totals.set(r.playerId, (totals.get(r.playerId) ?? 0) + (r.totalPoints ?? 0))
    }
  }
  return party.players
    .map((p) => ({ playerId: p.id, name: p.name, total: totals.get(p.id) ?? 0 }))
    .sort((a, b) => b.total - a.total)
}
