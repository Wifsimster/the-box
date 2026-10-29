import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('position_letter_reveals', (table) => {
    table.bigIncrements('id').primary()
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
