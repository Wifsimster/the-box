import { randomBytes } from 'node:crypto'
import { getRedis } from '../redis/redis.client.js'
import { repoLogger } from '../logger/logger.js'
import { geoGamersChallengeRepository } from './geogamers-challenge.repository.js'
import { geoScreenshotRepository } from './geo-screenshot.repository.js'
import { gameRepository } from './game.repository.js'
import type { GeoGamersParty } from '@the-box/types'
import type { PartyRoundContent } from '../../domain/services/geogamers-party.service.js'

const log = repoLogger.child({ repository: 'geogamers-party' })

// Party state is ephemeral — a 2h TTL is plenty for a session and keeps stale
// lobbies from accumulating (no cron needed; Redis expires them).
const PARTY_TTL_SECONDS = 2 * 60 * 60
const KEY = (code: string) => `geogamers:party:${code}`

// Unambiguous invite-code alphabet (no 0/O/1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePartyCode(): string {
  const bytes = randomBytes(6)
  let code = ''
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  return code
}

export const geoGamersPartyStore = {
  async get(code: string): Promise<GeoGamersParty | null> {
    const raw = await getRedis().get(KEY(code))
    return raw ? (JSON.parse(raw) as GeoGamersParty) : null
  },

  // Persist and refresh the TTL. Party mutations always go through the pure
  // state machine, then save() writes the new snapshot.
  async save(party: GeoGamersParty): Promise<void> {
    await getRedis().set(KEY(party.code), JSON.stringify(party), 'EX', PARTY_TTL_SECONDS)
  },

  // Reserve a fresh, unused code and persist the initial party.
  async create(party: Omit<GeoGamersParty, 'code'>): Promise<GeoGamersParty> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generatePartyCode()
      // NX: only set if the code is free, so two hosts can't collide.
      const ok = await getRedis().set(
        KEY(code),
        JSON.stringify({ ...party, code }),
        'EX',
        PARTY_TTL_SECONDS,
        'NX',
      )
      if (ok) return { ...party, code }
    }
    throw new Error('could not allocate a unique party code')
  },

  async delete(code: string): Promise<void> {
    await getRedis().del(KEY(code))
  },
}

/**
 * Resolve `count` round contents from the eligible pool. `listEligibleMetas`
 * excludes every screenshot that has EVER been a daily challenge, so party
 * content can never leak (or be used to scout) the ranked daily. Returns fewer
 * than `count` only if the pool is too small.
 */
export async function resolvePartyRoundContents(count: number): Promise<PartyRoundContent[]> {
  const eligible = await geoGamersChallengeRepository.listEligibleMetas({})
  if (eligible.length === 0) return []

  // Shuffle (Fisher–Yates) and take up to `count` distinct metas.
  const pool = [...eligible]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  const chosen = pool.slice(0, count)

  const contents: PartyRoundContent[] = []
  for (const { metaId } of chosen) {
    const meta = await geoScreenshotRepository.findMetaById(metaId)
    if (!meta) continue
    const candidate = await geoScreenshotRepository.findCandidateById(meta.geoScreenshotCandidateId)
    if (!candidate) continue
    const game = await gameRepository.findById(candidate.gameId)
    if (!game) continue
    contents.push({
      geoScreenshotMetaId: meta.id,
      gameId: candidate.gameId,
      gameName: game.name,
      geoMapId: meta.geoMapId,
      canonical: meta.canonical,
    })
  }
  log.debug({ requested: count, resolved: contents.length }, 'resolved party round contents')
  return contents
}

// Server-only lookup for the party image proxy: the underlying asset URL for a
// round's screenshot (never sent to clients — streamed through the proxy).
export async function resolvePartyRoundImage(metaId: number): Promise<string | null> {
  const meta = await geoScreenshotRepository.findMetaById(metaId)
  if (!meta) return null
  const candidate = await geoScreenshotRepository.findCandidateById(meta.geoScreenshotCandidateId)
  return candidate?.imageUrl ?? null
}
