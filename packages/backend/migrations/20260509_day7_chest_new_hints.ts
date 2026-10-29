import type { Knex } from 'knex'

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
      description:
        'Le coffre ultime: 2x indices année/éditeur, 1x indices développeur/genre, 500 points',
    })
}

export async function down(knex: Knex): Promise<void> {
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
