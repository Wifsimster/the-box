/**
 * E2E Test Database Seeding Script
 *
 * Creates test users and daily challenge for E2E testing.
 * Idempotent - safe to run multiple times.
 *
 * Usage: npm run e2e:seed (from packages/backend)
 */

import { randomBytes } from 'crypto'
// @ts-ignore - from better-auth's dependency
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { db, closeConnection } from '../src/infrastructure/database/connection.js'
import { challengeRepository } from '../src/infrastructure/repositories/challenge.repository.js'

// E2E Test Constants
export const E2E_USER_EMAIL = 'e2e_user@test.local'
export const E2E_USER_PASSWORD = 'test123'
export const E2E_ADMIN_EMAIL = 'e2e_admin@test.local'
export const E2E_ADMIN_PASSWORD = 'test123'

/**
 * Hash password using the same algorithm as better-auth.
 * Matches: N=16384, r=16, p=1, dkLen=64
 * Format: salt:key (both hex encoded)
 *
 * better-auth passes the hex-encoded salt STRING to scrypt (not raw bytes).
 * See: node_modules/better-auth/dist/crypto/password.mjs
 */
async function hashPassword(password: string): Promise<string> {
  const saltBytes = randomBytes(16)
  const salt = saltBytes.toString('hex')
  // Pass hex-encoded salt string to match better-auth's behavior
  const key = await scryptAsync(password.normalize('NFKC'), salt, {
    N: 16384,
    r: 16,
    p: 1,
    dkLen: 64,
    maxmem: 128 * 16384 * 16 * 2, // 64 MB
  })
  return `${salt}:${Buffer.from(key).toString('hex')}`
}

/**
 * Create or update a test user with credentials
 */
async function createTestUser(data: {
  email: string
  username: string
  displayName: string
  role: 'user' | 'admin'
  password: string
}): Promise<string> {
  const now = new Date()

  // Check if user already exists by email or username
  const existingUser = await db('user')
    .where('email', data.email)
    .orWhere('username', data.username)
    .first()

  if (existingUser) {
    console.log(`  ✓ User ${data.email} already exists (ID: ${existingUser.id})`)
    return existingUser.id
  }

  // The merged-schema migration bootstraps a default admin (admin@thebox.local)
  // and a later migration adds the `one_admin_role_idx` partial unique index
  // permitting exactly one row with role='admin'. Inserting the e2e admin would
  // therefore collide. Demote any other existing admin to 'user' first so the
  // e2e admin can own the single admin slot. Idempotent: on re-run the e2e
  // admin already exists and we return above before reaching here.
  if (data.role === 'admin') {
    const demoted = await db('user')
      .where('role', 'admin')
      .whereNot('email', data.email)
      .update({ role: 'user', updatedAt: new Date() })
    if (demoted > 0) {
      console.log(`  ✓ Demoted ${demoted} pre-existing admin(s) to make room for ${data.email}`)
    }
  }

  const hashedPassword = await hashPassword(data.password)
  const userId = randomBytes(16).toString('hex')

  // Insert user into better-auth's user table
  await db('user').insert({
    id: userId,
    email: data.email,
    name: data.username,
    emailVerified: true,
    role: data.role,
    createdAt: now,
    updatedAt: now,
    // Custom fields (snake_case as defined in schema)
    username: data.username,
    display_username: data.username,
    display_name: data.displayName,
    total_score: 0,
    current_streak: 0,
    longest_streak: 0,
    last_played_at: null,
  })

  // Insert account for credential-based auth
  await db('account').insert({
    id: randomBytes(16).toString('hex'),
    userId: userId,
    providerId: 'credential',
    accountId: userId,
    password: hashedPassword,
    createdAt: now,
    updatedAt: now,
  })

  console.log(`  ✓ Created user ${data.email} (ID: ${userId})`)
  return userId
}

/**
 * Create mock games and screenshots for testing
 * This ensures there's data for daily challenges in CI
 */
async function createMockGamesAndScreenshots(): Promise<void> {
  // Check if mock games already exist
  const existingGames = await db('games').where('name', 'like', 'E2E Test Game%').first()
  if (existingGames) {
    console.log('  ✓ Mock games already exist')
    return
  }

  console.log('  Creating mock games and screenshots...')

  // Create 3 mock games with 5 screenshots each (15 total, enough for testing)
  const mockGames = [
    { name: 'E2E Test Game 1', slug: 'e2e-test-game-1', release_year: 2020, metacritic: 85 },
    { name: 'E2E Test Game 2', slug: 'e2e-test-game-2', release_year: 2021, metacritic: 90 },
    { name: 'E2E Test Game 3', slug: 'e2e-test-game-3', release_year: 2022, metacritic: 88 },
  ]

  for (const gameData of mockGames) {
    // Insert game using correct schema columns
    // Note: genres/platforms are text[] arrays in PostgreSQL
    const result = await db('games').insert({
      rawg_id: Math.floor(Math.random() * 1000000) + 900000, // Random high ID to avoid conflicts
      name: gameData.name,
      slug: gameData.slug,
      release_year: gameData.release_year,
      metacritic: gameData.metacritic,
      cover_image_url: 'https://via.placeholder.com/1920x1080.png?text=E2E+Test',
      platforms: ['PC', 'PlayStation', 'Xbox'], // text[] array
      genres: ['Action', 'Adventure'], // text[] array
      publisher: 'E2E Test Publisher',
    }).returning('id')
    const gameId = result[0].id

    // Create 5 screenshots for this game
    for (let i = 1; i <= 5; i++) {
      await db('screenshots').insert({
        game_id: gameId,
        image_url: `https://via.placeholder.com/1920x1080.png?text=${encodeURIComponent(gameData.name)}+Screenshot+${i}`,
        thumbnail_url: `https://via.placeholder.com/400x225.png?text=${encodeURIComponent(gameData.name)}+Thumb+${i}`,
        haov: 180,
        vaov: 90,
        difficulty: Math.floor(Math.random() * 3) + 1,
        is_active: true,
        times_used: 0,
        correct_guesses: 0,
      })
    }

    console.log(`  ✓ Created game "${gameData.name}" with 5 screenshots`)
  }
}

/**
 * Select random screenshots from the database
 */
async function selectRandomScreenshots(count: number): Promise<number[]> {
  const result = await db('screenshots')
    .where('is_active', true)
    .count('id as count')
    .first<{ count: string | number }>()

  const available = Number(result?.count ?? 0)

  if (available === 0) {
    console.warn('  ⚠ No screenshots available in database')
    return []
  }

  console.log(`  Found ${available} screenshots, need ${count}`)

  if (available >= count) {
    const rows = await db('screenshots')
      .where('is_active', true)
      .orderByRaw('RANDOM()')
      .limit(count)
      .pluck<number[]>('id')
    return rows
  }

  // Not enough unique screenshots - allow reuse
  console.warn('  ⚠ Not enough unique screenshots, allowing reuse')
  const allIds = await db('screenshots')
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

/**
 * Create today's daily challenge if it doesn't exist
 */
async function createTodayChallenge(): Promise<void> {
  const challengeDate = new Date().toISOString().split('T')[0]!

  // Check if challenge already exists
  const existing = await challengeRepository.findByDate(challengeDate)
  if (existing) {
    console.log(`  ✓ Challenge for ${challengeDate} already exists (ID: ${existing.id})`)
    return
  }

  // Select 10 random screenshots
  const screenshotIds = await selectRandomScreenshots(10)
  if (screenshotIds.length === 0) {
    console.warn(`  ⚠ No screenshots available for challenge, skipping`)
    return
  }

  // Create challenge
  const challenge = await challengeRepository.create(challengeDate)
  console.log(`  ✓ Created challenge for ${challengeDate} (ID: ${challenge.id})`)

  // Create tier
  const tier = await challengeRepository.createTier({
    dailyChallengeId: challenge.id,
    tierNumber: 1,
    name: 'Daily Challenge',
    timeLimitSeconds: 45,
  })
  console.log(`  ✓ Created tier (ID: ${tier.id})`)

  // Assign screenshots
  await challengeRepository.createTierScreenshots(tier.id, screenshotIds)
  console.log(`  ✓ Assigned ${screenshotIds.length} screenshots to tier`)
}

/**
 * Geo entities for the admin geo authz/UX specs.
 *
 * Idempotent: only creates the row if it doesn't already exist. The
 * deterministic shape (one game, one map, one promoted candidate, one
 * meta) lets the geo specs stop accepting "empty state" as success.
 */
async function createMockGeoData(): Promise<void> {
  const game = await db('games').where('slug', 'e2e-test-game-1').first<{ id: number }>()
  if (!game) {
    console.warn('  ⚠ Mock game not seeded yet, skipping geo seed')
    return
  }

  const existingMap = await db('geo_map').where({ game_id: game.id }).first<{ id: number }>()
  let mapId: number
  if (existingMap) {
    console.log(`  ✓ Geo map already exists for game ${game.id} (ID: ${existingMap.id})`)
    mapId = existingMap.id
  } else {
    const [row] = await db('geo_map')
      .insert({
        game_id: game.id,
        source: 'manual',
        source_url: 'https://example.com/e2e/map.png',
        image_url: 'https://via.placeholder.com/2048x2048.png?text=E2E+Geo+Map',
        width_px: 2048,
        height_px: 2048,
        consensus_radius: 0.05,
        license: 'CC-BY-4.0',
        attribution: 'E2E Test',
        is_active: true,
        is_selected: true,
        selected_at: new Date(),
      })
      .returning<Array<{ id: number }>>('id')
    mapId = row!.id
    console.log(`  ✓ Created geo map for game ${game.id} (ID: ${mapId})`)
  }

  // One promoted candidate so the moderation queue has something concrete
  // to render and the free-play picker has a screenshot to return.
  const existingCandidate = await db('geo_screenshot_candidate')
    .where({ game_id: game.id })
    .first<{ id: number }>()
  let candidateId: number
  if (existingCandidate) {
    candidateId = existingCandidate.id
    console.log(`  ✓ Geo candidate already exists (ID: ${candidateId})`)
  } else {
    const [row] = await db('geo_screenshot_candidate')
      .insert({
        game_id: game.id,
        geo_map_id: mapId,
        image_url: 'https://via.placeholder.com/1920x1080.png?text=E2E+Capture',
        thumbnail_url: 'https://via.placeholder.com/400x225.png?text=E2E+Capture',
        source: 'manual',
        external_id: `e2e-${game.id}-1`,
        status: 'promoted',
        pin_count: 5,
        is_active: true,
      })
      .returning<Array<{ id: number }>>('id')
    candidateId = row!.id
    console.log(`  ✓ Created geo candidate (ID: ${candidateId})`)
  }

  const existingMeta = await db('geo_screenshot_meta')
    .where({ geo_screenshot_candidate_id: candidateId })
    .first<{ id: number }>()
  if (!existingMeta) {
    await db('geo_screenshot_meta').insert({
      geo_screenshot_candidate_id: candidateId,
      geo_map_id: mapId,
      canonical_x: 0.5,
      canonical_y: 0.5,
      confidence: 0.95,
      consensus_version: 1,
      promoted_via: 'admin',
      promoted_by: null,
    })
    console.log('  ✓ Created geo meta (canonical 0.5,0.5)')
  } else {
    console.log('  ✓ Geo meta already exists')
  }
}

/**
 * Clear daily login claims for e2e test users so fresh login tests work
 */
async function clearDailyLoginClaims(userIds: string[]): Promise<void> {
  const deleted = await db('login_reward_claims')
    .whereIn('user_id', userIds)
    .del()

  if (deleted > 0) {
    console.log(`  ✓ Cleared ${deleted} daily login claims for test users`)
  }
}

// Stable source_ref used by the IDOR spec to find the grant for the
// non-admin user. Idempotent via the (user_id, source, source_ref) unique
// key; reseeding does not duplicate. We insert only the reward_grants row
// — no inventory side-effect — so re-runs leave inventory untouched.
const IDOR_GRANT_SOURCE = 'milestone'
const IDOR_GRANT_SOURCE_REF = 'milestone:e2e_idor_test_grant'

async function seedIdorRewardGrant(userId: string): Promise<void> {
  const payload = JSON.stringify({
    items: [{ itemType: 'powerup', itemKey: 'hint_letter', quantity: 1 }],
  })
  await db.raw(
    `
    INSERT INTO reward_grants (user_id, source, source_ref, payload, unlocked_at)
    VALUES (?, ?, ?, ?::jsonb, NOW())
    ON CONFLICT (user_id, source, source_ref) DO NOTHING
    `,
    [userId, IDOR_GRANT_SOURCE, IDOR_GRANT_SOURCE_REF, payload]
  )
  const row = await db('reward_grants')
    .where({ user_id: userId, source: IDOR_GRANT_SOURCE, source_ref: IDOR_GRANT_SOURCE_REF })
    .first()
  console.log(`  ✓ IDOR test grant ready for user ${userId} (id: ${row?.id})`)
}

/**
 * Main seeding function
 */
async function seed(): Promise<void> {
  console.log('🌱 E2E Database Seeding\n')

  try {
    // Step 1: Create test users
    console.log('Creating test users...')
    const e2eUserId = await createTestUser({
      email: E2E_USER_EMAIL,
      username: 'e2e_user',
      displayName: 'E2E Test User',
      role: 'user',
      password: E2E_USER_PASSWORD,
    })

    const e2eAdminId = await createTestUser({
      email: E2E_ADMIN_EMAIL,
      username: 'e2e_admin',
      displayName: 'E2E Admin User',
      role: 'admin',
      password: E2E_ADMIN_PASSWORD,
    })

    // Step 2: Create mock games and screenshots for CI
    console.log('\nCreating mock games and screenshots...')
    await createMockGamesAndScreenshots()

    // Step 3: Create today's daily challenge
    console.log('\nCreating daily challenge...')
    await createTodayChallenge()

    // Step 4: Geo entities so admin geo + free-play specs have data
    console.log('\nCreating geo seed (map + candidate + meta)...')
    await createMockGeoData()

    // Step 5: Clear daily login claims for fresh login tests
    console.log('\nClearing daily login claims...')
    await clearDailyLoginClaims([e2eUserId, e2eAdminId])

    // Step 6: Reward grant for the IDOR Playwright spec. The grant belongs
    // to e2e_user; the spec logs in as e2e_admin and asserts they cannot
    // claim it. Skipping silently if the reward_grants table is missing
    // keeps the seed forward-compatible with backends that haven't run the
    // rewards migration yet.
    console.log('\nSeeding reward grant for IDOR spec...')
    try {
      await seedIdorRewardGrant(e2eUserId)
    } catch (error) {
      console.warn(
        '  ⚠ Skipped IDOR grant seed (reward_grants table missing or schema drift):',
        (error as Error).message,
      )
    }

    console.log('\n✅ E2E seeding completed successfully!')
  } catch (error) {
    console.error('\n❌ E2E seeding failed:', error)
    throw error
  }
}

// Run the seed
seed()
  .then(() => closeConnection())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
