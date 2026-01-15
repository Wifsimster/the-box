import type { Knex } from 'knex'

/**
 * Select random screenshots from the database.
 * For test seeds, we'll use any available screenshots.
 */
async function selectRandomScreenshots(knex: Knex, count: number): Promise<number[]> {
  const result = await knex('screenshots')
    .where('is_active', true)
    .count('id as count')
    .first<{ count: string | number }>()

  const available = Number(result?.count ?? 0)

  if (available === 0) {
    console.warn('No screenshots available in database. Please run import-sample-data.ts first.')
    return []
  }

  console.log(`Found ${available} screenshots, need ${count}`)

  if (available >= count) {
    const rows = await knex('screenshots')
      .where('is_active', true)
      .orderByRaw('RANDOM()')
      .limit(count)
      .pluck<number[]>('id')
    return rows
  }

  // Not enough unique screenshots - allow reuse
  console.warn('Not enough unique screenshots, allowing reuse')
  const allIds = await knex('screenshots')
    .where('is_active', true)
    .pluck<number[]>('id')

  const selected: number[] = []
  while (selected.length < count) {
    const shuffled = [...allIds].sort(() => Math.random() - 0.5)
    const needed = count - selected.length
    selected.push(...shuffled.slice(0, needed))
  }
  return selected.slice(0, count)
}

export async function seed(knex: Knex): Promise<void> {
  // Create challenges for today and past days (up to 17 days for admin history)
  const today = new Date()
  const dates: string[] = []
  
  // Create dates for the past 17 days (today + 16 past days)
  for (let i = 0; i < 17; i++) {
    const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000)
    dates.push(date.toISOString().split('T')[0]!)
  }

  for (const challengeDate of dates) {
    // Check if challenge already exists
    const existing = await knex('daily_challenges')
      .where('challenge_date', challengeDate)
      .first()

    if (existing) {
      console.log(`Challenge already exists for ${challengeDate} (ID: ${existing.id}), skipping`)
      continue
    }

    // Select 10 random screenshots
    const screenshotIds = await selectRandomScreenshots(knex, 10)
    if (screenshotIds.length === 0) {
      console.warn(`No screenshots available for challenge ${challengeDate}, skipping`)
      continue
    }

    console.log(`Creating challenge for ${challengeDate} with ${screenshotIds.length} screenshots`)

    // Create challenge
    const [challenge] = await knex('daily_challenges')
      .insert({ challenge_date: challengeDate, is_active: true })
      .returning<Array<{ id: number }>>('id')
    console.log(`Created challenge ID: ${challenge.id}`)

    // Create tier
    const [tier] = await knex('tiers')
      .insert({
        daily_challenge_id: challenge.id,
        tier_number: 1,
        name: 'Daily Challenge',
        time_limit_seconds: 30,
      })
      .returning<Array<{ id: number }>>('id')
    console.log(`Created tier ID: ${tier.id}`)

    // Assign screenshots
    const tierScreenshotData = screenshotIds.map((screenshotId, index) => ({
      tier_id: tier.id,
      screenshot_id: screenshotId,
      position: index + 1,
      bonus_multiplier: 1.0,
    }))
    await knex('tier_screenshots').insert(tierScreenshotData)
    console.log(`Assigned ${screenshotIds.length} screenshots to tier`)

    console.log(`✓ Challenge created for ${challengeDate}`)
  }

  console.log('✓ Daily challenges seed completed')
}
