import { db } from '../src/infrastructure/database/connection.js'

async function main() {
  const user = await db('user').where('email', 'e2e_user@test.local').first()
  if (!user) throw new Error('e2e_user not found')
  console.log('e2e_user id =', user.id)

  // Ensure we have ≥4 past daily_challenges (seed fresh ones if needed). Each
  // also needs at least one tier so the new findUserGameHistory subquery can
  // count tier_screenshots — though for our visual test, an empty tier is OK
  // since the row simply shows 0/0.
  let challenges = await db('daily_challenges').orderBy('challenge_date', 'desc').limit(10)
  if (challenges.length < 4) {
    console.log(`only ${challenges.length} challenges; topping up to 4`)
    const today = new Date()
    for (let i = challenges.length; i < 4; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() - 30 - i)  // 30+ days ago to avoid clashes
      const ymd = date.toISOString().slice(0, 10)
      await db('daily_challenges')
        .insert({ challenge_date: ymd, is_active: false })
        .onConflict('challenge_date').ignore()
    }
    challenges = await db('daily_challenges').orderBy('challenge_date', 'desc').limit(10)
  }
  console.log(`using ${challenges.length} daily challenges`)
  if (challenges.length < 4) throw new Error('still need ≥4 daily challenges')

  const existing = await db('game_sessions').where('user_id', user.id).select('id')
  if (existing.length > 0) {
    await db('tier_sessions').whereIn('game_session_id', existing.map(r => r.id)).delete()
    await db('game_sessions').whereIn('id', existing.map(r => r.id)).delete()
    console.log(`wiped ${existing.length} prior sessions`)
  }

  const sessions = [
    { challenge: challenges[0], totalScore: 1450, correctAnswers: 8 },
    { challenge: challenges[1], totalScore: 850,  correctAnswers: 5 },
    { challenge: challenges[2], totalScore: 320,  correctAnswers: 2 },
    { challenge: challenges[3], totalScore: 0,    correctAnswers: 0 },
  ]

  for (const s of sessions) {
    const [gs] = await db('game_sessions').insert({
      user_id: user.id,
      daily_challenge_id: s.challenge.id,
      total_score: s.totalScore,
      is_completed: true,
      completed_at: new Date(),
      current_position: 10,
    }).returning('*')
    console.log(`  inserted ${gs.id} score=${s.totalScore} date=${s.challenge.challenge_date}`)

    const tier = await db('tiers').where('daily_challenge_id', s.challenge.id).first()
    if (tier) {
      await db('tier_sessions').insert({
        game_session_id: gs.id,
        tier_id: tier.id,
        correct_answers: s.correctAnswers,
        score: s.totalScore,
        is_completed: true,
        completed_at: new Date(),
      })
    }
  }
  await db.destroy()
  console.log('done')
}

main().catch(e => { console.error(e); process.exit(1) })
