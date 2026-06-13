import type { Knex } from 'knex'

// Retire the four legacy metadata hints (hint_year / hint_publisher /
// hint_developer / hint_genre) and the dead `timer_extension` key from the
// economy, converting earned inventory into the letter-reveal currency.
//
//  1. `legacy_hint_retirement_log` — audit ledger. Every converted
//     inventory row and every rewritten calendar row is recorded here
//     BEFORE it changes, so support can answer "where did my hints go?"
//     and `down()` can restore state exactly.
//  2. Inventory conversion (atomic, single DELETE … RETURNING CTE so a
//     concurrent old replica can't double-spend mid-migration):
//       - the four legacy hint keys convert POOLED 2:1 into `hint_letter`
//         (CEIL, so any user who held at least one legacy hint gets at
//         least one letter),
//       - `timer_extension` converts 1:1 into `streak_freeze`.
//  3. Rewards-inbox announcement: one auto-unlocked `reward_grants` row
//     per converted user (source_ref `legacy-hint-sunset-2026-06`) so the
//     inbox shows an upgrade card. Announcement only — the inventory
//     upsert happens in the conversion CTE, NOT via the grant flow, so
//     there is no double-add.
//  4. Daily-login calendar + day-7 chest rewrite to the post-retirement
//     reward table (read-modify-write like 20260612, but each affected
//     row is snapshotted verbatim into the ledger first).
//
// ⚠ This migration DELIBERATELY OVERRIDES 20260509_day7_chest_new_hints'
// "never touch mid-cycle days" rule: days 1/2/4/5 of a live reward cycle
// are rewritten in place, per explicit PO directive. Decision record:
// tasks/legacy-hint-retirement-letter-dock-meeting.html (D1–D4).
//
// Idempotency: re-running up() is a no-op — the conversion CTEs match
// zero rows once the legacy keys are gone, calendar backups are guarded
// by NOT EXISTS, and the announcement insert is ON CONFLICT DO NOTHING.
// Knex wraps the whole migration in a transaction.

const LEGACY_HINT_KEYS = ['hint_year', 'hint_publisher', 'hint_developer', 'hint_genre']

const LEDGER_TABLE = 'legacy_hint_retirement_log'

const ANNOUNCEMENT_SOURCE = 'powerup_drop'
const ANNOUNCEMENT_SOURCE_REF = 'legacy-hint-sunset-2026-06'

interface CalendarItem {
  key: string
  quantity: number
}

interface CalendarPayload {
  items: CalendarItem[]
  points: number
}

interface CalendarRow {
  id: number
  day_number: number
  reward_type: string
  reward_value: CalendarPayload | string
  display_name: string
  description: string | null
  icon_url: string | null
}

// Post-retirement reward table for the days the meeting decided on
// (D4). `points` of null means "keep the row's existing points" (the
// day-7 chest keeps its 500).
const CALENDAR_REWRITES: Record<
  number,
  { items: CalendarItem[]; display_name: string; description: string; icon_url: string }
> = {
  1: {
    items: [{ key: 'hint_letter', quantity: 1 }],
    display_name: 'Révélation de Lettre',
    description: 'Révélez une lettre du titre masqué pendant une partie',
    icon_url: '🔤',
  },
  2: {
    items: [{ key: 'streak_freeze', quantity: 1 }],
    display_name: 'Gel de Série',
    description: 'Protégez votre série de connexion en cas de jour manqué',
    icon_url: '❄️',
  },
  4: {
    items: [{ key: 'hint_letter', quantity: 1 }],
    display_name: 'Révélation de Lettre',
    description: 'Révélez une lettre du titre masqué pendant une partie',
    icon_url: '🔤',
  },
  5: {
    items: [{ key: 'second_chance', quantity: 1 }],
    display_name: 'Seconde Chance',
    description: 'Garantissez un score minimum sur une capture déjà tentée',
    icon_url: '🔄',
  },
  7: {
    items: [
      { key: 'hint_letter', quantity: 2 },
      { key: 'streak_freeze', quantity: 1 },
    ],
    display_name: 'Coffre Légendaire',
    description: 'Le coffre ultime: 2x révélation de lettre, 1x gel de série, 500 points',
    icon_url: '🎁',
  },
}

function parsePayload(value: CalendarPayload | string): CalendarPayload {
  return typeof value === 'string' ? (JSON.parse(value) as CalendarPayload) : value
}

function containsLegacyKey(payload: CalendarPayload): boolean {
  return (payload.items ?? []).some((item) => LEGACY_HINT_KEYS.includes(item.key))
}

// Generic fallback for calendar rows that hold legacy keys but are NOT one
// of the decided day numbers (customised envs / test fixtures): strip the
// legacy items and fold them pooled 2:1 (ceil) into hint_letter, mirroring
// the inventory conversion. Decided days never reach this path.
function genericLegacyRewrite(payload: CalendarPayload): CalendarPayload {
  const kept = (payload.items ?? []).filter((item) => !LEGACY_HINT_KEYS.includes(item.key))
  const legacyTotal = (payload.items ?? [])
    .filter((item) => LEGACY_HINT_KEYS.includes(item.key))
    .reduce((sum, item) => sum + item.quantity, 0)
  const letters = Math.ceil(legacyTotal / 2)
  const existingLetter = kept.find((item) => item.key === 'hint_letter')
  if (existingLetter) {
    existingLetter.quantity += letters
  } else {
    kept.push({ key: 'hint_letter', quantity: letters })
  }
  return { items: kept, points: payload.points }
}

export async function up(knex: Knex): Promise<void> {
  // ---- 1. Audit ledger -------------------------------------------------
  const hasLedger = await knex.schema.hasTable(LEDGER_TABLE)
  if (!hasLedger) {
    await knex.schema.createTable(LEDGER_TABLE, (table) => {
      table.bigIncrements('id').primary()
      // Null for kind='calendar_backup' rows (calendar rows are global,
      // not per-user).
      table.text('user_id').nullable()
      // For kind='inventory': the converted item key, or the granted key
      // ('hint_letter') on per-user summary rows. For
      // kind='calendar_backup': `day_<n>`.
      table.string('item_key', 100).notNullable()
      table.integer('quantity_converted').nullable()
      table.integer('letters_granted').nullable()
      table.string('kind', 20).notNullable().comment("'inventory' | 'calendar_backup'")
      table.jsonb('payload').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

      table.index(['kind', 'item_key'], 'legacy_hint_retirement_log_kind_key_idx')
      table.index(['user_id'], 'legacy_hint_retirement_log_user_idx')
    })
  }

  // ---- 2a. Legacy metadata hints → hint_letter (pooled 2:1, ceil) -----
  // One statement: the DELETE … RETURNING CTE is the only reader of the
  // legacy rows, so concurrent old replicas spending from inventory
  // either see the rows (and this DELETE waits) or see nothing. Per-key
  // rows log what was taken; one summary row per user (item_key
  // 'hint_letter') logs what was granted, which is what down() reverses.
  await knex.raw(
    `
    WITH deleted AS (
      DELETE FROM user_inventory
      WHERE item_type = 'powerup'
        AND item_key IN ('hint_year', 'hint_publisher', 'hint_developer', 'hint_genre')
        AND quantity > 0
      RETURNING user_id, item_key, quantity
    ),
    per_user AS (
      SELECT user_id,
             SUM(quantity)::int AS total_converted,
             CEIL(SUM(quantity)::numeric / 2)::int AS letters
      FROM deleted
      GROUP BY user_id
    ),
    log_per_key AS (
      INSERT INTO ${LEDGER_TABLE} (user_id, item_key, quantity_converted, letters_granted, kind)
      SELECT user_id, item_key, quantity, NULL, 'inventory' FROM deleted
      RETURNING id
    ),
    log_summary AS (
      INSERT INTO ${LEDGER_TABLE} (user_id, item_key, quantity_converted, letters_granted, kind)
      SELECT user_id, 'hint_letter', total_converted, letters, 'inventory' FROM per_user
      RETURNING id
    ),
    granted AS (
      INSERT INTO user_inventory (user_id, item_type, item_key, quantity, created_at, updated_at)
      SELECT user_id, 'powerup', 'hint_letter', letters, NOW(), NOW() FROM per_user
      ON CONFLICT (user_id, item_type, item_key)
      DO UPDATE SET quantity = user_inventory.quantity + EXCLUDED.quantity, updated_at = NOW()
      RETURNING user_id
    )
    -- Rewards-inbox announcement: one auto-unlocked card per converted
    -- user. 'powerup_drop' is an allowed + auto-unlock source in
    -- rewards.service; the sourceRef matches its validation pattern.
    -- Announcement ONLY — inventory was upserted by the CTE above, so we
    -- bypass rewardsService.grant() on purpose (it would double-add).
    INSERT INTO reward_grants (user_id, source, source_ref, payload, unlocked_at)
    SELECT user_id,
           '${ANNOUNCEMENT_SOURCE}',
           '${ANNOUNCEMENT_SOURCE_REF}',
           jsonb_build_object(
             'items',
             jsonb_build_array(
               jsonb_build_object('itemType', 'powerup', 'itemKey', 'hint_letter', 'quantity', letters)
             )
           ),
           NOW()
    FROM per_user
    ON CONFLICT (user_id, source, source_ref) DO NOTHING
    `
  )

  // ---- 2b. timer_extension → streak_freeze (1:1) -----------------------
  // Dead key with live grants (consumed by nothing anywhere). Same atomic
  // pattern; 1:1 means the per-key log row can carry both sides
  // (quantity_converted = taken, letters_granted = streak_freezes given).
  await knex.raw(
    `
    WITH deleted AS (
      DELETE FROM user_inventory
      WHERE item_type = 'powerup'
        AND item_key = 'timer_extension'
        AND quantity > 0
      RETURNING user_id, quantity
    ),
    logged AS (
      INSERT INTO ${LEDGER_TABLE} (user_id, item_key, quantity_converted, letters_granted, kind)
      SELECT user_id, 'timer_extension', quantity, quantity, 'inventory' FROM deleted
      RETURNING id
    )
    INSERT INTO user_inventory (user_id, item_type, item_key, quantity, created_at, updated_at)
    SELECT user_id, 'powerup', 'streak_freeze', quantity, NOW(), NOW() FROM deleted
    ON CONFLICT (user_id, item_type, item_key)
    DO UPDATE SET quantity = user_inventory.quantity + EXCLUDED.quantity, updated_at = NOW()
    `
  )

  // Leftover zero-quantity legacy rows carry no value to convert — just
  // drop them so the retired keys vanish from user_inventory entirely.
  await knex('user_inventory')
    .where('item_type', 'powerup')
    .whereIn('item_key', [...LEGACY_HINT_KEYS, 'timer_extension'])
    .where('quantity', '<=', 0)
    .del()

  // ---- 3. Daily-login calendar + day-7 chest rewrite -------------------
  const rows = await knex<CalendarRow>('daily_login_rewards').select('*')
  for (const row of rows) {
    const payload = parsePayload(row.reward_value)
    if (!containsLegacyKey(payload)) continue

    // Snapshot the row verbatim BEFORE touching it — but only once, so a
    // re-run (or a re-up after a partial down) can't overwrite the true
    // pre-migration state with an already-rewritten one.
    const backupKey = `day_${row.day_number}`
    const existingBackup = await knex(LEDGER_TABLE)
      .where({ kind: 'calendar_backup', item_key: backupKey })
      .first()
    if (!existingBackup) {
      await knex(LEDGER_TABLE).insert({
        user_id: null,
        item_key: backupKey,
        quantity_converted: null,
        letters_granted: null,
        kind: 'calendar_backup',
        payload: JSON.stringify({
          id: row.id,
          day_number: row.day_number,
          reward_type: row.reward_type,
          reward_value: payload,
          display_name: row.display_name,
          description: row.description,
          icon_url: row.icon_url,
        }),
      })
    }

    const decided = CALENDAR_REWRITES[row.day_number]
    if (decided) {
      await knex('daily_login_rewards')
        .where({ id: row.id })
        .update({
          // Keep the row's existing points (the day-7 chest keeps 500;
          // power-up days keep 0).
          reward_value: JSON.stringify({ items: decided.items, points: payload.points }),
          display_name: decided.display_name,
          description: decided.description,
          icon_url: decided.icon_url,
        })
    } else {
      // Unexpected day carrying legacy keys (customised env): generic
      // pooled 2:1 fold into hint_letter, copy untouched.
      await knex('daily_login_rewards')
        .where({ id: row.id })
        .update({ reward_value: JSON.stringify(genericLegacyRewrite(payload)) })
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasLedger = await knex.schema.hasTable(LEDGER_TABLE)
  if (!hasLedger) return

  // ---- 1. Restore calendar rows verbatim from the backups --------------
  const backups = await knex(LEDGER_TABLE).where({ kind: 'calendar_backup' }).select('*')
  for (const backup of backups) {
    const snapshot =
      typeof backup.payload === 'string' ? JSON.parse(backup.payload) : backup.payload
    if (!snapshot) continue
    await knex('daily_login_rewards')
      .where({ day_number: snapshot.day_number })
      .update({
        reward_type: snapshot.reward_type,
        reward_value: JSON.stringify(snapshot.reward_value),
        display_name: snapshot.display_name,
        description: snapshot.description,
        icon_url: snapshot.icon_url,
      })
  }

  // ---- 2. Remove the inbox announcement cards --------------------------
  await knex('reward_grants')
    .where({ source: ANNOUNCEMENT_SOURCE, source_ref: ANNOUNCEMENT_SOURCE_REF })
    .del()

  // ---- 3. Reverse the inventory conversion -----------------------------
  // 3a. Take back the granted hint_letter (per-user summary rows),
  // clamped at zero — the user may have spent some letters since.
  await knex.raw(
    `
    UPDATE user_inventory ui
    SET quantity = GREATEST(ui.quantity - l.letters_granted, 0), updated_at = NOW()
    FROM ${LEDGER_TABLE} l
    WHERE l.kind = 'inventory'
      AND l.item_key = 'hint_letter'
      AND ui.user_id = l.user_id
      AND ui.item_type = 'powerup'
      AND ui.item_key = 'hint_letter'
    `
  )

  // 3b. Take back the streak_freeze granted for timer_extension, clamped.
  await knex.raw(
    `
    UPDATE user_inventory ui
    SET quantity = GREATEST(ui.quantity - l.letters_granted, 0), updated_at = NOW()
    FROM ${LEDGER_TABLE} l
    WHERE l.kind = 'inventory'
      AND l.item_key = 'timer_extension'
      AND ui.user_id = l.user_id
      AND ui.item_type = 'powerup'
      AND ui.item_key = 'streak_freeze'
    `
  )

  // 3c. Re-insert the converted legacy rows (per-key log rows), including
  // timer_extension. Upsert-add in case a row reappeared meanwhile.
  await knex.raw(
    `
    INSERT INTO user_inventory (user_id, item_type, item_key, quantity, created_at, updated_at)
    SELECT user_id, 'powerup', item_key, quantity_converted, NOW(), NOW()
    FROM ${LEDGER_TABLE}
    WHERE kind = 'inventory'
      AND item_key IN ('hint_year', 'hint_publisher', 'hint_developer', 'hint_genre', 'timer_extension')
      AND quantity_converted IS NOT NULL
    ON CONFLICT (user_id, item_type, item_key)
    DO UPDATE SET quantity = user_inventory.quantity + EXCLUDED.quantity, updated_at = NOW()
    `
  )

  // ---- 4. Drop the ledger ----------------------------------------------
  await knex.schema.dropTableIfExists(LEDGER_TABLE)
}
