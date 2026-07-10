import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { GeoGamersParty, GeoGamersPartyView, GeoPoint } from '@the-box/types'
import { logger } from '../logger/logger.js'
import { getSocketSession } from './socket.js'
import {
  geoGamersPartyStore,
  resolvePartyRoundContents,
} from '../repositories/geogamers-party.store.js'
import { geoMapRepository } from '../repositories/geo-map.repository.js'
import { createFuzzyMatchService } from '../../domain/services/fuzzy-match.service.js'
import { geoDistance } from '../../domain/services/geo-scoring.service.js'
import {
  createParty,
  joinParty,
  leaveParty,
  startParty,
  submitGameGuess,
  submitLocation,
  revealRound,
  advanceRound,
  allConnectedDone,
  scoreboard,
  PartyError,
  PARTY_MAX_PLAYERS,
} from '../../domain/services/geogamers-party.service.js'

const log = logger.child({ module: 'geogamers-party-socket' })
// Local fuzzy matcher (avoids importing the queue-backed services barrel).
const fuzzyMatch = createFuzzyMatchService({ logger: log })

const NS = '/geogamers-party'
const room = (code: string) => `party:${code}`

// Party clients may be guests. Identity: authed user id, else a stable
// per-socket guest id. Name comes from the join payload or the account.
interface PartyIdentity {
  playerId: string
  name: string
}

function isPoint(p: unknown): p is GeoPoint {
  const q = p as GeoPoint
  return !!q && typeof q.x === 'number' && typeof q.y === 'number' &&
    q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1
}

// Build the spectator-safe view for a specific player. Answers (game identity,
// canonical pin) are withheld while a round is in progress; the locate-phase
// map + game name are revealed only once THIS player has resolved phase 1.
async function buildView(party: GeoGamersParty, playerId: string): Promise<GeoGamersPartyView> {
  const view: GeoGamersPartyView = {
    code: party.code,
    status: party.status,
    config: party.config,
    hostId: party.hostId,
    players: party.players,
    currentRound: party.currentRound,
    totalRounds: party.rounds.length,
    scoreboard: scoreboard(party).map((s) => ({ playerId: s.playerId, name: s.name, total: s.total })),
  }

  if (party.status === 'in_round') {
    const round = party.rounds[party.currentRound]
    if (round) {
      const result = round.results[playerId]
      const resolved = !!result && (result.solvedGame || result.attemptsUsed >= 3)
      view.you = {
        attemptsUsed: result?.attemptsUsed ?? 0,
        resolvedPhase1: resolved,
        done: result?.done ?? false,
      }
      view.round = {
        index: round.index,
        screenshotUrl: `/api/geogamers/party/${party.code}/round/${round.index}/image`,
      }
      if (resolved) {
        view.round.gameName = round.gameName
        const maps = await geoMapRepository.listEnabledByGameId(round.gameId)
        view.round.maps = maps.map((m) => ({
          id: m.id,
          region: m.region,
          imageUrl: m.imageUrl,
          widthPx: m.widthPx,
          heightPx: m.heightPx,
          kind: m.kind,
          tiles: m.tiles,
        }))
      }
    }
  }

  if (party.status === 'reveal' || party.status === 'finished') {
    const round = party.rounds[party.currentRound]
    if (round) {
      view.reveal = {
        index: round.index,
        gameName: round.gameName,
        canonical: round.canonical,
        pins: party.players.map((p) => {
          const r = round.results[p.id]
          return { playerId: p.id, name: p.name, guess: r?.guess ?? null, points: r?.totalPoints ?? 0 }
        }),
      }
    }
  }

  return view
}

// Broadcast a per-player tailored view to each socket in the room (each may see
// a different locate-phase reveal state), so we emit individually.
async function broadcast(io: SocketIOServer, party: GeoGamersParty): Promise<void> {
  await geoGamersPartyStore.save(party)
  const ns = io.of(NS)
  const sockets = await ns.in(room(party.code)).fetchSockets()
  for (const s of sockets) {
    const pid = (s.data as { playerId?: string }).playerId
    if (!pid) continue
    s.emit('party:state', await buildView(party, pid))
  }
}

export function ensureGeoGamersPartyNamespace(io: SocketIOServer): void {
  const ns = io.of(NS)
  if ((ns as unknown as { _wired?: boolean })._wired) return

  ns.use(async (socket, next) => {
    // Resolve identity once. Guests allowed: fall back to a per-socket id.
    const session = await getSocketSession(socket)
    const playerId = session?.user?.id ?? `guest_${socket.id}`
    const name = session?.user?.name ?? 'Invité'
    socket.data = { ...(socket.data ?? {}), playerId, name } satisfies PartyIdentity & Record<string, unknown>
    next()
  })

  ns.on('connection', (socket: Socket) => {
    const id = () => socket.data as PartyIdentity

    const safe = (fn: () => Promise<void>) =>
      fn().catch((err) => {
        const code = err instanceof PartyError ? err.code : 'ERROR'
        socket.emit('party:error', { code, message: String(err instanceof Error ? err.message : err) })
      })

    socket.on('party:create', (payload: { rounds?: number; timerSeconds?: number; name?: string }) =>
      safe(async () => {
        const { playerId, name } = id()
        const created = await geoGamersPartyStore.create(
          createParty({
            code: '', // replaced by the store's reserved code
            host: { id: playerId, name: payload.name || name },
            config: { rounds: payload.rounds ?? 5, timerSeconds: payload.timerSeconds ?? 45 },
            nowMs: Date.now(),
          }),
        )
        socket.join(room(created.code))
        socket.emit('party:created', { code: created.code })
        await broadcast(io, created)
      }),
    )

    socket.on('party:join', (payload: { code: string; name?: string }) =>
      safe(async () => {
        const { playerId, name } = id()
        const party = await geoGamersPartyStore.get(payload.code)
        if (!party) {
          socket.emit('party:error', { code: 'NOT_FOUND', message: 'party not found' })
          return
        }
        if (party.players.length >= PARTY_MAX_PLAYERS && !party.players.some((p) => p.id === playerId)) {
          socket.emit('party:error', { code: 'LOBBY_FULL', message: 'lobby full' })
          return
        }
        const next = joinParty(party, { id: playerId, name: payload.name || name })
        socket.join(room(payload.code))
        await broadcast(io, next)
      }),
    )

    socket.on('party:start', (payload: { code: string }) =>
      safe(async () => {
        const { playerId } = id()
        const party = await geoGamersPartyStore.get(payload.code)
        if (!party) return
        if (party.hostId !== playerId) {
          socket.emit('party:error', { code: 'NOT_HOST', message: 'only the host can start' })
          return
        }
        const contents = await resolvePartyRoundContents(party.config.rounds)
        if (contents.length < party.config.rounds) {
          socket.emit('party:error', { code: 'NOT_ENOUGH_CONTENT', message: 'not enough content' })
          return
        }
        await broadcast(io, startParty(party, contents))
      }),
    )

    socket.on('party:guess_game', (payload: { code: string; guess: string }) =>
      safe(async () => {
        const { playerId } = id()
        const party = await geoGamersPartyStore.get(payload.code)
        if (!party || party.status !== 'in_round') return
        const round = party.rounds[party.currentRound]
        if (!round) return
        const correct = fuzzyMatch.evaluateMatch(String(payload.guess ?? ''), round.gameName).matched
        const next = submitGameGuess(party, playerId, correct)
        socket.emit('party:guess_result', { correct })
        await maybeAdvanceAndBroadcast(io, next)
      }),
    )

    socket.on('party:guess_location', (payload: { code: string; geoMapId: number; guess: GeoPoint }) =>
      safe(async () => {
        const { playerId } = id()
        const party = await geoGamersPartyStore.get(payload.code)
        if (!party || party.status !== 'in_round') return
        const round = party.rounds[party.currentRound]
        if (!round || !isPoint(payload.guess)) return
        const wrongMap = payload.geoMapId !== round.geoMapId
        const distance = wrongMap ? 1 : geoDistance(payload.guess, round.canonical)
        const next = submitLocation(party, playerId, payload.guess, distance, wrongMap)
        await maybeAdvanceAndBroadcast(io, next)
      }),
    )

    // Host advances from the reveal screen to the next round / finish.
    socket.on('party:advance', (payload: { code: string }) =>
      safe(async () => {
        const { playerId } = id()
        const party = await geoGamersPartyStore.get(payload.code)
        if (!party || party.status !== 'reveal') return
        if (party.hostId !== playerId) return
        await broadcast(io, advanceRound(party))
      }),
    )

    socket.on('party:leave', (payload: { code: string }) =>
      safe(async () => {
        const { playerId } = id()
        const party = await geoGamersPartyStore.get(payload.code)
        if (!party) return
        socket.leave(room(payload.code))
        await broadcast(io, leaveParty(party, playerId))
      }),
    )

    socket.on('disconnect', () => {
      log.debug({ socketId: socket.id }, 'party client disconnected')
    })
  })
  ;(ns as unknown as { _wired?: boolean })._wired = true
}

// After a play action, auto-close the round when everyone connected is done.
async function maybeAdvanceAndBroadcast(io: SocketIOServer, party: GeoGamersParty): Promise<void> {
  const next = allConnectedDone(party) ? revealRound(party) : party
  await broadcast(io, next)
}
