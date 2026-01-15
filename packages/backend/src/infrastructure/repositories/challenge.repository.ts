import { db } from '../database/connection.js'

export interface ChallengeRow {
  id: number
  challenge_date: string
  created_at: Date
}

export interface TierRow {
  id: number
  daily_challenge_id: number
  tier_number: number
  name: string
  time_limit_seconds: number
}

export interface TierScreenshotRow {
  position: number
  bonus_multiplier: string
  screenshot_id: number
  image_url: string
}

export const challengeRepository = {
  async findById(id: number): Promise<ChallengeRow | null> {
    return await db('daily_challenges')
      .where('id', id)
      .first<ChallengeRow>()
  },

  async findByDate(date: string): Promise<ChallengeRow | null> {
    return await db('daily_challenges')
      .where('challenge_date', date)
      .first<ChallengeRow>()
  },

  async findTiersByChallenge(challengeId: number): Promise<TierRow[]> {
    return await db('tiers')
      .where('daily_challenge_id', challengeId)
      .orderBy('tier_number', 'asc')
      .select<TierRow[]>('*')
  },

  async findTierById(tierId: number): Promise<TierRow | null> {
    return await db('tiers').where('id', tierId).first<TierRow>()
  },

  async findTierByNumber(challengeId: number, tierNumber: number): Promise<TierRow | null> {
    return await db('tiers')
      .where('daily_challenge_id', challengeId)
      .andWhere('tier_number', tierNumber)
      .first<TierRow>()
  },

  async findScreenshotAtPosition(tierId: number, position: number): Promise<TierScreenshotRow | null> {
    const row = await db('tier_screenshots')
      .join('screenshots', 'tier_screenshots.screenshot_id', 'screenshots.id')
      .where('tier_screenshots.tier_id', tierId)
      .andWhere('tier_screenshots.position', position)
      .select<TierScreenshotRow>(
        'tier_screenshots.position',
        'tier_screenshots.bonus_multiplier',
        'screenshots.id as screenshot_id',
        'screenshots.image_url'
      )
      .first()
    return row ?? null
  },

  async findAll(): Promise<ChallengeRow[]> {
    return await db('daily_challenges')
      .orderBy('challenge_date', 'desc')
      .select<ChallengeRow[]>('*')
  },

  async create(challengeDate: string): Promise<ChallengeRow> {
    const [row] = await db('daily_challenges')
      .insert({ challenge_date: challengeDate })
      .returning<ChallengeRow[]>('*')
    return row!
  },

  async createTier(data: {
    dailyChallengeId: number
    tierNumber: number
    name: string
    timeLimitSeconds: number
  }): Promise<TierRow> {
    const [row] = await db('tiers')
      .insert({
        daily_challenge_id: data.dailyChallengeId,
        tier_number: data.tierNumber,
        name: data.name,
        time_limit_seconds: data.timeLimitSeconds,
      })
      .returning<TierRow[]>('*')
    return row!
  },

  async createTierScreenshots(tierId: number, screenshotIds: number[]): Promise<void> {
    const data = screenshotIds.map((screenshotId, index) => ({
      tier_id: tierId,
      screenshot_id: screenshotId,
      position: index + 1,
    }))
    await db('tier_screenshots').insert(data)
  },

  async deleteTierScreenshots(tierId: number): Promise<number> {
    return await db('tier_screenshots')
      .where('tier_id', tierId)
      .del()
  },
}
