import knex from 'knex';

const db = knex({
  client: 'pg',
  connection: 'postgresql://thebox:thebox_secret@localhost:5432/thebox'
});

const users = await db('user').whereIn('email', ['testuser@example.com', 'admin@example.com']).select('id', 'email', 'name', 'username', 'role');
console.log('Users found:', JSON.stringify(users, null, 2));

if (users.length > 0) {
  const userIds = users.map(u => u.id);
  const accounts = await db('account').whereIn('userId', userIds).select('userId', 'providerId', 'password');
  console.log('Accounts found:', accounts.length);
  for (const acc of accounts) {
    console.log('  - User:', acc.userId.substring(0, 8), 'Provider:', acc.providerId, 'Password format:', acc.password ? (acc.password.includes(':') ? 'scrypt' : 'bcrypt/other') : 'none');
  }
}

await db.destroy();
