import type { APIRequestContext, Page } from '@playwright/test'

/**
 * Runtime feature flags, read from the endpoint that exists for exactly this
 * purpose: `GET /api/features`.
 *
 * Specs used to infer "is geo on?" by probing `/api/geo/games` and treating
 * any status under 500 as "the router is up". That inference broke when
 * `GEO_COMMUNITY_ENABLED` started defaulting to `false`: the community routes
 * are then not mounted at all and the API answers a JSON **404**, which the
 * old probe read as "geo is available" — so the suite ran against a surface
 * that no longer exists.
 *
 * Ask the server what is enabled instead of guessing from a status code.
 */

interface RuntimeFeatures {
  geoCommunity: boolean
  geogamers: boolean
}

export async function runtimeFeatures(
  request: APIRequestContext | Page['request'],
): Promise<RuntimeFeatures> {
  const response = await request.get('/api/features', { failOnStatusCode: false })
  if (!response.ok()) {
    // An older backend has no /api/features. Treat both surfaces as off:
    // skipping is the safe answer, since running would assert against
    // endpoints we have no evidence exist.
    return { geoCommunity: false, geogamers: false }
  }
  const body = (await response.json()) as { data?: Partial<RuntimeFeatures> }
  return {
    geoCommunity: body.data?.geoCommunity === true,
    geogamers: body.data?.geogamers === true,
  }
}

/** True when the community geo surface (`/api/geo`, free play, contribute) is mounted. */
export async function geoCommunityEnabled(
  request: APIRequestContext | Page['request'],
): Promise<boolean> {
  return (await runtimeFeatures(request)).geoCommunity
}
