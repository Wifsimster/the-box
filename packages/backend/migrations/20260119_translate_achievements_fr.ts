import type { Knex } from 'knex'

/**
 * Update existing achievements to French translations.
 */
export async function up(knex: Knex): Promise<void> {
    // Update speed achievements
    await knex('achievements').where('key', 'speed_demon').update({
        name: 'Démon de la Vitesse',
        description: 'Obtenez 3 réponses parfaites de suite (moins de 3 secondes chacune)',
    })

    await knex('achievements').where('key', 'lightning_reflexes').update({
        name: 'Réflexes Éclair',
        description: 'Répondez à 10 captures en moins de 3 secondes',
    })

    await knex('achievements').where('key', 'quick_draw').update({
        name: 'Dégaineur',
        description: 'Répondez à une capture en moins de 2 secondes',
    })

    // Update accuracy achievements
    await knex('achievements').where('key', 'no_hints_needed').update({
        name: 'Sans Indices',
        description: 'Complétez un défi quotidien sans utiliser d\'indices',
    })

    await knex('achievements').where('key', 'hint_free_master').update({
        name: 'Maître Sans Indices',
        description: 'Complétez 10 défis quotidiens sans utiliser d\'indices',
    })

    await knex('achievements').where('key', 'sharp_eye').update({
        name: 'Regard Perçant',
        description: 'Obtenez 10 bonnes réponses de suite sans erreur',
    })

    // Update score achievements
    await knex('achievements').where('key', 'perfect_run').update({
        name: 'Partie Parfaite',
        description: 'Obtenez exactement 2000 points dans un seul défi',
    })

    await knex('achievements').where('key', 'high_roller').update({
        name: 'Gros Joueur',
        description: 'Obtenez plus de 1800 points dans un seul défi',
    })

    // Update streak achievements
    await knex('achievements').where('key', 'dedicated_player').update({
        name: 'Joueur Dévoué',
        description: 'Maintenez une série de 3 jours',
    })

    await knex('achievements').where('key', 'weekly_warrior').update({
        name: 'Guerrier Hebdomadaire',
        description: 'Maintenez une série de 7 jours',
    })

    await knex('achievements').where('key', 'month_master').update({
        name: 'Maître du Mois',
        description: 'Maintenez une série de 30 jours',
    })

    // Update genre achievements
    await knex('achievements').where('key', 'rpg_expert').update({
        name: 'Expert RPG',
        description: 'Identifiez correctement 10 jeux RPG',
    })

    await knex('achievements').where('key', 'action_hero').update({
        name: 'Héros d\'Action',
        description: 'Identifiez correctement 10 jeux d\'Action',
    })

    await knex('achievements').where('key', 'strategy_savant').update({
        name: 'Stratège Érudit',
        description: 'Identifiez correctement 10 jeux de Stratégie',
    })

    // Update completion achievements
    await knex('achievements').where('key', 'first_win').update({
        name: 'Première Victoire',
        description: 'Complétez votre premier défi quotidien',
    })

    await knex('achievements').where('key', 'century_club').update({
        name: 'Club des Cent',
        description: 'Complétez 100 défis quotidiens',
    })

    // Update competitive achievements
    await knex('achievements').where('key', 'top_ten').update({
        name: 'Top 10',
        description: 'Classez-vous dans le top 10 d\'un défi quotidien',
    })

    await knex('achievements').where('key', 'podium_finish').update({
        name: 'Sur le Podium',
        description: 'Classez-vous dans le top 3 d\'un défi quotidien',
    })

    await knex('achievements').where('key', 'champion').update({
        name: 'Champion',
        description: 'Obtenez la 1ère place d\'un défi quotidien',
    })
}

export async function down(knex: Knex): Promise<void> {
    // Revert to English
    await knex('achievements').where('key', 'speed_demon').update({
        name: 'Speed Demon',
        description: 'Get 3 perfect speed guesses in a row (under 3 seconds each)',
    })

    await knex('achievements').where('key', 'lightning_reflexes').update({
        name: 'Lightning Reflexes',
        description: 'Answer 10 screenshots in under 3 seconds',
    })

    await knex('achievements').where('key', 'quick_draw').update({
        name: 'Quick Draw',
        description: 'Answer any screenshot in under 2 seconds',
    })

    await knex('achievements').where('key', 'no_hints_needed').update({
        name: 'No Hints Needed',
        description: 'Complete a daily challenge without using any hints',
    })

    await knex('achievements').where('key', 'hint_free_master').update({
        name: 'Hint-Free Master',
        description: 'Complete 10 daily challenges without using hints',
    })

    await knex('achievements').where('key', 'sharp_eye').update({
        name: 'Sharp Eye',
        description: 'Get 10 correct guesses in a row with no wrong answers',
    })

    await knex('achievements').where('key', 'perfect_run').update({
        name: 'Perfect Run',
        description: 'Score exactly 2000 points in a single challenge',
    })

    await knex('achievements').where('key', 'high_roller').update({
        name: 'High Roller',
        description: 'Score over 1800 points in a single challenge',
    })

    await knex('achievements').where('key', 'dedicated_player').update({
        name: 'Dedicated Player',
        description: 'Maintain a 3-day play streak',
    })

    await knex('achievements').where('key', 'weekly_warrior').update({
        name: 'Weekly Warrior',
        description: 'Maintain a 7-day play streak',
    })

    await knex('achievements').where('key', 'month_master').update({
        name: 'Month Master',
        description: 'Maintain a 30-day play streak',
    })

    await knex('achievements').where('key', 'rpg_expert').update({
        name: 'RPG Expert',
        description: 'Correctly identify 10 RPG games',
    })

    await knex('achievements').where('key', 'action_hero').update({
        name: 'Action Hero',
        description: 'Correctly identify 10 Action games',
    })

    await knex('achievements').where('key', 'strategy_savant').update({
        name: 'Strategy Savant',
        description: 'Correctly identify 10 Strategy games',
    })

    await knex('achievements').where('key', 'first_win').update({
        name: 'First Win',
        description: 'Complete your first daily challenge',
    })

    await knex('achievements').where('key', 'century_club').update({
        name: 'Century Club',
        description: 'Complete 100 daily challenges',
    })

    await knex('achievements').where('key', 'top_ten').update({
        name: 'Top Ten',
        description: 'Rank in the top 10 on any daily challenge',
    })

    await knex('achievements').where('key', 'podium_finish').update({
        name: 'Podium Finish',
        description: 'Rank in the top 3 on any daily challenge',
    })

    await knex('achievements').where('key', 'champion').update({
        name: 'Champion',
        description: 'Achieve 1st place on any daily challenge',
    })
}
