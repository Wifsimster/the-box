import type { Knex } from 'knex'

// New, additive "Geolocation" game mode. All tables are prefixed `geo_` and
// reference existing tables (games, screenshots, user) read-only. No existing
// schema is modified.

export async function up(knex: Knex): Promise<void> {
    // Reference map per game (e.g. a Fandom wiki world map for Elden Ring).
    // Coordinates in all downstream tables are normalized [0..1] against this
    // map's dimensions, so a map asset swap doesn't invalidate data.
    await knex.schema.createTable('geo_map', (table) => {
        table.increments('id').primary()
        table.integer('game_id').notNullable().references('id').inTable('games').onDelete('CASCADE')
        table.string('source', 50).notNullable().comment('fandom | steam | manual')
        table.string('source_url', 1000).nullable()
        table.string('image_url', 1000).notNullable()
        table.integer('width_px').notNullable()
        table.integer('height_px').notNullable()
        table.float('consensus_radius').notNullable().defaultTo(0.03).comment('Max normalized distance for consensus acceptance')
        table.string('license', 100).notNullable().comment('e.g. CC-BY-SA-3.0')
        table.string('attribution', 500).nullable()
        table.boolean('is_active').notNullable().defaultTo(true)
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.index('game_id')
        table.unique(['game_id', 'image_url'])
    })

    // Ingested-but-unlabeled screenshots awaiting crowdsourced pins.
    // May reference an existing `screenshots` row if imported from the main
    // pipeline, else carries its own image_url (e.g. from Steam).
    await knex.schema.createTable('geo_screenshot_candidate', (table) => {
        table.increments('id').primary()
        table.integer('game_id').notNullable().references('id').inTable('games').onDelete('CASCADE')
        table.integer('geo_map_id').notNullable().references('id').inTable('geo_map').onDelete('CASCADE')
        table.integer('screenshot_id').nullable().references('id').inTable('screenshots').onDelete('SET NULL')
        table.string('image_url', 1000).notNullable()
        table.string('thumbnail_url', 1000).nullable()
        table.string('source', 50).notNullable().comment('steam | rawg | manual')
        table.string('external_id', 255).nullable().comment('Upstream ID for dedup')
        table.string('status', 30).notNullable().defaultTo('pending').comment('pending | collecting | promoted | rejected')
        table.integer('pin_count').notNullable().defaultTo(0)
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.index('game_id')
        table.index('status')
        table.unique(['source', 'external_id'])
    })

    // Canonical, playable geo screenshots. One row per screenshot once consensus
    // (or admin override) establishes ground-truth coordinates.
    await knex.schema.createTable('geo_screenshot_meta', (table) => {
        table.increments('id').primary()
        table.integer('geo_screenshot_candidate_id').notNullable().unique().references('id').inTable('geo_screenshot_candidate').onDelete('CASCADE')
        table.integer('geo_map_id').notNullable().references('id').inTable('geo_map').onDelete('CASCADE')
        table.float('canonical_x').notNullable().comment('[0..1] of map width')
        table.float('canonical_y').notNullable().comment('[0..1] of map height')
        table.float('confidence').notNullable().defaultTo(0).comment('[0..1] cluster tightness or admin=1.0')
        table.integer('consensus_version').notNullable().defaultTo(1)
        table.string('promoted_via', 30).notNullable().comment('consensus | admin')
        table.text('promoted_by').nullable().references('id').inTable('user').onDelete('SET NULL')
        table.timestamp('promoted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.index('geo_map_id')
    })

    await knex.schema.createTable('geo_challenge', (table) => {
        table.increments('id').primary()
        table.date('challenge_date').notNullable()
        table.integer('geo_screenshot_meta_id').notNullable().references('id').inTable('geo_screenshot_meta').onDelete('RESTRICT')
        table.integer('tier').notNullable().defaultTo(1)
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.unique(['challenge_date', 'tier'])
        table.index('challenge_date')
    })

    await knex.schema.createTable('geo_guess', (table) => {
        table.increments('id').primary()
        table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
        table.integer('geo_challenge_id').notNullable().references('id').inTable('geo_challenge').onDelete('CASCADE')
        table.float('x').notNullable()
        table.float('y').notNullable()
        table.float('distance').notNullable().comment('Normalized [0..1] distance to canonical')
        table.integer('score').notNullable()
        table.integer('score_version').notNullable().defaultTo(1).comment('Bump on formula retune for fairness')
        table.integer('duration_ms').nullable()
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.unique(['user_id', 'geo_challenge_id'])
        table.index('geo_challenge_id')
    })

    // Parallel to the main leaderboard tables; never merged into them.
    await knex.schema.createTable('geo_leaderboard_daily', (table) => {
        table.increments('id').primary()
        table.date('challenge_date').notNullable()
        table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
        table.integer('score').notNullable()
        table.integer('rank').nullable()
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.unique(['challenge_date', 'user_id'])
        table.index(['challenge_date', 'score'])
    })

    await knex.schema.createTable('geo_leaderboard_monthly', (table) => {
        table.increments('id').primary()
        table.string('period', 7).notNullable().comment('YYYY-MM')
        table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
        table.integer('score').notNullable()
        table.integer('rank').nullable()
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.unique(['period', 'user_id'])
        table.index(['period', 'score'])
    })

    // Crowdsourced pin contributions. One row per (user, candidate). Consensus
    // worker reads these in batches; reward worker reacts on acceptance.
    await knex.schema.createTable('geo_pin_submission', (table) => {
        table.increments('id').primary()
        table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
        table.integer('geo_screenshot_candidate_id').notNullable().references('id').inTable('geo_screenshot_candidate').onDelete('CASCADE')
        table.float('x').notNullable()
        table.float('y').notNullable()
        table.string('status', 20).notNullable().defaultTo('pending').comment('pending | accepted | rejected')
        table.float('distance_from_centroid').nullable()
        table.timestamp('reviewed_at', { useTz: true }).nullable()
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.unique(['user_id', 'geo_screenshot_candidate_id'])
        table.index(['geo_screenshot_candidate_id', 'status'])
        table.index(['user_id', 'status'])
    })

    await knex.schema.createTable('geo_contributor_stats', (table) => {
        table.text('user_id').primary().references('id').inTable('user').onDelete('CASCADE')
        table.string('tier', 20).notNullable().defaultTo('bronze').comment('bronze | silver | gold | diamond')
        table.integer('total_submitted').notNullable().defaultTo(0)
        table.integer('total_accepted').notNullable().defaultTo(0)
        table.integer('total_rejected').notNullable().defaultTo(0)
        table.float('accuracy').notNullable().defaultTo(0).comment('accepted / submitted')
        table.boolean('shadow_banned').notNullable().defaultTo(false)
        table.timestamp('tier_promoted_at', { useTz: true }).nullable()
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.index('tier')
    })

    // Tunable tier cutoffs so product can retune without a migration.
    await knex.schema.createTable('geo_contributor_tier_threshold', (table) => {
        table.string('tier', 20).primary()
        table.integer('min_accepted').notNullable()
        table.float('min_accuracy').notNullable().comment('[0..1]')
        table.integer('display_order').notNullable()
    })

    await knex('geo_contributor_tier_threshold').insert([
        { tier: 'bronze', min_accepted: 1, min_accuracy: 0.3, display_order: 1 },
        { tier: 'silver', min_accepted: 25, min_accuracy: 0.5, display_order: 2 },
        { tier: 'gold', min_accepted: 100, min_accuracy: 0.65, display_order: 3 },
        { tier: 'diamond', min_accepted: 500, min_accuracy: 0.8, display_order: 4 },
    ])
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('geo_contributor_tier_threshold')
    await knex.schema.dropTableIfExists('geo_contributor_stats')
    await knex.schema.dropTableIfExists('geo_pin_submission')
    await knex.schema.dropTableIfExists('geo_leaderboard_monthly')
    await knex.schema.dropTableIfExists('geo_leaderboard_daily')
    await knex.schema.dropTableIfExists('geo_guess')
    await knex.schema.dropTableIfExists('geo_challenge')
    await knex.schema.dropTableIfExists('geo_screenshot_meta')
    await knex.schema.dropTableIfExists('geo_screenshot_candidate')
    await knex.schema.dropTableIfExists('geo_map')
}
