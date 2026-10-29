import type { APIRequestContext, Page } from '@playwright/test'

interface RuntimeFeatures {
  geoCommunity: boolean
  geogamers: boolean
  describeGuess: boolean
}

export async function runtimeFeatures(
  request: APIRequestContext | Page['request'],
): Promise<RuntimeFeatures> {
  const response = await request.get('/api/features', { failOnStatusCode: false })
  if (!response.ok()) {
    return { geoCommunity: false, geogamers: false, describeGuess: false }
  }
  const body = (await response.json()) as { data?: Partial<RuntimeFeatures> }
  return {
    geoCommunity: body.data?.geoCommunity === true,
    geogamers: body.data?.geogamers === true,
    describeGuess: body.data?.describeGuess === true,
  }
}

export async function geoCommunityEnabled(
  request: APIRequestContext | Page['request'],
): Promise<boolean> {
  return (await runtimeFeatures(request)).geoCommunity
}
