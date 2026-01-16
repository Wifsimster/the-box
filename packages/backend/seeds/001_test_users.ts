import type { Knex } from 'knex'
import { randomBytes } from 'crypto'
// @ts-ignore - from better-auth's dependency
import { scryptAsync } from '@noble/hashes/scrypt.js'

/**
 * Hash password using the same algorithm as better-auth.
 * Matches: N=16384, r=16, p=1, dkLen=64
 * Format: salt:key (both hex encoded)
 */
async function hashPassword(password: string): Promise<string> {
  const saltBytes = randomBytes(16)
  const salt = saltBytes.toString('hex')
  const key = await scryptAsync(password.normalize('NFKC'), salt, {
    N: 16384,
    r: 16,
    p: 1,
    dkLen: 64,
    maxmem: 128 * 16384 * 16 * 2, // 64 MB
  })
  return `${salt}:${Buffer.from(key).toString('hex')}`
}

export async function seed(knex: Knex): Promise<void> {
  const testPassword = 'test123'
  const hashedPassword = await hashPassword(testPassword)
  const now = new Date()

  // Test users with different score profiles
  const testUsers = [
    {
      email: 'testuser1@test.local',
      username: 'testuser1',
      displayName: 'High Scorer',
      totalScore: 5500,
      currentStreak: 15,
      longestStreak: 20,
      role: 'user',
    },
    {
      email: 'testuser2@test.local',
      username: 'testuser2',
      displayName: 'Medium Scorer',
      totalScore: 2500,
      currentStreak: 7,
      longestStreak: 10,
      role: 'user',
    },
    {
      email: 'testuser3@test.local',
      username: 'testuser3',
      displayName: 'Low Scorer',
      totalScore: 500,
      currentStreak: 0,
      longestStreak: 2,
      role: 'user',
    },
    {
      email: 'testuser4@test.local',
      username: 'testuser4',
      displayName: 'New Player',
      totalScore: 0,
      currentStreak: 0,
      longestStreak: 0,
      role: 'user',
    },
    {
      email: 'testuser5@test.local',
      username: 'testuser5',
      displayName: 'Consistent Player',
      totalScore: 3200,
      currentStreak: 3,
      longestStreak: 5,
      role: 'user',
    },
    {
      email: 'testadmin@test.local',
      username: 'testadmin',
      displayName: 'Test Admin',
      totalScore: 8000,
      currentStreak: 30,
      longestStreak: 30,
      role: 'admin',
    },
  ]

  for (const userData of testUsers) {
    // Check if user already exists
    const existingUser = await knex('user')
      .where('email', userData.email)
      .first()

    if (existingUser) {
      console.log(`User ${userData.email} already exists, skipping`)
      continue
    }

    try {
      const userId = randomBytes(16).toString('hex')

      // Insert user into better-auth's user table
      await knex('user').insert({
        id: userId,
        email: userData.email,
        name: userData.username,
        emailVerified: true,
        role: userData.role,
        createdAt: now,
        updatedAt: now,
        // Custom fields (snake_case as defined in schema)
        username: userData.username,
        display_username: userData.username,
        display_name: userData.displayName,
        total_score: userData.totalScore,
        current_streak: userData.currentStreak,
        longest_streak: userData.longestStreak,
        last_played_at: userData.totalScore > 0 ? now : null,
      })

      // Insert account for credential-based auth
      await knex('account').insert({
        id: randomBytes(16).toString('hex'),
        userId: userId,
        providerId: 'credential',
        accountId: userId,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      })

      console.log(`Created test user: ${userData.email} (${userData.username})`)
    } catch (error) {
      console.error(`Failed to create user ${userData.email}:`, error)
      throw error
    }
  }

  // Award achievements to test admin user
  const adminUser = await knex('user').where('email', 'testadmin@test.local').first()

  if (adminUser) {
    console.log('Awarding achievements to test admin...')

    // Get achievement IDs
    const achievementKeys = [
      'first_win',
      'dedicated_player',
      'weekly_warrior',
      'month_master',
      'quick_draw',
      'speed_demon',
      'no_hints_needed',
      'perfect_run',
      'high_roller',
      'rpg_expert',
      'action_hero',
      'top_ten',
      'podium_finish',
      'champion',
    ]

    const achievements = await knex('achievements')
      .whereIn('key', achievementKeys)
      .select('id', 'key')

    const earnedDate = new Date()

    for (const achievement of achievements) {
      // Check if already awarded
      const existing = await knex('user_achievements')
        .where({ user_id: adminUser.id, achievement_id: achievement.id })
        .first()

      if (!existing) {
        await knex('user_achievements').insert({
          user_id: adminUser.id,
          achievement_id: achievement.id,
          earned_at: earnedDate,
          progress: 0,
          progress_max: null,
          metadata: null,
        })
        console.log(`  ✓ Awarded: ${achievement.key}`)
      }
    }
  }

  console.log('✓ Test users seed completed')
}
