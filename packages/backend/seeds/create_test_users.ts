import { Knex } from 'knex'
import { hashSync } from 'bcrypt'

/**
 * Create test users for E2E testing
 *
 * Creates:
 * - testuser@example.com (regular user) - password: testpass123
 * - admin@example.com (admin user) - password: admin123
 */
export async function seed(knex: Knex): Promise<void> {
  // Delete existing test users
  await knex('user').whereIn('email', [
    'testuser@example.com',
    'admin@example.com'
  ]).del()

  // Insert test users
  const testUsers = [
    {
      email: 'testuser@example.com',
      name: 'Test User',
      email_verified: true,
      role: 'user',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      email: 'admin@example.com',
      name: 'Admin User',
      email_verified: true,
      role: 'admin',
      created_at: new Date(),
      updated_at: new Date(),
    }
  ]

  const insertedUsers = await knex('user').insert(testUsers).returning('*')

  // Create accounts with hashed passwords
  const testAccounts = insertedUsers.map((user, index) => ({
    userId: user.id,
    providerId: 'credential',
    accountId: user.email,
    password: hashSync(index === 0 ? 'testpass123' : 'admin123', 10),
    createdAt: new Date(),
    updatedAt: new Date(),
  }))

  await knex('account').insert(testAccounts)

  console.log('✅ Test users created successfully:')
  console.log('   - testuser@example.com / testpass123 (user)')
  console.log('   - admin@example.com / admin123 (admin)')
}
