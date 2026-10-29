import type { Knex } from 'knex'

const GAME = {
  name: 'Elden Ring',
  slug: 'elden-ring',
  aliases: ['ER'],
  release_year: 2022,
  developer: 'FromSoftware',
  publisher: 'Bandai Namco Entertainment',
  genres: ['RPG', 'Action'],
  platforms: ['PC', 'PlayStation', 'Xbox'],
  metacritic: 96,
  rawg_id: 326243,
}

const MAP = {
  source: 'fandom',
  source_url: 'https://eldenring.fandom.com/wiki/Interactive_Map',
  image_url: 'https://static.wikia.nocookie.net/eldenring/images/map-placeholder.jpg',
  width_px: 1600,
  height_px: 900,
  consensus_radius: 0.03,
  license: 'CC-BY-SA-3.0',
  attribution: 'eldenring.fandom.com — Interactive Map',
}

const SEED_POINTS = [
  { x: 0.25, y: 0.35, label: 'Limgrave' },
  { x: 0.55, y: 0.42, label: 'Liurnia' },
  { x: 0.48, y: 0.62, label: 'Caelid' },
  { x: 0.72, y: 0.28, label: 'Altus Plateau' },
  { x: 0.62, y: 0.78, label: 'Mountaintops' },
]

export async function seed(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('[geo-seed] skipped: NODE_ENV=production')
    return
  }

  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  let game = await knex('games').where({ slug: GAME.slug }).first<{ id: number }>()
  if (!game) {
    const inserted = await knex('games')
      .insert({
        ...GAME,
        created_at: now,
      })
      .returning<{ id: number }[]>('id')
    game = inserted[0]!
    console.log(`[geo-seed] created game ${GAME.name} (id=${game.id})`)
  } else {
    console.log(`[geo-seed] game ${GAME.name} already exists (id=${game.id})`)
  }

  let map = await knex('geo_map')
    .where({ game_id: game.id, is_active: true })
    .first<{ id: number }>()
  if (!map) {
    const inserted = await knex('geo_map')
      .insert({
        game_id: game.id,
        source: MAP.source,
        source_url: MAP.source_url,
        image_url: MAP.image_url,
        width_px: MAP.width_px,
        height_px: MAP.height_px,
        consensus_radius: MAP.consensus_radius,
        license: MAP.license,
        attribution: MAP.attribution,
        is_active: true,
        is_capture_default: true,
        created_at: now,
      })
      .returning<{ id: number }[]>('id')
    map = inserted[0]!
    console.log(`[geo-seed] created geo_map id=${map.id}`)
  }

  const metaIds: number[] = []
  for (let i = 0; i < SEED_POINTS.length; i++) {
    const point = SEED_POINTS[i]!
    const externalId = `seed:elden-ring:${i + 1}`

    let candidate = await knex('geo_screenshot_candidate')
      .where({ source: 'manual', external_id: externalId })
      .first<{ id: number }>()

    if (!candidate) {
      const inserted = await knex('geo_screenshot_candidate')
        .insert({
          game_id: game.id,
          geo_map_id: map.id,
          image_url: `https://placehold.co/1280x720?text=${encodeURIComponent(point.label)}`,
          thumbnail_url: `https://placehold.co/320x180?text=${encodeURIComponent(point.label)}`,
          source: 'manual',
          external_id: externalId,
          status: 'promoted',
          pin_count: 0,
          created_at: now,
        })
        .returning<{ id: number }[]>('id')
      candidate = inserted[0]!
    }

    let meta = await knex('geo_screenshot_meta')
      .where({ geo_screenshot_candidate_id: candidate.id })
      .first<{ id: number }>()

    if (!meta) {
      const inserted = await knex('geo_screenshot_meta')
        .insert({
          geo_screenshot_candidate_id: candidate.id,
          geo_map_id: map.id,
          canonical_x: point.x,
          canonical_y: point.y,
          confidence: 1.0,
          consensus_version: 1,
          promoted_via: 'admin',
          promoted_at: now,
        })
        .returning<{ id: number }[]>('id')
      meta = inserted[0]!
    }

    metaIds.push(meta.id)
  }

  console.log(`[geo-seed] seeded ${metaIds.length} canonical screenshots`)

  const existingChallenge = await knex('geo_challenge')
    .where({ challenge_date: today, tier: 1 })
    .first<{ id: number }>()

  if (!existingChallenge && metaIds[0]) {
    await knex('geo_challenge').insert({
      challenge_date: today,
      geo_screenshot_meta_id: metaIds[0],
      tier: 1,
      created_at: now,
    })
    console.log(`[geo-seed] created today's challenge for ${today}`)
  } else if (existingChallenge) {
    console.log(`[geo-seed] today's challenge already exists (id=${existingChallenge.id})`)
  }
}
