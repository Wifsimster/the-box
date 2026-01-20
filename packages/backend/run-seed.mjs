import knex from 'knex';
import { randomBytes } from 'crypto';
import { scryptAsync } from '@noble/hashes/scrypt.js';

async function hashPassword(password) {
  const saltBytes = randomBytes(16);
  const salt = saltBytes.toString('hex');
  const key = await scryptAsync(password.normalize('NFKC'), salt, {
    N: 16384,
    r: 16,
    p: 1,
    dkLen: 64,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return salt + ':' + Buffer.from(key).toString('hex');
}

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgresql://thebox:thebox_secret@localhost:5432/thebox',
});

async function seed() {
  const now = new Date();
  const userPassword = await hashPassword('testpass123');
  const adminPassword = await hashPassword('admin123');

  // Delete existing test users by email or username
  const existingUsers = await db('user').where(function() {
    this.whereIn('email', ['testuser@example.com', 'admin@example.com'])
        .orWhereIn('username', ['e2e_testuser', 'e2e_admin']);
  }).select('id');

  if (existingUsers.length > 0) {
    const userIds = existingUsers.map(u => u.id);
    await db('account').whereIn('userId', userIds).del();
    await db('user').whereIn('id', userIds).del();
    console.log('Deleted existing test users');
  }

  // Insert test user
  const testUserId = randomBytes(16).toString('hex');
  await db('user').insert({
    id: testUserId,
    email: 'testuser@example.com',
    name: 'e2e_testuser',
    emailVerified: true,
    role: 'user',
    createdAt: now,
    updatedAt: now,
    username: 'e2e_testuser',
    display_username: 'e2e_testuser',
    display_name: 'E2E Test User',
    total_score: 0,
    current_streak: 0,
    longest_streak: 0,
  });

  await db('account').insert({
    id: randomBytes(16).toString('hex'),
    userId: testUserId,
    providerId: 'credential',
    accountId: testUserId,
    password: userPassword,
    createdAt: now,
    updatedAt: now,
  });

  // Insert admin user
  const adminUserId = randomBytes(16).toString('hex');
  await db('user').insert({
    id: adminUserId,
    email: 'admin@example.com',
    name: 'e2e_admin',
    emailVerified: true,
    role: 'admin',
    createdAt: now,
    updatedAt: now,
    username: 'e2e_admin',
    display_username: 'e2e_admin',
    display_name: 'E2E Admin User',
    total_score: 0,
    current_streak: 0,
    longest_streak: 0,
  });

  await db('account').insert({
    id: randomBytes(16).toString('hex'),
    userId: adminUserId,
    providerId: 'credential',
    accountId: adminUserId,
    password: adminPassword,
    createdAt: now,
    updatedAt: now,
  });

  console.log('✅ Test users created successfully:');
  console.log('   - testuser@example.com / testpass123 (user)');
  console.log('   - admin@example.com / admin123 (admin)');

  await db.destroy();
}

seed().catch(e => { console.error(e); process.exit(1); });
