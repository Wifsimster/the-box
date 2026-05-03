import type { Knex } from 'knex'

// "Equipped cosmetics" tracker. Owning a cosmetic lives in `user_inventory`
// (item_type='cosmetic'); equipping is a presentation-layer choice and
// belongs in its own table so updating it doesn't thrash the inventory
// row's `updated_at` (which BullMQ workers also write to).
//
// PK on (user_id, slot) enforces "one cosmetic per slot per user" without
// a service-layer counter. `slot` is a free string (not a Postgres enum)
// so adding a new cosmetic category later is a code-only change.
//
// `cosmetic_item_key` references `user_inventory.item_key` by value (no
// FK — the inventory has no surrogate id we'd want to anchor against).
// The service layer validates ownership at equip time.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_cosmetic_state', (table) => {
    table.string('user_id', 64).notNullable()
    // Known slots today: `avatar_frame`. Future: `name_title`,
    // `card_background`, `cursor_trail`, etc. Keep widths small — slot
    // names are short identifiers, not free text.
    table.string('slot', 32).notNullable()
    table.string('cosmetic_item_key', 100).notNullable()
    table.timestamp('equipped_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.primary(['user_id', 'slot'], { constraintName: 'user_cosmetic_state_pkey' })
    table.index(['user_id'], 'user_cosmetic_state_user_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_cosmetic_state')
}
