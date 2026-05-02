import type { GeoMap } from '@the-box/types'
import { fetchAdminJson } from './admin'

// ===== Wire types =====
// These mirror the response shapes from /api/admin/geo-fetch/*. Keep
// them aligned with packages/backend/src/presentation/routes/geo-fetch.routes.ts.

export type GeoFetchStage =
  | 'queued'
  | 'fetching_map'
  | 'fetching_candidates'
  | 'awaiting_curation'
  | 'ready'
  | 'blocked'

export interface GeoFetchStatus {
  counts: Record<GeoFetchStage, number>
  total: number
}

export interface GeoFetchGameRow {
  game_id: number
  current_stage: GeoFetchStage
  active_source: string | null
  zones_total: number
  zones_covered: number
  zones_selected: number
  needs_curation: boolean
  last_attempt_at: string | null
  next_eligible_at: string | null
  updated_at: string
  name: string | null
  slug: string | null
}

export interface GeoFetchGamesPage {
  games: GeoFetchGameRow[]
  limit: number
  offset: number
}

export interface GeoFetchAttemptSummary {
  id: number
  source: string
  outcome: string
  attemptedAt: string
  itemsIngested: number
}

export interface GeoFetchGameDetail {
  state: {
    gameId: number
    currentStage: GeoFetchStage
    activeSource?: string
    zonesTotal: number
    zonesCovered: number
    zonesSelected: number
    needsCuration: boolean
    lastAttemptAt?: string
    nextEligibleAt?: string
    updatedAt: string
  } | null
  recentAttempts: GeoFetchAttemptSummary[]
}

export interface GeoFetchZoneGroup {
  zoneSlug: string | null
  zoneName: string | null
  maps: Array<GeoMap & { isActive: boolean }>
}

export interface GeoFetchMapsResponse {
  zones: GeoFetchZoneGroup[]
}

// ===== API =====

export const geoFetchApi = {
  status: () => fetchAdminJson<GeoFetchStatus>('/api/admin/geo-fetch/status'),

  listGames: (params: { stage?: GeoFetchStage; search?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.stage) qs.set('stage', params.stage)
    if (params.search) qs.set('search', params.search)
    if (params.limit != null) qs.set('limit', String(params.limit))
    if (params.offset != null) qs.set('offset', String(params.offset))
    const path = `/api/admin/geo-fetch/games${qs.toString() ? `?${qs}` : ''}`
    return fetchAdminJson<GeoFetchGamesPage>(path)
  },

  start: (input: { gameIds?: number[]; all?: boolean }) =>
    fetchAdminJson<{ totalGames: number }>('/api/admin/geo-fetch/start', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  cancel: () =>
    fetchAdminJson<{ removed: number }>('/api/admin/geo-fetch/cancel', { method: 'POST' }),

  detail: (gameId: number) =>
    fetchAdminJson<GeoFetchGameDetail>(`/api/admin/geo-fetch/${gameId}`),

  retry: (gameId: number) =>
    fetchAdminJson<{ ok: true }>(`/api/admin/geo-fetch/${gameId}/retry`, { method: 'POST' }),

  retrySource: (gameId: number, source: string) =>
    fetchAdminJson<{ ok: true }>(
      `/api/admin/geo-fetch/${gameId}/${source}/retry`,
      { method: 'POST' },
    ),

  maps: (gameId: number) =>
    fetchAdminJson<GeoFetchMapsResponse>(`/api/admin/geo-fetch/${gameId}/maps`),

  selectMap: (gameId: number, mapId: number) =>
    fetchAdminJson<{ map: GeoMap }>(
      `/api/admin/geo-fetch/${gameId}/maps/${mapId}/select`,
      { method: 'POST' },
    ),

  resetCooldown: (gameId: number) =>
    fetchAdminJson<{ ok: true }>(`/api/admin/geo-fetch/${gameId}/cooldown`, {
      method: 'DELETE',
    }),
}
