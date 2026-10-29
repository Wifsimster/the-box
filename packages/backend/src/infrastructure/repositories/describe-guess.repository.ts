import type { DescribeGuessAdminEntry } from '@the-box/types'
import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { DescribeGameSheet } from '../../domain/ports/describe-judge.js'
import type {
  CandidatePools,
  CatalogueTitle,
  CataloguePort,
  DescribeAttemptPort,
  DescribeClaim,
  DescribeEvaluation,
} from '../../domain/services/describe-guess.service.js'

const log = repoLogger.child({ repository: 'describe-guess' })

const TABLE = 'describe_guess_attempts'
const SHEET_COLUMNS = [
  'games.id',
  'games.name',
  'games.aliases',
  'games.release_year',
  'games.developer',
  'games.publisher',
  'games.genres',
  'games.platforms',
] as const

const SERIES_POOL = 20
const GENRE_POOL = 40
const RANDOM_POOL = 40

interface GameSheetRow {
  id: number
  name: string
  aliases: string[] | null
  release_year: number | null
  developer: string | null
  publisher: string | null
  genres: string[] | null
  platforms: string[] | null
}

function toSheet(row: GameSheetRow): DescribeGameSheet {
  return {
    id: row.id,
    name: row.name,
    aliases: row.aliases ?? [],
    releaseYear: row.release_year,
    developer: row.developer,
    publisher: row.publisher,
    genres: row.genres ?? [],
    platforms: row.platforms ?? [],
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export type DescribeGuessAdminRow = DescribeGuessAdminEntry

export const describeGuessRepository: DescribeAttemptPort & {
  listRecent(options: { limit: number; offset: number }): Promise<{ entries: DescribeGuessAdminRow[]; total: number }>
} = {
  async findTargetSheet(screenshotId: number): Promise<DescribeGameSheet | null> {
    const row = await db('screenshots')
      .join('games', 'screenshots.game_id', 'games.id')
      .where('screenshots.id', screenshotId)
      .first<GameSheetRow | undefined>(...SHEET_COLUMNS)
    return row ? toSheet(row) : null
  },

  async findCandidatePools(target: DescribeGameSheet, seriesName: string | null): Promise<CandidatePools> {
    const sameSeriesQuery =
      seriesName && seriesName.length >= 3
        ? db('games')
            .whereNot('id', target.id)
            .andWhereRaw(`name ILIKE ? ESCAPE '\\'`, [`${escapeLike(seriesName)}%`])
            .orderByRaw('random()')
            .limit(SERIES_POOL)
            .select<GameSheetRow[]>(...SHEET_COLUMNS)
        : Promise.resolve([] as GameSheetRow[])

    const sameGenreQuery =
      target.genres.length > 0
        ? db('games')
            .whereNot('id', target.id)
            .andWhereRaw('genres && ?::text[]', [target.genres])
            .orderByRaw('random()')
            .limit(GENRE_POOL)
            .select<GameSheetRow[]>(...SHEET_COLUMNS)
        : Promise.resolve([] as GameSheetRow[])

    const randomQuery = db('games')
      .whereNot('id', target.id)
      .orderByRaw('random()')
      .limit(RANDOM_POOL)
      .select<GameSheetRow[]>(...SHEET_COLUMNS)

    const [sameSeries, sameGenre, random] = await Promise.all([
      sameSeriesQuery,
      sameGenreQuery,
      randomQuery,
    ])
    return {
      sameSeries: sameSeries.map(toSheet),
      sameGenre: sameGenre.map(toSheet),
      random: random.map(toSheet),
    }
  },

  async claim(claim: DescribeClaim): Promise<number | null> {
    const rows = await db(TABLE)
      .insert({
        user_id: claim.userId,
        is_guest: claim.isGuest,
        game_session_id: db('tier_sessions').select('game_session_id').where('id', claim.tierSessionId),
        tier_session_id: claim.tierSessionId,
        position: claim.position,
        screenshot_id: claim.screenshotId,
        target_game_id: claim.targetGameId,
        guess_text: claim.guessText,
        description: claim.description,
        locale: claim.locale,
        candidate_game_ids: [],
        model: claim.model,
        error: 'pending',
      })
      .onConflict(['tier_session_id', 'position'])
      .ignore()
      .returning<{ id: number }[]>('id')
    return rows[0]?.id ?? null
  },

  async complete(id: number, evaluation: DescribeEvaluation): Promise<void> {
    log.debug({ id }, 'complete describe-guess attempt')
    await db(TABLE)
      .where('id', id)
      .update({
        candidate_game_ids: evaluation.candidateGameIds,
        chosen_game_id: evaluation.chosenGameId,
        probability: evaluation.probability,
        accepted: evaluation.accepted,
        threshold: evaluation.threshold,
        title_prefilter_hit: evaluation.titlePrefilterHit,
        model: evaluation.model,
        latency_ms: evaluation.latencyMs,
        input_tokens: evaluation.inputTokens,
        output_tokens: evaluation.outputTokens,
        error: evaluation.error,
      })
  },

  async listRecent({ limit, offset }) {
    const [rows, countRow] = await Promise.all([
      db(`${TABLE} as d`)
        .leftJoin('games as t', 'd.target_game_id', 't.id')
        .leftJoin('games as c', 'd.chosen_game_id', 'c.id')
        .orderBy('d.created_at', 'desc')
        .orderBy('d.id', 'desc')
        .limit(limit)
        .offset(offset)
        .select(
          'd.id',
          'd.created_at',
          'd.guess_text',
          'd.description',
          'd.locale',
          'd.is_guest',
          'd.target_game_id',
          't.name as target_name',
          'd.chosen_game_id',
          'c.name as chosen_name',
          'd.probability',
          'd.accepted',
          'd.title_prefilter_hit',
          'd.model',
          'd.latency_ms',
          'd.error'
        ),
      db(TABLE).count<{ count: string }[]>('id as count').first(),
    ])
    return {
      total: Number(countRow?.count ?? 0),
      entries: rows.map((r: Record<string, unknown>) => ({
        id: r['id'] as number,
        createdAt: new Date(r['created_at'] as string | Date).toISOString(),
        guessText: r['guess_text'] as string,
        description: r['description'] as string,
        locale: r['locale'] as string,
        isGuest: r['is_guest'] as boolean,
        targetGameId: r['target_game_id'] as number,
        targetName: (r['target_name'] as string | null) ?? null,
        chosenGameId: (r['chosen_game_id'] as number | null) ?? null,
        chosenName: (r['chosen_name'] as string | null) ?? null,
        probability: (r['probability'] as number | null) ?? null,
        accepted: (r['accepted'] as boolean | null) ?? null,
        titlePrefilterHit: r['title_prefilter_hit'] as boolean,
        model: r['model'] as string,
        latencyMs: (r['latency_ms'] as number | null) ?? null,
        error: (r['error'] as string | null) ?? null,
      })),
    }
  },
}

const CATALOGUE_TTL_MS = 10 * 60_000
let catalogueCache: { titles: CatalogueTitle[]; loadedAt: number } | null = null

export const describeCatalogue: CataloguePort = {
  async listTitles(): Promise<CatalogueTitle[]> {
    if (catalogueCache && Date.now() - catalogueCache.loadedAt < CATALOGUE_TTL_MS) return catalogueCache.titles
    const rows = await db('games').select<Array<{ id: number; name: string; aliases: string[] | null }>>('id', 'name', 'aliases')
    const titles = rows.map((r) => ({ id: r.id, name: r.name, aliases: r.aliases ?? [] }))
    catalogueCache = { titles, loadedAt: Date.now() }
    return titles
  },
}
