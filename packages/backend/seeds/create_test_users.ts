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

/**
 * Create test users for E2E testing
 *
 * Creates:
 * - testuser@example.com (regular user) - password: testpass123
 * - admin@example.com (admin user) - password: admin123
 */
export async function seed(knex: Knex): Promise<void> {
  const now = new Date()

  // Hash passwords
  const userPassword = await hashPassword('testpass123')
  const adminPassword = await hashPassword('admin123')

  // Delete existing test users and their accounts
  const existingUsers = await knex('user').whereIn('email', [
    'testuser@example.com',
    'admin@example.com'
  ]).select('id')

  if (existingUsers.length > 0) {
    const userIds = existingUsers.map(u => u.id)
    await knex('account').whereIn('userId', userIds).del()
    await knex('user').whereIn('id', userIds).del()
  }

  // Insert test user
  const testUserId = randomBytes(16).toString('hex')
  await knex('user').insert({
    id: testUserId,
    email: 'testuser@example.com',
    name: 'testuser',
    emailVerified: true,
    role: 'user',
    createdAt: now,
    updatedAt: now,
    username: 'testuser',
    display_username: 'testuser',
    display_name: 'Test User',
    total_score: 0,
    current_streak: 0,
    longest_streak: 0,
  })

  await knex('account').insert({
    id: randomBytes(16).toString('hex'),
    userId: testUserId,
    providerId: 'credential',
    accountId: testUserId,
    password: userPassword,
    createdAt: now,
    updatedAt: now,
  })

  // Insert admin user
  const adminUserId = randomBytes(16).toString('hex')
  await knex('user').insert({
    id: adminUserId,
    email: 'admin@example.com',
    name: 'admin',
    emailVerified: true,
    role: 'admin',
    createdAt: now,
    updatedAt: now,
    username: 'admin',
    display_username: 'admin',
    display_name: 'Admin User',
    total_score: 0,
    current_streak: 0,
    longest_streak: 0,
  })

  await knex('account').insert({
    id: randomBytes(16).toString('hex'),
    userId: adminUserId,
    providerId: 'credential',
    accountId: adminUserId,
    password: adminPassword,
    createdAt: now,
    updatedAt: now,
  })

  console.log('✅ Test users created successfully:')
  console.log('   - testuser@example.com / testpass123 (user)')
  console.log('   - admin@example.com / admin123 (admin)')
}
