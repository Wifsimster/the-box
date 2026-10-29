import { randomUUID } from 'node:crypto'
import type { GeoSourceConfig, GeoSourceName, MapPipelineStage } from '@the-box/types'
import { queueLogger } from '../../logger/logger.js'
import { geoMapRepository } from '../../repositories/geo-map.repository.js'
import { geoIngestAttemptRepository } from '../../repositories/geo-ingest-attempt.repository.js'
import { geoSourceConfigRepository } from '../../repositories/geo-source-config.repository.js'
import { geoPipelineStateRepository } from '../../repositories/geo-pipeline-state.repository.js'
import { geoQueue, type GeoJobData } from '../queues.js'
import { getState } from '../../redis/circuit-breaker.js'
import {
  emitGeoFetchProgress,
  emitGeoFetchGameDone,
} from '../../socket/socket.js'

const log = queueLogger.child({ worker: 'maps-pipeline' })

export interface MapsPipelineResult {
  gameId: number
  stage: MapPipelineStage
  enqueuedSource?: GeoSourceName
  reason?: string
}

export async function runMapsPipeline(input: {
  gameId: number
  correlationId?: string
}): Promise<MapsPipelineResult> {
  const { gameId } = input
  const correlationId = input.correlationId ?? randomUUID()

  let state = await geoPipelineStateRepository.findByGameId(gameId)
  if (!state) {
    state = await geoPipelineStateRepository.upsert({
      gameId,
      currentStage: 'queued',
    })
  }

  if (state.currentStage === 'awaiting_curation') {
    log.debug({ gameId }, 'awaiting curation; nothing to do')
    return { gameId, stage: 'awaiting_curation' }
  }
  if (state.currentStage === 'ready') {
    return { gameId, stage: 'ready' }
  }

  if (
    state.currentStage === 'blocked' &&
    state.nextEligibleAt &&
    new Date(state.nextEligibleAt).getTime() > Date.now()
  ) {
    return { gameId, stage: 'blocked', reason: 'cooldown' }
  }

  const enabledMaps = await geoMapRepository.listEnabledByGameId(gameId)
  const hasMap = enabledMaps.length > 0
  const targetKind = hasMap ? 'candidates' : 'map'

  const sources = await geoSourceConfigRepository.listByKind(targetKind)
  const chosen = await pickNextSource(gameId, sources)

  if (!chosen) {
    return await advanceWhenExhausted(gameId, hasMap)
  }

  const stage: MapPipelineStage = targetKind === 'map' ? 'fetching_map' : 'fetching_candidates'
  await geoPipelineStateRepository.upsert({
    gameId,
    currentStage: stage,
    activeSource: chosen.source,
    lastAttemptAt: new Date(),
  })

  const childKind = `maps:fetch-from-${chosen.source}` as const
  const jobId = `maps-fetch-from-${chosen.source}-${gameId}-${Math.floor(Date.now() / 1000)}`
  await geoQueue.add(
    childKind,
    { kind: childKind, gameId, correlationId } as GeoJobData,
    { jobId },
  )

  log.info(
    { gameId, source: chosen.source, stage, correlationId },
    'enqueued source child',
  )
  emitGeoFetchProgress({
    gameId,
    source: chosen.source,
    stage,
  })
  return { gameId, stage, enqueuedSource: chosen.source }
}

export async function advancePipeline(input: {
  gameId: number
  correlationId?: string
  delayMs?: number
}): Promise<void> {
  await geoQueue.add(
    'maps:pipeline',
    { kind: 'maps:pipeline', gameId: input.gameId, correlationId: input.correlationId },
    {
      delay: input.delayMs ?? 0,
      jobId: `maps-pipeline-${input.gameId}-${Math.floor(Date.now() / 1000)}`,
    },
  )
}

async function pickNextSource(
  gameId: number,
  sources: GeoSourceConfig[],
): Promise<GeoSourceConfig | null> {
  for (const source of sources) {
    if (source.source === 'manual') continue

    const cb = await getState(source.source)
    if (cb === 'open') {
      log.debug({ gameId, source: source.source }, 'skip source: circuit open')
      continue
    }

    const inCooldown = await geoIngestAttemptRepository.isInCooldown(
      gameId,
      source.source,
      source.cooldownSecondsOnEmpty,
    )
    if (inCooldown) {
      log.debug({ gameId, source: source.source }, 'skip source: cooldown')
      continue
    }

    return source
  }
  return null
}

async function advanceWhenExhausted(
  gameId: number,
  hasMap: boolean,
): Promise<MapsPipelineResult> {
  if (!hasMap) {
    await geoPipelineStateRepository.upsert({
      gameId,
      currentStage: 'blocked',
      activeSource: null,
      nextEligibleAt: new Date(Date.now() + 30 * 60_000),
    })
    log.info({ gameId }, 'pipeline blocked: no map source available')
    return { gameId, stage: 'blocked', reason: 'no-map-source' }
  }

  await geoPipelineStateRepository.upsert({
    gameId,
    currentStage: 'awaiting_curation',
    activeSource: null,
    needsCuration: true,
  })
  await geoPipelineStateRepository.recomputeZoneCounts(gameId)
  const refreshed = await geoPipelineStateRepository.findByGameId(gameId)
  emitGeoFetchGameDone({
    gameId,
    mapsFound: refreshed?.zonesCovered ?? 0,
    zonesTotal: refreshed?.zonesTotal ?? 0,
    finalStage: 'awaiting_curation',
  })
  log.info({ gameId }, 'pipeline → awaiting_curation')
  return { gameId, stage: 'awaiting_curation' }
}
