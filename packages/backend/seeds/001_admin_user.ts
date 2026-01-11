import type { Knex } from 'knex';
import { randomBytes } from 'crypto';
// @ts-expect-error - from better-auth's dependency
import { scryptAsync } from '@noble/hashes/scrypt.js';

/**
 * Hash password using the same algorithm as better-auth.
 * Matches: N=16384, r=16, p=1, dkLen=64
 * Format: salt:key (both hex encoded)
 */
async function hashPassword(password: string): Promise<string> {
  const saltBytes = randomBytes(16);
  const salt = saltBytes.toString('hex');
  const key = await scryptAsync(password.normalize('NFKC'), salt, {
    N: 16384,
    r: 16,
    p: 1,
    dkLen: 64,
    maxmem: 128 * 16384 * 16 * 2, // 64 MB
  });
  return `${salt}:${Buffer.from(key).toString('hex')}`;
}

export async function seed(knex: Knex): Promise<void> {
  // Check if admin user already exists
  const existingUser = await knex('user')
    .where('email', 'admin@thebox.local')
    .first();

  if (existingUser) {
    console.log('Admin user already exists, skipping seed');
    return;
  }

  try {
    const userId = randomBytes(16).toString('hex');
    const hashedPassword = await hashPassword('root');
    const now = new Date();

    // Insert user into better-auth's user table
    await knex('user').insert({
      id: userId,
      email: 'admin@thebox.local',
      name: 'admin',
      emailVerified: true,
      role: 'admin',
      createdAt: now,
      updatedAt: now,
      // Custom fields
      username: 'admin',
      displayName: 'Administrator',
      totalScore: 0,
      currentStreak: 0,
      longestStreak: 0,
    });

    // Insert account for credential-based auth (password stored here)
    await knex('account').insert({
      id: randomBytes(16).toString('hex'),
      userId: userId,
      providerId: 'credential',
      accountId: userId,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    });

    console.log('Admin user created successfully:');
    console.log('  Email: admin@thebox.local');
    console.log('  Username: admin');
    console.log('  Password: root');
    console.log('  Role: admin');
  } catch (error) {
    console.error('Failed to create admin user:', error);
    throw error;
  }
}
