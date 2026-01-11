import { db } from '../database/connection.js'
import type { ImportState, ImportStatus } from '@the-box/types'
import { repoLogger } from '../logger/logger.js'

const log = repoLogger.child({ repository: 'import-state' })

export interface ImportStateRow {
  id: number
  import_type: string
  status: ImportStatus
  batch_size: number
  min_metacritic: number
  screenshots_per_game: number
  total_games_available: number | null
  current_page: number
  last_processed_offset: number
  games_processed: number
  games_imported: number
  games_skipped: number
  screenshots_downloaded: number
  failed_count: number
  current_batch: number
  total_batches_estimated: number | null
  started_at: Date | null
  paused_at: Date | null
  resumed_at: Date | null
  completed_at: Date | null
  created_at: Date
  updated_at: Date
}

function mapRowToImportState(row: ImportStateRow): ImportState {
  return {
    id: row.id,
    importType: row.import_type,
    status: row.status,
    batchSize: row.batch_size,
    minMetacritic: row.min_metacritic,
    screenshotsPerGame: row.screenshots_per_game,
    totalGamesAvailable: row.total_games_available,
    currentPage: row.current_page,
    lastProcessedOffset: row.last_processed_offset,
    gamesProcessed: row.games_processed,
    gamesImported: row.games_imported,
    gamesSkipped: row.games_skipped,
    screenshotsDownloaded: row.screenshots_downloaded,
    failedCount: row.failed_count,
    currentBatch: row.current_batch,
    totalBatchesEstimated: row.total_batches_estimated,
    startedAt: row.started_at?.toISOString() ?? null,
    pausedAt: row.paused_at?.toISOString() ?? null,
    resumedAt: row.resumed_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export const importStateRepository = {
  async create(data: {
    batchSize?: number
    minMetacritic?: number
    screenshotsPerGame?: number
  }): Promise<ImportState> {
    log.info({ batchSize: data.batchSize, minMetacritic: data.minMetacritic }, 'create import state')
    const [row] = await db('import_states')
      .insert({
        batch_size: data.batchSize ?? 100,
        min_metacritic: data.minMetacritic ?? 70,
        screenshots_per_game: data.screenshotsPerGame ?? 3,
        status: 'pending',
      })
      .returning<ImportStateRow[]>('*')
    log.info({ importStateId: row!.id }, 'import state created')
    return mapRowToImportState(row!)
  },

  async findById(id: number): Promise<ImportState | null> {
    log.debug({ importStateId: id }, 'findById')
    const row = await db('import_states').where('id', id).first<ImportStateRow>()
    log.debug({ importStateId: id, found: !!row }, 'findById result')
    return row ? mapRowToImportState(row) : null
  },

  async findActive(): Promise<ImportState | null> {
    log.debug('findActive')
    const row = await db('import_states')
      .whereIn('status', ['pending', 'in_progress', 'paused'])
      .orderBy('created_at', 'desc')
      .first<ImportStateRow>()
    log.debug({ found: !!row, status: row?.status }, 'findActive result')
    return row ? mapRowToImportState(row) : null
  },

  async findAll(options?: {
    limit?: number
    offset?: number
  }): Promise<ImportState[]> {
    log.debug('findAll')
    let query = db('import_states').orderBy('created_at', 'desc')
    if (options?.limit) query = query.limit(options.limit)
    if (options?.offset) query = query.offset(options.offset)
    const rows = await query.select<ImportStateRow[]>('*')
    log.debug({ count: rows.length }, 'findAll result')
    return rows.map(mapRowToImportState)
  },

  async update(id: number, data: Partial<{
    status: ImportStatus
    totalGamesAvailable: number
    totalBatchesEstimated: number
    startedAt: Date
    pausedAt: Date
    resumedAt: Date
    completedAt: Date
  }>): Promise<ImportState | null> {
    log.info({ importStateId: id, fields: Object.keys(data) }, 'update import state')
    const updateData: Record<string, unknown> = { updated_at: new Date() }
    if (data.status !== undefined) updateData['status'] = data.status
    if (data.totalGamesAvailable !== undefined) updateData['total_games_available'] = data.totalGamesAvailable
    if (data.totalBatchesEstimated !== undefined) updateData['total_batches_estimated'] = data.totalBatchesEstimated
    if (data.startedAt !== undefined) updateData['started_at'] = data.startedAt
    if (data.pausedAt !== undefined) updateData['paused_at'] = data.pausedAt
    if (data.resumedAt !== undefined) updateData['resumed_at'] = data.resumedAt
    if (data.completedAt !== undefined) updateData['completed_at'] = data.completedAt

    const [row] = await db('import_states')
      .where('id', id)
      .update(updateData)
      .returning<ImportStateRow[]>('*')
    log.info({ importStateId: id, updated: !!row }, 'import state update result')
    return row ? mapRowToImportState(row) : null
  },

  async updateProgress(id: number, progress: {
    currentPage?: number
    lastProcessedOffset?: number
    gamesProcessed?: number
    gamesImported?: number
    gamesSkipped?: number
    screenshotsDownloaded?: number
    failedCount?: number
    currentBatch?: number
  }): Promise<ImportState | null> {
    log.debug({ importStateId: id, progress }, 'updateProgress')
    const updateData: Record<string, unknown> = { updated_at: new Date() }
    if (progress.currentPage !== undefined) updateData['current_page'] = progress.currentPage
    if (progress.lastProcessedOffset !== undefined) updateData['last_processed_offset'] = progress.lastProcessedOffset
    if (progress.gamesProcessed !== undefined) updateData['games_processed'] = progress.gamesProcessed
    if (progress.gamesImported !== undefined) updateData['games_imported'] = progress.gamesImported
    if (progress.gamesSkipped !== undefined) updateData['games_skipped'] = progress.gamesSkipped
    if (progress.screenshotsDownloaded !== undefined) updateData['screenshots_downloaded'] = progress.screenshotsDownloaded
    if (progress.failedCount !== undefined) updateData['failed_count'] = progress.failedCount
    if (progress.currentBatch !== undefined) updateData['current_batch'] = progress.currentBatch

    const [row] = await db('import_states')
      .where('id', id)
      .update(updateData)
      .returning<ImportStateRow[]>('*')
    return row ? mapRowToImportState(row) : null
  },

  async setStatus(id: number, status: ImportStatus): Promise<ImportState | null> {
    log.info({ importStateId: id, status }, 'setStatus')
    const updateData: Record<string, unknown> = { status, updated_at: new Date() }

    // Set appropriate timestamp based on status
    if (status === 'in_progress') {
      const current = await this.findById(id)
      if (current?.status === 'paused') {
        updateData['resumed_at'] = new Date()
      } else if (current?.status === 'pending') {
        updateData['started_at'] = new Date()
      }
    } else if (status === 'paused') {
      updateData['paused_at'] = new Date()
    } else if (status === 'completed' || status === 'failed') {
      updateData['completed_at'] = new Date()
    }

    const [row] = await db('import_states')
      .where('id', id)
      .update(updateData)
      .returning<ImportStateRow[]>('*')
    log.info({ importStateId: id, updated: !!row, newStatus: status }, 'setStatus result')
    return row ? mapRowToImportState(row) : null
  },

  async delete(id: number): Promise<void> {
    log.warn({ importStateId: id }, 'delete import state')
    await db('import_states').where('id', id).del()
    log.info({ importStateId: id }, 'import state deleted')
  },
}
