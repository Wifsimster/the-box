import type { Knex } from 'knex'

// Masked-title letter-reveal hint (`hint_letter`).
//
// 1. `position_letter_reveals` — reveal state per (tier_session, position),
//    modeled on `position_second_chances`. We store only the integer count
//    plus the cumulative penalty percent locked in at reveal time; the
//    masked string itself is recomputed server-side as a pure function of
//    (gameName, letters_revealed), so the row can never leak the title.
//    `applied_to_guess_id` mirrors the second-chance flow: NULL until the
//    accrued penalty has been deducted from a correct guess, then stamped
//    so a later guess on the slot can't re-deduct.
//
// 2. Day-7 legendary chest — additively gains `hint_letter ×1` as its new
//    marquee item. Same `mergeItems` idempotent pattern as
//    20260509_day7_chest_new_hints: existing keys keep their quantity on
//    rerun, earlier days are untouched (live reward economy).

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('position_letter_reveals', (table) => {
    table.bigIncrements('id').primary()
    // tier_sessions.id is uuid in the existing schema; mirror that here.
    table.uuid('tier_session_id').notNullable()
    table.integer('position').notNullable()
    table.integer('letters_revealed').notNullable().defaultTo(0)
    table.integer('penalty_pct').notNullable().defaultTo(0)
    table.timestamp('last_revealed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.bigInteger('applied_to_guess_id').nullable()

    table.unique(['tier_session_id', 'position'], {
      indexName: 'position_letter_reveals_session_pos_uniq',
    })
    table.index(['tier_session_id'], 'position_letter_reveals_session_idx')
  })

  await upgradeDay7Chest(knex)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('position_letter_reveals')
  await downgradeDay7Chest(knex)
}

interface DayChestItem {
  key: string
  quantity: number
}

interface DayChestPayload {
  items: DayChestItem[]
  points: number
}

function mergeItems(existing: DayChestItem[], additions: DayChestItem[]): DayChestItem[] {
  const merged = new Map<string, number>()
  for (const item of existing) {
    merged.set(item.key, (merged.get(item.key) ?? 0) + item.quantity)
  }
  for (const item of additions) {
    if (!merged.has(item.key)) {
      merged.set(item.key, item.quantity)
    }
    // Existing key on rerun keeps its quantity — additions never stack.
  }
  return Array.from(merged.entries()).map(([key, quantity]) => ({ key, quantity }))
}

async function upgradeDay7Chest(knex: Knex): Promise<void> {
  const row = await knex<{ id: number; reward_value: DayChestPayload | string }>(
    'daily_login_rewards'
  )
    .where({ day_number: 7 })
    .first()

  if (!row) {
    // Fresh DB without seed yet — nothing to upgrade.
    return
  }

  const current: DayChestPayload =
    typeof row.reward_value === 'string'
      ? (JSON.parse(row.reward_value) as DayChestPayload)
      : row.reward_value

  const next: DayChestPayload = {
    items: mergeItems(current.items ?? [], [{ key: 'hint_letter', quantity: 1 }]),
    points: current.points,
  }

  await knex('daily_login_rewards')
    .where({ day_number: 7 })
    .update({
      reward_value: JSON.stringify(next),
      description:
        "Le coffre ultime: 1x révélation de lettre, 2x indices année/éditeur, 1x indices développeur/genre, 500 points",
    })
}

async function downgradeDay7Chest(knex: Knex): Promise<void> {
  const row = await knex<{ id: number; reward_value: DayChestPayload | string }>(
    'daily_login_rewards'
  )
    .where({ day_number: 7 })
    .first()

  if (!row) return

  const current: DayChestPayload =
    typeof row.reward_value === 'string'
      ? (JSON.parse(row.reward_value) as DayChestPayload)
      : row.reward_value

  const next: DayChestPayload = {
    items: (current.items ?? []).filter((item) => item.key !== 'hint_letter'),
    points: current.points,
  }

  await knex('daily_login_rewards')
    .where({ day_number: 7 })
    .update({
      reward_value: JSON.stringify(next),
      description:
        'Le coffre ultime: 2x indices année/éditeur, 1x indices développeur/genre, 500 points',
    })
}
