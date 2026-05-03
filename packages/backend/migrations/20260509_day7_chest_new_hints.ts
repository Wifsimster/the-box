import type { Knex } from 'knex'

// Expand the day-7 legendary chest with the two new hint types added to
// the powerup catalog (hint_developer + hint_genre). Day-4 and earlier
// rows are intentionally NOT touched: changing what mid-cycle users
// receive on a day they may currently be on shifts a live reward economy.
// Day-7 expansion is purely additive value.
//
// The reward_value column is JSONB; we read the existing payload, append
// the new items, and write back. If the row was customized in some env
// (e.g. test fixtures that already include the new items), we de-dup on
// `key` so reruns are idempotent.

interface DayChestItem {
  key: string
  quantity: number
}

interface DayChestPayload {
  items: DayChestItem[]
  points: number
}

function mergeItems(
  existing: DayChestItem[],
  additions: DayChestItem[]
): DayChestItem[] {
  const merged = new Map<string, number>()
  for (const item of existing) {
    merged.set(item.key, (merged.get(item.key) ?? 0) + item.quantity)
  }
  for (const item of additions) {
    if (!merged.has(item.key)) {
      merged.set(item.key, item.quantity)
    }
    // If the key already exists (rerun), keep the existing quantity —
    // we are not stacking additions on top of additions.
  }
  return Array.from(merged.entries()).map(([key, quantity]) => ({
    key,
    quantity,
  }))
}

export async function up(knex: Knex): Promise<void> {
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

  const additions: DayChestItem[] = [
    { key: 'hint_developer', quantity: 1 },
    { key: 'hint_genre', quantity: 1 },
  ]

  const next: DayChestPayload = {
    items: mergeItems(current.items ?? [], additions),
    points: current.points,
  }

  await knex('daily_login_rewards')
    .where({ day_number: 7 })
    .update({
      reward_value: JSON.stringify(next),
      // Refresh the description so the modal preview matches the contents.
      description:
        'Le coffre ultime: 2x indices année/éditeur, 1x indices développeur/genre, 500 points',
    })
}

export async function down(knex: Knex): Promise<void> {
  // Restore the pre-migration day-7 chest contents. Idempotent on rerun
  // since we replace, not stack.
  const original: DayChestPayload = {
    items: [
      { key: 'hint_year', quantity: 2 },
      { key: 'hint_publisher', quantity: 2 },
    ],
    points: 500,
  }
  await knex('daily_login_rewards')
    .where({ day_number: 7 })
    .update({
      reward_value: JSON.stringify(original),
      description: 'Le coffre ultime: 2x chaque indice + 500 points!',
    })
}
