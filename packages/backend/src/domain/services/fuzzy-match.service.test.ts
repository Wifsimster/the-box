import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createFuzzyMatchService, type MatchPrecision } from './fuzzy-match.service.js'
import type { DomainLogger } from '../ports/logger.js'

const silentLogger: DomainLogger = {
  child: () => silentLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const service = createFuzzyMatchService({ logger: silentLogger })

function expectMatch(input: string, gameName: string, aliases: string[] = []): void {
  assert.equal(
    service.isMatch(input, gameName, aliases),
    true,
    `expected "${input}" to match "${gameName}"`
  )
}

function expectNoMatch(input: string, gameName: string, aliases: string[] = []): void {
  assert.equal(
    service.isMatch(input, gameName, aliases),
    false,
    `expected "${input}" NOT to match "${gameName}"`
  )
}

function expectPrecision(
  input: string,
  gameName: string,
  precision: MatchPrecision,
  aliases: string[] = []
): void {
  assert.equal(
    service.evaluateMatch(input, gameName, aliases).precision,
    precision,
    `expected "${input}" → "${gameName}" to be ${precision}`
  )
}

/** [guess, title, precision, aliases?] */
type Case = [string, string, MatchPrecision, string[]?]

function expectCases(cases: Case[]): void {
  const failures: string[] = []
  for (const [input, target, precision, aliases] of cases) {
    const actual = service.evaluateMatch(input, target, aliases ?? []).precision
    if (actual !== precision) {
      failures.push(`"${input}" → "${target}": expected ${precision}, got ${actual}`)
    }
  }
  assert.deepEqual(failures, [], `${failures.length} case(s) failed:\n${failures.join('\n')}`)
}

describe('fuzzy-match.service', () => {
  describe('screenshot cases — guesses that must NOT match', () => {
    // The user surfaced "garage band" → "Xenoblade Chronicles 3D" with an
    // arrow. Two unrelated words the title cannot explain → none.
    it('rejects "garage band" for "Xenoblade Chronicles 3D"', () => {
      expectNoMatch('garage band', 'Xenoblade Chronicles 3D')
    })

    it('rejects "mario madness" for "The World Ends With You DS"', () => {
      expectNoMatch('mario madness', 'The World Ends With You DS')
    })

    it('rejects "aliens" for "Ground Control"', () => {
      expectNoMatch('aliens', 'Ground Control')
    })

    it('rejects "loco roco 2" for "Tiny Wings"', () => {
      expectNoMatch('loco roco 2', 'Tiny Wings')
    })

    it('rejects "sim city 3000" for "Command & Conquer: Red Alert 2 - Yuri\'s Revenge"', () => {
      expectNoMatch('sim city 3000', "Command & Conquer: Red Alert 2 - Yuri's Revenge")
    })
  })

  describe('screenshot cases — guesses that should match', () => {
    it('accepts exact normalised guess', () => {
      expectMatch('Tomb raider', 'Tomb Raider')
      expectMatch('tiny wings', 'Tiny Wings')
    })

    it('accepts plural typos', () => {
      expectMatch('plant vs zombies', 'Plants vs. Zombies')
      expectMatch('plants vs zombies', 'Plants vs. Zombies')
    })

    it('grades the base franchise of an expansion-shaped title as partial', () => {
      // Naming only "Command & Conquer" for Red Alert 2 - Yuri's Revenge is
      // the franchise, not the entry: partial, like "call of duty".
      expectPrecision('command and conquers', "Command & Conquer: Red Alert 2 - Yuri's Revenge", 'partial')
      expectPrecision('red alert 2', "Command & Conquer: Red Alert 2 - Yuri's Revenge", 'exact')
      expectPrecision('yuris revenge', "Command & Conquer: Red Alert 2 - Yuri's Revenge", 'exact')
    })

    // Word order is free: the guess is a set of words, not a string.
    it('accepts word-reordered franchise + subtitle ("total war rome" ↔ "ROME: Total War")', () => {
      expectMatch('total war rome', 'ROME: Total War')
      expectMatch('rome total war', 'Total War: ROME')
    })
  })

  describe('word-order tolerance', () => {
    it('matches when input is a permutation of the target', () => {
      expectMatch('hunt wild the witcher 3', 'The Witcher 3: Wild Hunt')
      expectMatch('conquer command', 'Command & Conquer')
    })

    it('does not bypass series-number guard via word reordering', () => {
      expectNoMatch('witcher 2 wild hunt', 'The Witcher 3: Wild Hunt')
      expectPrecision('witcher 2 wild hunt', 'The Witcher 3: Wild Hunt', 'none')
    })
  })

  describe('words the title cannot explain', () => {
    it('rejects fully unrelated guesses', () => {
      expectNoMatch('garage band', 'Xenoblade Chronicles 3D')
      expectNoMatch('hello world', 'Final Fantasy VII')
    })

    it('a franchise word plus a sibling\'s word is a different game, however close the strings', () => {
      // These were all full credit under whole-string Jaro-Winkler.
      expectCases([
        ['pokemon red', 'Pokémon Blue', 'none'],
        ['pokemon sword', 'Pokémon Shield', 'none'],
        ['dead space', 'Dead Cells', 'none'],
        ['doom eternal', 'DOOM (2016)', 'none'],
        ['yakuza kiwami', 'Yakuza 0', 'none'],
        ['need for speed underground', 'Need for Speed: Most Wanted', 'none'],
        ['starcraft 2 legacy of the void', 'StarCraft II: Wings of Liberty', 'none'],
        ['ori and the will of the wisps', 'Ori and the Blind Forest', 'none'],
        ['metal gear solid', 'Metal Gear Rising: Revengeance - Jetstream Sam', 'none'],
        ['hollow knight silksong', 'Hollow Knight', 'none'],
        ['bioshock 2', 'BioShock Infinite', 'none'],
        ['metroid dread', 'Metroid: Zero Mission', 'none'],
        ['shadow of the colossus', 'Shadow of the Beast', 'none'],
        ['fallout new vegas', 'Fallout 4', 'none'],
        ['call of duty xyz', 'Call of Duty: Black Ops II', 'none'],
      ])
    })

    it('a franchise-only guess on a numbered sequel is partial, not none', () => {
      expectPrecision('half-life', 'Half-Life 2: Episode Two', 'partial')
      expectNoMatch('half-life', 'Half-Life 2: Episode Two')
    })
  })

  describe('subtitle-only matching', () => {
    it('accepts "Skyrim" for "The Elder Scrolls V: Skyrim"', () => {
      expectMatch('skyrim', 'The Elder Scrolls V: Skyrim')
    })

    it('accepts full title with stop-prefix', () => {
      expectMatch('the elder scrolls v skyrim', 'The Elder Scrolls V: Skyrim')
    })

    it('accepts the subtitle whatever its length, and the expansion\'s own name', () => {
      expectCases([
        ['breath of the wild', 'The Legend of Zelda: Breath of the Wild', 'exact'],
        ['a thiefs end', 'Uncharted 4: A Thief’s End', 'exact'],
        ['blood and wine', 'The Witcher 3: Wild Hunt – Blood and Wine', 'exact'],
        ['shadow of the erdtree', 'Elden Ring: Shadow of the Erdtree', 'exact'],
        ['delicious last course', 'Cuphead: The Delicious Last Course', 'exact'],
      ])
    })

    it('a generic word alone is not the entry\'s name', () => {
      expectCases([
        ['black', 'Call of Duty: Black Ops', 'none'],
        ['origins', 'Dragon Age: Origins', 'none'],
        ['dragon age', 'Dragon Age: Origins', 'partial'],
        ['dragon age origins', 'Dragon Age: Origins', 'exact'],
        ['world at war', 'Call of Duty: World at War', 'exact'],
        ['reach', 'Halo: Reach', 'exact'],
      ])
    })
  })

  describe('series number guards', () => {
    it('grades a franchise-only guess on a numbered entry as partial', () => {
      expectNoMatch('witcher', 'The Witcher 3: Wild Hunt')
      expectPrecision('witcher', 'The Witcher 3: Wild Hunt', 'partial')
      expectNoMatch('portal', 'Portal 2')
      expectNoMatch('fallout', 'Fallout 2')
    })

    it('rejects mismatched series numbers', () => {
      expectNoMatch('witcher 2', 'The Witcher 3: Wild Hunt')
      expectPrecision('witcher 2', 'The Witcher 3: Wild Hunt', 'none')
    })

    it('rejects a sequel number the title does not carry ("portal 2" is not "Portal")', () => {
      expectCases([
        ['portal 2', 'Portal', 'none'],
        ['hades 2', 'Hades', 'none'],
        ['dark souls 2', 'Dark Souls Remastered', 'none'],
        ['red dead redemption 2', 'Red Dead Redemption', 'none'],
        ['the last of us part 2', 'The Last of Us', 'none'],
        ['metroid prime 2', 'Metroid Prime', 'none'],
        ['donkey kong country 2', 'Donkey Kong Country', 'none'],
        ['super mario bros 3', 'Super Mario Bros.', 'none'],
        ['uncharted 4', 'Uncharted: The Lost Legacy', 'none'],
      ])
    })

    it('accepts "1" for a first entry that carries no number', () => {
      expectCases([
        ['half life 1', 'Half-Life', 'exact'],
        ['dark souls 1', 'Dark Souls', 'exact'],
        ['battlefield 1', 'Battlefield 1942', 'none'],
      ])
    })

    it('accepts matching base + number ("Witcher 3" → "The Witcher 3: Wild Hunt")', () => {
      expectMatch('witcher 3', 'The Witcher 3: Wild Hunt')
      expectMatch('the witcher 3', 'The Witcher 3: Wild Hunt')
      expectMatch('half-life 2', 'Half-Life 2: Episode Two')
    })

    it('reads every number of the title, not just the first', () => {
      expectCases([
        ['left 4 dead', 'Left 4 Dead 2', 'partial'],
        ['left 4 dead 2', 'Left 4 Dead', 'none'],
        ['left 4 dead 2', 'Left 4 Dead 2', 'exact'],
        ['half-life 2 episode one', 'Half-Life 2: Episode Two', 'none'],
        ['half-life 2 episode two', 'Half-Life 2: Episode Two', 'exact'],
        ['half life 2 episode 2', 'Half-Life 2: Episode Two', 'exact'],
        ['mega man 4', 'Mega Man X4', 'none'],
        ['mega man x4', 'Mega Man X4', 'exact'],
        ['final fantasy x-2', 'Final Fantasy X-2', 'exact'],
        ['ffx-2', 'Final Fantasy X-2', 'exact'],
        ['kingdom hearts 358 2 days', 'Kingdom Hearts 358/2 Days', 'exact'],
      ])
    })

    it('handles roman numerals up to XX, number words and ordinals', () => {
      expectCases([
        ['final fantasy 16', 'Final Fantasy XVI', 'exact'],
        ['final fantasy 15', 'Final Fantasy XVI', 'none'],
        ['final fantasy xvi', 'Final Fantasy XVI', 'exact'],
        ['yakuza zero', 'Yakuza 0', 'exact'],
        ['ace combat 0', 'Ace Combat Zero: The Belkan War', 'exact'],
        ['zone of the enders the 2nd runner', 'ZONE OF THE ENDERS: The 2nd Runner - M∀RS', 'exact'],
        ['zone of the enders the second runner', 'ZONE OF THE ENDERS: The 2nd Runner - M∀RS', 'exact'],
        ['rainbow 6 siege', "Tom Clancy's Rainbow Six Siege", 'exact'],
      ])
    })

    it('reads a lone X as 10 and keeps years and large numbers as plain words', () => {
      expectCases([
        ['final fantasy 10', 'Final Fantasy X', 'exact'],
        ['mortal kombat 10', 'Mortal Kombat X', 'exact'],
        ['battlefield 1942', 'Battlefield 1942', 'exact'],
        ['battlefield', 'Battlefield 1942', 'partial'],
        ['fallout 4', 'Fallout 76', 'none'],
        ['fallout 76', 'Fallout 76', 'exact'],
        ['nba 2k22', 'NBA 2K23', 'none'],
        ['nba 2k23', 'NBA 2K23', 'exact'],
        ['god of war 2018', 'God of War (2018)', 'exact'],
        ['god of war 3', 'God of War (2018)', 'none'],
        ['doom 2016', 'DOOM (2016)', 'exact'],
      ])
    })

    it('"Part I" and "Part II" are the first and second entry', () => {
      expectCases([
        ['the last of us', 'The Last of Us Part I', 'exact'],
        ['the last of us', 'The Last of Us Part II', 'partial'],
        ['the last of us 2', 'The Last of Us Part II', 'exact'],
        ['the last of us part 2', 'The Last of Us Part II', 'exact'],
        ['tlou2', 'The Last of Us Part II', 'exact'],
      ])
    })

    it('reads a comma-grouped franchise number as flavour, not a sequel number', () => {
      assert.equal(service.parseGameTitle('Warhammer 40,000').seriesNumber, null)
    })
  })

  describe('DLC handling', () => {
    it('rejects base-name-only guess for explicit DLC titles', () => {
      expectNoMatch('cuphead', 'Cuphead: The Delicious Last Course')
      expectPrecision('cuphead', 'Cuphead: The Delicious Last Course', 'none')
    })

    it('grades the base-name guess for a main game with subtitle as partial', () => {
      expectPrecision('paper mario', 'Paper Mario: The Thousand-Year Door', 'partial')
    })

    it('base + number names the entry even for a numbered expansion', () => {
      expectCases([
        ['witcher 3', 'The Witcher 3: Wild Hunt – Blood and Wine', 'exact'],
        ['splatoon 2', 'Splatoon 2: Octo Expansion', 'exact'],
        ['splatoon', 'Splatoon 2: Octo Expansion', 'partial'],
        ['octo expansion', 'Splatoon 2: Octo Expansion', 'exact'],
      ])
    })
  })

  describe('alias matching', () => {
    it('accepts a typed alias', () => {
      expectMatch('cs go', 'Counter-Strike: Global Offensive', ['CS:GO', 'csgo'])
    })

    it('accepts a permutation of an alias', () => {
      expectMatch('go counter strike', 'Counter-Strike: Global Offensive', ['counter strike go'])
    })

    it('a wrong number is wrong even against a numbered alias', () => {
      expectCases([
        ['gta 4', 'Grand Theft Auto V', 'none', ['GTA 5']],
        ['gta 5', 'Grand Theft Auto V', 'exact', ['GTA 5']],
        ['final fantasy 8', 'Final Fantasy VII', 'none', ['Final Fantasy 7']],
        ['ffviii', 'Final Fantasy VII', 'none', ['FFVII']],
        ['dsiii', 'Dark Souls II', 'none', ['DSII', 'DS2']],
      ])
    })

    it('an alias naming another entry is ignored, and a franchise alias is the franchise', () => {
      expectCases([
        ['gta 4', 'Grand Theft Auto V', 'none', ['GTA 4']],
        ['mario kart 7', 'Mario Kart 8', 'none', ['Mario Kart 7']],
        ['les sims', 'The Sims 4', 'partial', ['Les Sims']],
        ['portal', 'Portal 2', 'partial', ['Portal']],
        ['cuphead', 'Cuphead: The Delicious Last Course', 'none', ['Cuphead']],
        ['remake', 'Resident Evil 2', 'none', ['Remake', 'RE2 Remake']],
        ['iv', 'Grand Theft Auto IV', 'none', ['IV']],
      ])
    })

    it('alias shorthand is spelled exactly and never re-abbreviated', () => {
      expectCases([
        ['re', 'Resident Evil 4', 'partial', ['RE4']],
        ['lo', 'League of Legends', 'none', ['LoL']],
        ['tw3', 'The Witcher 3: Wild Hunt', 'exact', ['TW3']],
        ['zelda botx', 'The Legend of Zelda: Breath of the Wild', 'none', ['BotW']],
        ['r4', 'Resident Evil 4', 'partial', ['RE4']],
        ['pokemon eppee', 'Pokémon Sword', 'exact', ['Pokémon Épée et Bouclier', 'Pokémon Épée']],
      ])
    })

    it('an expansion listed as an alias of the base game is not the base game', () => {
      expectCases([
        ['blood and wine', 'The Witcher 3: Wild Hunt', 'partial', ['The Witcher 3: Wild Hunt – Blood and Wine']],
        ['chiens et chats', 'The Sims 4', 'partial', ['Les Sims 4: Chiens et Chats']],
        ['les sables du temps', 'Prince of Persia: The Sands of Time', 'exact', ['Prince of Persia : Les Sables du Temps']],
      ])
    })

    it('a French alias is a full answer, a foreign French word is not', () => {
      expectCases([
        ['pokemon epee', 'Pokémon Sword', 'exact', ['Pokémon Épée']],
        ['pokémon épée', 'Pokémon Sword', 'exact', ['Pokémon Épée']],
        ['pokemon bouclier', 'Pokémon Sword', 'none', ['Pokémon Épée']],
        ['les chevaliers de baphomet', 'Broken Sword: The Shadow of the Templars', 'exact', ['Les Chevaliers de Baphomet']],
        ['la terre du milieu l\'ombre du mordor', 'Middle-earth: Shadow of Mordor', 'exact', ['La Terre du Milieu : L\'Ombre du Mordor']],
      ])
    })
  })

  describe('parenthesised alternate names and years', () => {
    it('accepts a one-letter typo of the base name', () => {
      expectMatch('farenheit', 'Fahrenheit (Indigo Prophecy)')
    })

    it('accepts the exact base name', () => {
      expectMatch('Fahrenheit', 'Fahrenheit (Indigo Prophecy)')
    })

    it('accepts the parenthesised alternate name', () => {
      expectMatch('Indigo Prophecy', 'Fahrenheit (Indigo Prophecy)')
    })

    it('still rejects unrelated guesses against parenthesised titles', () => {
      expectNoMatch('max payne', 'Fahrenheit (Indigo Prophecy)')
      expectNoMatch('max payne 3', 'Fahrenheit (Indigo Prophecy)')
    })

    it('a year in parentheses is optional and never a name', () => {
      expectCases([
        ['god of war', 'God of War (2018)', 'exact'],
        ['resident evil 2', 'Resident Evil 2 (2019)', 'exact'],
        ['resident evil 2 remake', 'Resident Evil 2 (2019)', 'exact'],
        ['2018', 'God of War (2018)', 'none'],
        ['(2018)', 'God of War (2018)', 'none'],
      ])
    })
  })

  describe('expansion-suffix titles', () => {
    it('accepts the base game for an expansion-suffixed title', () => {
      expectMatch('Warhammer dawn of war', 'Warhammer 40,000: Dawn of War - Dark Crusade')
      expectMatch('Warhammer 40000 dawn of war', 'Warhammer 40,000: Dawn of War - Dark Crusade')
    })

    it('accepts the full expansion title', () => {
      expectMatch(
        'warhammer 40000 dawn of war dark crusade',
        'Warhammer 40,000: Dawn of War - Dark Crusade'
      )
    })

    it('still rejects an unrelated guess for an expansion-suffixed title', () => {
      expectNoMatch('sim city 3000', "Command & Conquer: Red Alert 2 - Yuri's Revenge")
    })
  })

  describe('editions, remasters and brand prefixes', () => {
    it('edition suffixes are optional on both sides', () => {
      expectCases([
        ['the witcher 3 wild hunt', 'The Witcher 3 Wild Hunt - Complete Edition', 'exact'],
        ['witcher 3', 'The Witcher 3: Wild Hunt - Game of the Year Edition', 'exact'],
        ['the witcher 3 wild hunt goty edition', 'The Witcher 3: Wild Hunt', 'exact'],
        ['skyrim', 'The Elder Scrolls V: Skyrim Legendary Edition', 'exact'],
        ['skyrim special edition', 'The Elder Scrolls V: Skyrim', 'exact'],
        ['mass effect', 'Mass Effect: Legendary Edition', 'exact'],
        ['the last of us', 'The Last Of Us Remastered', 'exact'],
        ['dark souls', 'Dark Souls Remastered', 'exact'],
        ['final fantasy 7', 'Final Fantasy VII Remake', 'exact'],
        ['ff7r', 'Final Fantasy VII Remake', 'exact'],
        ['persona 5', 'Persona 5 Royal', 'exact'],
        ['p5r', 'Persona 5 Royal', 'exact'],
        ['kingdom hearts 2', 'Kingdom Hearts II Final Mix', 'exact'],
        ['mario kart 8', 'Mario Kart 8 Deluxe', 'exact'],
        ['ocarina of time', 'The Legend of Zelda: Ocarina of Time 3D', 'exact'],
        ['zelda wind waker', 'The Legend of Zelda: The Wind Waker HD', 'exact'],
        ['bioshock', 'BioShock: The Collection', 'exact'],
        ['ace attorney', 'Phoenix Wright: Ace Attorney Trilogy', 'exact'],
        ['death stranding', 'Death Stranding Director’s Cut', 'exact'],
        ['midnight club 3', 'Midnight Club 3: DUB Edition Remix', 'exact'],
      ])
    })

    it('"3D" in the middle of a title is part of the name', () => {
      expectCases([
        ['super mario world', 'Super Mario 3D World', 'partial'],
        ['super mario 3d world', 'Super Mario World', 'none'],
        ['super mario 3d world', 'Super Mario 3D World', 'exact'],
        ['xenoblade chronicles', 'Xenoblade Chronicles 3D', 'exact'],
        ['xenoblade chronicles 3', 'Xenoblade Chronicles 3D', 'none'],
      ])
    })

    it('owner prefixes and a leading "Super" are optional', () => {
      expectCases([
        ['civilization 6', "Sid Meier's Civilization VI", 'exact'],
        ['civ 6', "Sid Meier's Civilization VI", 'exact'],
        ['civilization 5', "Sid Meier's Civilization VI", 'none'],
        ['spider-man 2', "Marvel's Spider-Man 2", 'exact'],
        ['spiderman 2', "Marvel's Spider-Man 2", 'exact'],
        ['miles morales', "Marvel's Spider-Man: Miles Morales", 'exact'],
        ['rainbow six siege', "Tom Clancy's Rainbow Six Siege", 'exact'],
        ['mario odyssey', 'Super Mario Odyssey', 'exact'],
        ['smash bros', 'Super Smash Bros. Ultimate', 'partial'],
        ['metroid', 'Super Metroid', 'partial'],
        ['super mario bros', 'New Super Mario Bros.', 'partial'],
        ['new super mario bros', 'Super Mario Bros.', 'none'],
      ])
    })
  })

  describe('player shorthand: acronyms and glued words', () => {
    it('derives acronyms of the franchise, the subtitle and the whole title', () => {
      expectCases([
        ['gta 5', 'Grand Theft Auto V', 'exact'],
        ['gta v', 'Grand Theft Auto V', 'exact'],
        ['gta vice city', 'Grand Theft Auto: Vice City', 'exact'],
        ['botw', 'The Legend of Zelda: Breath of the Wild', 'exact'],
        ['zelda botw', 'The Legend of Zelda: Breath of the Wild', 'exact'],
        ['tloz botw', 'The Legend of Zelda: Breath of the Wild', 'exact'],
        ['totk', 'The Legend of Zelda: Tears of the Kingdom', 'exact'],
        ['botw', 'The Legend of Zelda: Tears of the Kingdom', 'none'],
        ['tlou', 'The Last Of Us Remastered', 'exact'],
        ['cod 4', 'Call of Duty 4: Modern Warfare', 'exact'],
        ['cod black ops 2', 'Call of Duty: Black Ops II', 'exact'],
        ['cod bo2', 'Call of Duty: Black Ops II', 'exact'],
        ['mw2', 'Call of Duty: Modern Warfare 2', 'exact'],
        ['csgo', 'Counter-Strike: Global Offensive', 'exact'],
        ['mgsv', 'Metal Gear Solid V: The Phantom Pain', 'exact'],
        ['ffvii', 'Final Fantasy VII', 'exact'],
        ['ffviii', 'Final Fantasy VII', 'none'],
        ['wow', 'World of Warcraft', 'exact'],
        ['lol', 'League of Legends', 'exact'],
        ['tf2', 'Team Fortress 2', 'exact'],
        ['l4d2', 'Left 4 Dead 2', 'exact'],
        ['aoe2', 'Age of Empires II: The Age of Kings', 'exact'],
        ['r6 siege', "Tom Clancy's Rainbow Six Siege", 'exact'],
        ['ssbu', 'Super Smash Bros. Ultimate', 'exact'],
      ])
    })

    it('splits a number glued to the franchise ("ff7", "witcher3")', () => {
      expectCases([
        ['witcher3', 'The Witcher 3: Wild Hunt', 'exact'],
        ['ff7', 'Final Fantasy VII', 'exact'],
        ['ff8', 'Final Fantasy VII', 'none'],
        ['re4', 'Resident Evil 4', 'exact'],
        ['re2', 'Resident Evil 4', 'none'],
        ['mgs2', 'Metal Gear Solid 2: Sons of Liberty', 'exact'],
        ['kh2', 'Kingdom Hearts II Final Mix', 'exact'],
        ['ds3', 'Dark Souls III', 'exact'],
        ['ds2', 'Dark Souls III', 'none'],
        ['hl2', 'Half-Life 2', 'exact'],
        ['mk11', 'Mortal Kombat 11', 'exact'],
        ['gt4', 'Gran Turismo 4', 'exact'],
        ['rdr2', 'Red Dead Redemption 2', 'exact'],
        ['dmc 5', 'Devil May Cry 5', 'exact'],
      ])
    })

    it('a bare acronym is the franchise only; two letters alone are never full credit', () => {
      expectCases([
        ['gta', 'Grand Theft Auto V', 'partial'],
        ['gta', 'Grand Theft Auto: Vice City', 'partial'],
        ['cod', 'Call of Duty: Black Ops II', 'partial'],
        ['mgs', 'Metal Gear Solid 2: Sons of Liberty', 'partial'],
        ['re', 'Resident Evil 4', 'partial'],
        ['ds', 'Dark Souls', 'partial'],
        ['bi', 'BioShock Infinite', 'partial'],
        ['go', 'God of War', 'none'],
      ])
    })

    it('glued and split words', () => {
      expectCases([
        ['halflife 2', 'Half-Life 2', 'exact'],
        ['halflife', 'Half-Life 2', 'partial'],
        ['eldenring', 'Elden Ring', 'exact'],
        ['stalker shadow of chernobyl', 'S.T.A.L.K.E.R.: Shadow of Chernobyl', 'exact'],
        ['fear', 'F.E.A.R.', 'exact'],
        ['counterstrike global offensive', 'Counter-Strike: Global Offensive', 'exact'],
        ['nier automata', 'NieR:Automata', 'exact'],
        ['automata', 'NieR:Automata', 'exact'],
        ['nier', 'NieR:Automata', 'partial'],
      ])
    })
  })

  // Live session against "Grand Theft Auto: Vice City" surfaced two bugs:
  // (A) "grand thief auto 3" was accepted (+125, wrong — that's GTA III);
  // (B) "gta vice city" was rejected. These tests pin both.
  describe('GTA series — acronym + numbered ambiguity', () => {
    describe('target: "Grand Theft Auto: Vice City"', () => {
      const target = 'Grand Theft Auto: Vice City'

      it('accepts subtitle-only "vice city"', () => {
        expectMatch('vice city', target)
      })

      it('accepts acronym + subtitle "gta vice city"', () => {
        expectMatch('gta vice city', target)
      })

      it('accepts full title "grand theft auto vice city"', () => {
        expectMatch('grand theft auto vice city', target)
      })

      it('accepts full title with colon', () => {
        expectMatch('grand theft auto: vice city', target)
      })

      it('accepts per-game alias "gta vc"', () => {
        expectMatch('gta vc', target, ['gta vc', 'vc'])
      })

      it('grades bare acronym "gta" as partial (ambiguous)', () => {
        expectNoMatch('gta', target)
        expectPrecision('gta', target, 'partial')
      })

      it('rejects "gta 3" — player means GTA III', () => {
        expectNoMatch('gta 3', target)
        expectPrecision('gta 3', target, 'none')
      })

      it('rejects "grand thief auto 3" — wrong number + misspelling (original bug)', () => {
        expectNoMatch('grand thief auto 3', target)
        expectPrecision('grand thief auto 3', target, 'none')
      })

      it('rejects "gta 5" — player means GTA V', () => {
        expectNoMatch('gta 5', target)
      })

      it('rejects "san andreas" — different game\'s subtitle', () => {
        expectNoMatch('san andreas', target)
        expectPrecision('san andreas', target, 'none')
      })

      it('rejects "Grand Theft Auto V"', () => {
        expectNoMatch('Grand Theft Auto V', target)
        expectPrecision('Grand Theft Auto V', target, 'none')
      })
    })

    describe('target: "Grand Theft Auto V"', () => {
      const target = 'Grand Theft Auto V'

      it('accepts "gta 5" — arabic↔roman via acronym expansion', () => {
        expectMatch('gta 5', target)
      })

      it('accepts "gta v" — roman via acronym expansion', () => {
        expectMatch('gta v', target)
      })

      it('accepts "grand theft auto 5"', () => {
        expectMatch('grand theft auto 5', target)
      })

      it('rejects "gta vice city" — different entry', () => {
        expectNoMatch('gta vice city', target)
        expectPrecision('gta vice city', target, 'none')
      })

      it('rejects subtitle-only "vice city"', () => {
        expectNoMatch('vice city', target)
        expectPrecision('vice city', target, 'none')
      })
    })

    describe('target: "Grand Theft Auto: San Andreas"', () => {
      const target = 'Grand Theft Auto: San Andreas'

      it('accepts subtitle-only "san andreas"', () => {
        expectMatch('san andreas', target)
      })

      it('accepts "gta san andreas"', () => {
        expectMatch('gta san andreas', target)
      })

      it('accepts per-game alias "gta sa"', () => {
        expectMatch('gta sa', target, ['gta sa', 'sa'])
      })

      it('forgives one badly misspelled franchise word when the entry is named', () => {
        expectMatch('grand thieves auto san andreas', target)
      })

      it('rejects "gta 3" — wrong entry', () => {
        expectNoMatch('gta 3', target)
      })

      it('rejects "vice city" — different subtitle', () => {
        expectNoMatch('vice city', target)
      })
    })
  })

  describe('graded matching — evaluateMatch precision tiers', () => {
    describe('exact (full title identified)', () => {
      it('full normalised title', () => {
        expectPrecision('metal gear solid 2', 'Metal Gear Solid 2: Sons of Liberty', 'exact')
        expectPrecision('final fantasy xii', 'Final Fantasy XII', 'exact')
        expectPrecision('final fantasy 12', 'Final Fantasy XII', 'exact')
      })
      it('base + correct number', () => {
        expectPrecision('witcher 3', 'The Witcher 3: Wild Hunt', 'exact')
        expectPrecision('portal 2', 'Portal 2', 'exact')
      })
      it('subtitle-only is a full identification, not partial', () => {
        expectPrecision('skyrim', 'The Elder Scrolls V: Skyrim', 'exact')
      })
      it("the entry's own name (subtitle), whatever its length", () => {
        expectPrecision('breath of the wild', 'The Legend of Zelda: Breath of the Wild', 'exact')
        expectPrecision('ragnarok', 'God of War: Ragnarök', 'exact')
        expectPrecision('arkham city', 'Batman: Arkham City', 'exact')
      })
      it('franchise + subtitle, or an alias', () => {
        expectPrecision('far cry primal', 'Far Cry Primal', 'exact')
        expectPrecision('halo reach', 'Halo: Reach', 'exact')
        expectPrecision('dawn of war', 'Warhammer 40,000: Dawn of War - Dark Crusade', 'exact')
        expectPrecision('zelda botw', 'The Legend of Zelda: Breath of the Wild', 'exact', ['Zelda BOTW'])
      })
      it('franchise + subtitle with the number omitted is still the entry', () => {
        expectCases([
          ['assassins creed black flag', "Assassin's Creed IV: Black Flag", 'exact'],
          ['assassins creed 4', "Assassin's Creed IV: Black Flag", 'exact'],
          ['zelda ocarina of time', 'The Legend of Zelda: Ocarina of Time 3D', 'exact'],
          ['jedi survivor', 'Star Wars Jedi: Survivor', 'exact'],
          ['pokemon x', 'Pokémon X, Y', 'exact'],
          ['pokemon y', 'Pokémon X, Y', 'exact'],
        ])
      })
    })

    describe('partial — one rule for franchise-only answers', () => {
      it('numbered, subtitled and plain-suffixed titles grade the same', () => {
        expectPrecision('far cry', 'Far Cry 5', 'partial')
        expectPrecision('far cry', 'Far Cry Primal', 'partial')
        expectPrecision('halo', 'Halo 3', 'partial')
        expectPrecision('halo', 'Halo: Reach', 'partial')
        expectPrecision('halo', 'Halo Infinite', 'partial')
        expectPrecision('call of duty', 'Call of Duty: Black Ops', 'partial')
        expectPrecision('assassins creed', "Assassin's Creed Valhalla", 'partial')
        expectPrecision('paper mario', 'Paper Mario: The Thousand-Year Door', 'partial')
        expectPrecision('god of war', 'God of War: Ragnarök', 'partial')
        expectPrecision('hollow knight', 'Hollow Knight: Silksong', 'partial')
      })
      it('franchise words that do not start the title', () => {
        expectPrecision('zelda', 'The Legend of Zelda: Breath of the Wild', 'partial')
        expectPrecision('tomb raider', 'Rise of the Tomb Raider', 'partial')
        expectPrecision('mario', 'Super Mario Odyssey', 'partial')
      })
      it('a franchise made of generic words is still a franchise', () => {
        expectCases([
          ['red dead', 'Red Dead Redemption 2', 'partial'],
          ['star wars', 'Star Wars Jedi: Fallen Order', 'partial'],
          ['the last of us', 'The Last of Us Part II', 'partial'],
        ])
      })
      it('a franchise acronym on its own', () => {
        expectPrecision('gta', 'Grand Theft Auto V', 'partial')
        expectPrecision('gta', 'Grand Theft Auto: Vice City', 'partial')
      })
      it('isMatch (strict) is the exact tier only', () => {
        expectNoMatch('call of duty', 'Call of Duty: Black Ops')
        expectNoMatch('zelda', 'The Legend of Zelda: Breath of the Wild')
        expectMatch('black ops', 'Call of Duty: Black Ops')
      })
    })

    describe('French players', () => {
      it('accents are folded, not dropped', () => {
        expectPrecision('pokemon x', 'Pokémon X, Y', 'exact')
        expectPrecision('ragnarök', 'God of War: Ragnarok', 'exact')
        expectPrecision('pokémon', 'Pokemon X, Y', 'partial')
        expectPrecision('okami', 'Ōkami', 'exact')
        expectPrecision('hadès', 'Hades', 'exact')
      })
      it('a French leading article reads like "The"', () => {
        expectPrecision('les sims 4', 'The Sims 4', 'exact')
        expectPrecision('les sims', 'The Sims 4', 'partial')
        expectPrecision('les sims 3', 'The Sims 4', 'none')
      })
      it('a French alias is a full answer', () => {
        expectPrecision('pokemon epee', 'Pokémon Sword', 'exact', ['Pokémon Épée'])
      })
      it('"et", "&", "and", "vs" and "versus" are the same glue', () => {
        expectCases([
          ['ratchet et clank', 'Ratchet & Clank', 'exact'],
          ['ratchet and clank', 'Ratchet & Clank', 'exact'],
          ['plants versus zombies', 'Plants vs. Zombies', 'exact'],
          ['mario et luigi', "Mario & Luigi: Bowser's Inside Story + Bowser Jr's Journey", 'partial'],
          ['bowsers inside story', "Mario & Luigi: Bowser's Inside Story + Bowser Jr's Journey", 'exact'],
        ])
      })
      it('French colon spacing, typographic apostrophes and trademark signs', () => {
        expectCases([
          ['zelda : breath of the wild', 'The Legend of Zelda: Breath of the Wild', 'exact'],
          ['uncharted 4 a thief\'s end', 'Uncharted 4: A Thief’s End', 'exact'],
          ['the witcher 3™', 'The Witcher 3: Wild Hunt', 'exact'],
          ['  the   witcher 3  ', 'The Witcher 3: Wild Hunt', 'exact'],
          ['la legende de zelda breath of the wild', 'The Legend of Zelda: Breath of the Wild', 'exact'],
        ])
      })
      it('a Cyrillic look-alike in the catalogue name still matches', () => {
        expectPrecision('starcraft 2 legacy of the void', 'StarСraft II: Legacy of the Void', 'exact')
      })
    })

    describe('partial (franchise named, number / subtitle omitted)', () => {
      it('reported cases — franchise without the number', () => {
        expectPrecision('metal gear solid', 'Metal Gear Solid 2: Sons of Liberty', 'partial')
        expectPrecision('final fantasy', 'Final Fantasy XII', 'partial')
        expectPrecision('pokemon', 'Pokémon X, Y', 'partial')
      })
      it('numbered franchises where the number is omitted', () => {
        expectPrecision('witcher', 'The Witcher 3: Wild Hunt', 'partial')
        expectPrecision('the witcher', 'The Witcher 3: Wild Hunt', 'partial')
        expectPrecision('portal', 'Portal 2', 'partial')
        expectPrecision('fallout', 'Fallout 2', 'partial')
        expectPrecision('half-life', 'Half-Life 2: Episode Two', 'partial')
      })
      it('isMatch (strict) still rejects these', () => {
        expectNoMatch('metal gear solid', 'Metal Gear Solid 2: Sons of Liberty')
        expectNoMatch('final fantasy', 'Final Fantasy XII')
        expectNoMatch('witcher', 'The Witcher 3: Wild Hunt')
      })
    })

    describe('none (must never become partial)', () => {
      it('a WRONG number names a different game', () => {
        expectPrecision('final fantasy vii', 'Final Fantasy VIII', 'none')
        expectPrecision('final fantasy 10', 'Final Fantasy VIII', 'none')
        expectPrecision('witcher 2', 'The Witcher 3: Wild Hunt', 'none')
        expectPrecision('pokemon 2', 'Pokémon X, Y', 'none')
      })
      it('a foreign specifier names a different entry', () => {
        expectPrecision('pokemon diamond', 'Pokémon X, Y', 'none')
        expectPrecision('pokemon land', 'Pokémon X, Y', 'none')
      })
      it('DLC base-name stays rejected (unnumbered subtitled target → no partial)', () => {
        expectPrecision('cuphead', 'Cuphead: The Delicious Last Course', 'none')
      })
      it('a generic title word alone earns nothing', () => {
        expectPrecision('dark', 'Dark Souls III', 'none')
        expectPrecision('super', 'Super Mario Odyssey', 'none')
        expectPrecision('war', 'God of War: Ragnarök', 'none')
        expectPrecision('dark 3', 'Dark Souls III', 'none')
      })
      it('a missing or wrong number in the subtitle is not the entry', () => {
        expectPrecision('zelda 2', 'The Legend of Zelda: Breath of the Wild', 'none')
        expectPrecision('black ops', 'Call of Duty: Black Ops II', 'partial')
        expectPrecision('black ops 3', 'Call of Duty: Black Ops II', 'none')
      })
      it('unrelated guesses stay none', () => {
        expectPrecision('garage band', 'Xenoblade Chronicles 3D', 'none')
        expectPrecision('baldurs gate 3', 'Divinity: Original Sin - Enhanced Edition', 'none')
      })
    })
  })

  describe('typos and short titles', () => {
    it('tolerates one edit on medium words and two on long ones', () => {
      expectCases([
        ['hadse', 'Hades', 'exact'],
        ['minecarft', 'Minecraft', 'exact'],
        ['stardew valey', 'Stardew Valley', 'exact'],
        ['assasins creed valhalla', "Assassin's Creed Valhalla", 'exact'],
        ['planetscape torment', 'Planescape: Torment', 'exact'],
        ['league of legend', 'League of Legends', 'exact'],
        ['demons souls', "Demon's Souls", 'exact'],
      ])
    })

    it('short words must be spelled exactly, so neighbouring titles stay apart', () => {
      expectCases([
        ['rome', 'Rime', 'none'],
        ['grid', 'Gris', 'none'],
        ['fe', 'Fez', 'none'],
        ['lumo', 'Limbo', 'none'],
        ['contra', 'Control', 'none'],
        ['dark souls', "Demon's Souls", 'none'],
      ])
    })

    it('a four-letter word tolerates a typo only with other words around it', () => {
      expectCases([
        ['hslo 3', 'Halo 3', 'exact'],
        ['haol 3', 'Halo 3', 'exact'],
        ['elden rign', 'Elden Ring', 'exact'],
        ['witcher 3 wild hint', 'The Witcher 3: Wild Hunt', 'exact'],
        ['hale', 'Halo', 'none'],
      ])
    })

    it('a truncated word is not a typo', () => {
      expectCases([
        ['a space for the unb', 'A Space for the Unbound', 'none'],
        ['hade', 'Hades', 'none'],
        ['minecraf', 'Minecraft', 'none'],
        ['skyri', 'The Elder Scrolls V: Skyrim', 'none'],
        ['porta 2', 'Portal 2', 'exact'],
        ['dark soul', 'Dark Souls', 'exact'],
        ['plant vs zombies', 'Plants vs. Zombies', 'exact'],
        ['elden', 'Elden Ring', 'partial'],
        ['do', 'Doom', 'none'],
        ['hol', 'Hollow Knight', 'none'],
      ])
    })
  })

  describe('robustness', () => {
    it('empty, blank and punctuation-only guesses earn nothing', () => {
      expectCases([
        ['', 'Hades', 'none'],
        ['   ', 'Hades', 'none'],
        ['!!!', 'Hades', 'none'],
        ['the', 'The Last of Us', 'none'],
        ['of', 'God of War', 'none'],
        ['2', 'Portal 2', 'none'],
      ])
    })

    it('a very long guess is truncated, not a CPU sink', () => {
      const start = performance.now()
      const result = service.evaluateMatch('a'.repeat(100_000), 'The Witcher 3: Wild Hunt', ['alias'])
      assert.equal(result.precision, 'none')
      assert.ok(performance.now() - start < 200, 'should stay fast')
    })

    it('digit-only titles', () => {
      expectCases([
        ['2048', '2048', 'exact'],
        ['1080 snowboarding', '1080° Snowboarding', 'exact'],
      ])
    })
  })

  describe('parseGameTitle', () => {
    it('exposes the franchise root, number and subtitle', () => {
      assert.deepEqual(service.parseGameTitle('The Witcher 3: Wild Hunt'), {
        seriesName: 'the witcher',
        seriesNumber: 3,
        subtitle: 'Wild Hunt',
        baseName: 'The Witcher 3',
        original: 'The Witcher 3: Wild Hunt',
        normalized: 'the witcher 3 wild hunt',
      })
      assert.equal(service.parseGameTitle('Dark Souls III').seriesName, 'dark souls')
      assert.equal(service.parseGameTitle('Dark Souls III').seriesNumber, 3)
      assert.equal(service.parseGameTitle('Dark Souls').seriesName, 'dark souls')
      assert.equal(service.parseGameTitle('The Last of Us Part II').seriesName, 'the last of us')
      assert.equal(service.parseGameTitle('Left 4 Dead').seriesNumber, null)
    })

    it('seriesNumbersMatch', () => {
      assert.equal(service.seriesNumbersMatch(null, 3), true)
      assert.equal(service.seriesNumbersMatch(3, null), false)
      assert.equal(service.seriesNumbersMatch(3, 3), true)
      assert.equal(service.seriesNumbersMatch(2, 3), false)
    })
  })

  // Every case the redesign was checked against, as one table. Each row is
  // [guess, title, precision, aliases?]. Keep it sorted by theme when adding.
  describe('regression corpus', () => {
    it('grades every corpus case as expected', () => {
      expectCases(CORPUS)
    })
  })
})

const CORPUS: Case[] = [
    ['left 4 dead', 'Left 4 Dead 2', 'partial'],
    ['left 4 dead 2', 'Left 4 Dead', 'none'],
    ['left 4 dead 2', 'Left 4 Dead 2', 'exact'],
    ['l4d2', 'Left 4 Dead 2', 'exact'],
    ['half-life 2 episode one', 'Half-Life 2: Episode Two', 'none'],
    ['half-life 2 episode two', 'Half-Life 2: Episode Two', 'exact'],
    ['half life 2', 'Half-Life 2: Episode Two', 'exact'],
    ['gta 4', 'Grand Theft Auto V', 'none', ['GTA 5']],
    ['gta 5', 'Grand Theft Auto V', 'exact', ['GTA 5']],
    ['final fantasy 8', 'Final Fantasy VII', 'none', ['Final Fantasy 7']],
    ['witcher3', 'The Witcher 3: Wild Hunt', 'exact'],
    ['ff7', 'Final Fantasy VII', 'exact'],
    ['ff8', 'Final Fantasy VII', 'none'],
    ['re4', 'Resident Evil 4', 'exact'],
    ['re2', 'Resident Evil 4', 'none'],
    ['mgs2', 'Metal Gear Solid 2: Sons of Liberty', 'exact'],
    ['mega man 4', 'Mega Man X4', 'none'],
    ['mega man x4', 'Mega Man X4', 'exact'],
    ['mega man 10', 'Mega Man X', 'exact'],
    ['mega man x', 'Mega Man X', 'exact'],
    ['assassins creed black flag', "Assassin's Creed IV: Black Flag", 'exact'],
    ['assassins creed 4', "Assassin's Creed IV: Black Flag", 'exact'],
    ['assassins creed', "Assassin's Creed IV: Black Flag", 'partial'],
    ['zelda wind waker', 'The Legend of Zelda: The Wind Waker HD', 'exact'],
    ['the legend of zelda the wind waker', 'The Legend of Zelda: The Wind Waker HD', 'exact'],
    ['pokemon y', 'Pokémon X, Y', 'exact'],
    ['pokemon x', 'Pokémon X, Y', 'exact'],
    ['god of war', 'God of War: Ragnarök', 'partial'],
    ['god of war ragnarok', 'God of War: Ragnarök', 'exact'],
    ['god of war', 'God of War (2018)', 'exact'],
    ['god of war 2018', 'God of War (2018)', 'exact'],
    ['doom', 'DOOM (2016)', 'exact'],
    ['doom', 'Doom 3', 'partial'],
    ['doom 2', 'Doom 3', 'none'],
    ['resident evil 2 remake', 'Resident Evil 2 (2019)', 'exact'],
    ['resident evil 2', 'Resident Evil 2 (2019)', 'exact'],
    ['call of duty modern warfare', 'Call of Duty 4: Modern Warfare', 'exact'],
    ['cod 4', 'Call of Duty 4: Modern Warfare', 'exact'],
    ['modern warfare 2', 'Call of Duty 4: Modern Warfare', 'none'],
    ['fallout new vegas', 'Fallout 4', 'none'],
    ['fallout 4', 'Fallout: New Vegas', 'none'],
    ['new vegas', 'Fallout: New Vegas', 'exact'],
    ['fallout', 'Fallout: New Vegas', 'partial'],
    ['mario kart 8', 'Mario Kart 8 Deluxe', 'exact'],
    ['mario kart', 'Mario Kart 8 Deluxe', 'partial'],
    ['mario kart wii', 'Mario Kart 8 Deluxe', 'none'],
    ['super mario bros 3', 'Super Mario Bros. 3', 'exact'],
    ['super mario bros', 'Super Mario Bros. 3', 'partial'],
    ['super mario bros 3', 'Super Mario Bros.', 'none'],
    ['new super mario bros', 'Super Mario Bros.', 'none'],
    ['spider-man 2', "Marvel's Spider-Man 2", 'exact'],
    ['spiderman 2', "Marvel's Spider-Man 2", 'exact'],
    ['spider man', "Marvel's Spider-Man 2", 'partial'],
    ['miles morales', "Marvel's Spider-Man: Miles Morales", 'exact'],
    ['spider-man 2', "Marvel's Spider-Man: Miles Morales", 'none'],
    ['jedi survivor', 'Star Wars Jedi: Survivor', 'exact'],
    ['jedi fallen order', 'Star Wars Jedi: Survivor', 'none'],
    ['star wars jedi fallen order', 'Star Wars Jedi: Fallen Order', 'exact'],
    ['fallen order', 'Star Wars Jedi: Fallen Order', 'exact'],
    ['tears of the kingdom', 'The Legend of Zelda: Tears of the Kingdom', 'exact'],
    ['breath of the wild', 'The Legend of Zelda: Tears of the Kingdom', 'none'],
    ['zelda totk', 'The Legend of Zelda: Tears of the Kingdom', 'exact'],
    ['totk', 'The Legend of Zelda: Tears of the Kingdom', 'exact'],
    ['botw', 'The Legend of Zelda: Breath of the Wild', 'exact'],
    ['botw', 'The Legend of Zelda: Tears of the Kingdom', 'none'],
    ['pokemon sword', 'Pokémon Shield', 'none'],
    ['pokemon epee', 'Pokémon Sword', 'exact', ['Pokémon Épée']],
    ['pokémon épée', 'Pokémon Sword', 'exact', ['Pokémon Épée']],
    ['pokemon bouclier', 'Pokémon Sword', 'none', ['Pokémon Épée']],
    ['the last of us part 2', 'The Last of Us Part II', 'exact'],
    ['the last of us 2', 'The Last of Us Part II', 'exact'],
    ['tlou2', 'The Last of Us Part II', 'exact'],
    ['the last of us', 'The Last of Us Part II', 'partial'],
    ['the last of us', 'The Last of Us Part I', 'exact'],
    ['the last of us part 2', 'The Last of Us', 'none'],
    ['uncharted 4', 'Uncharted 4: A Thief’s End', 'exact'],
    ["uncharted 4 a thief's end", 'Uncharted 4: A Thief’s End', 'exact'],
    ['a thiefs end', 'Uncharted 4: A Thief’s End', 'exact'],
    ['uncharted 3', 'Uncharted 4: A Thief’s End', 'none'],
    ['uncharted', 'Uncharted 4: A Thief’s End', 'partial'],
    ['metroid prime 2', 'Metroid Prime 2: Echoes', 'exact'],
    ['metroid prime', 'Metroid Prime 2: Echoes', 'partial'],
    ['metroid prime 2', 'Metroid Prime', 'none'],
    ['echoes', 'Metroid Prime 2: Echoes', 'exact'],
    ['civ 6', "Sid Meier's Civilization VI", 'exact'],
    ['civilization 6', "Sid Meier's Civilization VI", 'exact'],
    ['civilization 5', "Sid Meier's Civilization VI", 'none'],
    ['civilization', "Sid Meier's Civilization VI", 'partial'],
    ['sonic 2', 'Sonic the Hedgehog 2', 'partial'],
    ['sonic the hedgehog', 'Sonic the Hedgehog 2', 'partial'],
    ['sonic adventure 2', 'Sonic the Hedgehog 2', 'none'],
    ['street fighter 2', 'Street Fighter II', 'exact'],
    ['street fighter 5', 'Street Fighter II', 'none'],
    ['dmc 5', 'Devil May Cry 5', 'exact'],
    ['devil may cry', 'Devil May Cry 5', 'partial'],
    ['persona 5', 'Persona 5 Royal', 'exact'],
    ['persona 5 royal', 'Persona 5 Royal', 'exact'],
    ['p5r', 'Persona 5 Royal', 'exact'],
    ['persona 4', 'Persona 5 Royal', 'none'],
    ['persona', 'Persona 5 Royal', 'partial'],
    ['hitman 3', 'Hitman 3', 'exact'],
    ['hitman', 'Hitman 3', 'partial'],
    ['hitman 2', 'Hitman 3', 'none'],
    ['yakuza 0', 'Yakuza 0', 'exact'],
    ['yakuza zero', 'Yakuza 0', 'exact'],
    ['yakuza', 'Yakuza 0', 'partial'],
    ['yakuza kiwami', 'Yakuza 0', 'none'],
    ['yakuza 0', 'Yakuza Kiwami', 'none'],
    ['dark souls remastered', 'Dark Souls', 'exact'],
    ['dark souls', 'Dark Souls Remastered', 'exact'],
    ['dark souls 2', 'Dark Souls Remastered', 'none'],
    ['dark souls', 'Dark Souls II', 'partial'],
    ['ds3', 'Dark Souls III', 'exact'],
    ['ds2', 'Dark Souls III', 'none'],
    ['final fantasy 7 remake', 'Final Fantasy VII Remake', 'exact'],
    ['ff7r', 'Final Fantasy VII Remake', 'exact'],
    ['final fantasy 7', 'Final Fantasy VII Remake', 'exact'],
    ['final fantasy x', 'Final Fantasy X-2', 'partial'],
    ['final fantasy x-2', 'Final Fantasy X-2', 'exact'],
    ['final fantasy x2', 'Final Fantasy X-2', 'exact'],
    ['ffx-2', 'Final Fantasy X-2', 'exact'],
    ['ffx', 'Final Fantasy X', 'exact'],
    ['final fantasy 14', 'Final Fantasy XIV: Shadowbringers', 'exact'],
    ['shadowbringers', 'Final Fantasy XIV: Shadowbringers', 'exact'],
    ['half life alyx', 'Half-Life: Alyx', 'exact'],
    ['half life', 'Half-Life: Alyx', 'partial'],
    ['half life 2', 'Half-Life: Alyx', 'none'],
    ['alyx', 'Half-Life: Alyx', 'exact'],
    ['hl2', 'Half-Life 2', 'exact'],
    ['halflife 2', 'Half-Life 2', 'exact'],
    ['halflife', 'Half-Life 2', 'partial'],
    ['pokemon red', 'Pokémon Blue', 'none'],
    ['pokemon rouge', 'Pokémon Red', 'exact', ['Pokémon Rouge']],
    ['pokemon', 'Pokémon Red', 'partial'],
    ['demon souls', "Demon's Souls", 'exact'],
    ['demons souls', "Demon's Souls", 'exact'],
    ['dark souls', "Demon's Souls", 'none'],
    ['shadow of the colossus', 'Shadow of the Colossus', 'exact'],
    ['colossus', 'Shadow of the Colossus', 'partial'],
    ['tomb raider', 'Rise of the Tomb Raider', 'partial'],
    ['rise of the tomb raider', 'Shadow of the Tomb Raider', 'none'],
    ['shadow of the tomb raider', 'Shadow of the Tomb Raider', 'exact'],
    ['doom eternal', 'Doom Eternal', 'exact'],
    ['doom', 'Doom Eternal', 'partial'],
    ['doom eternal', 'DOOM (2016)', 'none'],
    ['nfs most wanted', 'Need for Speed: Most Wanted', 'exact'],
    ['most wanted', 'Need for Speed: Most Wanted', 'exact'],
    ['need for speed', 'Need for Speed: Most Wanted', 'partial'],
    ['need for speed underground', 'Need for Speed: Most Wanted', 'none'],
    ['gow ragnarok', 'God of War Ragnarök', 'exact'],
    ['god of war 3', 'God of War Ragnarök', 'none'],
    ['god of war III', 'God of War III', 'exact'],
    ['uncharted the lost legacy', 'Uncharted: The Lost Legacy', 'exact'],
    ['lost legacy', 'Uncharted: The Lost Legacy', 'exact'],
    ['uncharted 4', 'Uncharted: The Lost Legacy', 'none'],
    ['donkey kong country 2', "Donkey Kong Country 2: Diddy's Kong Quest", 'exact'],
    ['donkey kong country', "Donkey Kong Country 2: Diddy's Kong Quest", 'partial'],
    ['donkey kong country 2', 'Donkey Kong Country', 'none'],
    ['dead space', 'Dead Cells', 'none'],
    ['dmc devil may cry', 'DmC: Devil May Cry', 'exact'],
    ['devil may cry', 'DmC: Devil May Cry', 'exact'],
    ['devil may cry 5', 'DmC: Devil May Cry', 'none'],
    ['starcraft 2', 'StarCraft II: Wings of Liberty', 'exact'],
    ['starcraft 2 wings of liberty', 'StarCraft II: Wings of Liberty', 'exact'],
    ['wings of liberty', 'StarCraft II: Wings of Liberty', 'exact'],
    ['starcraft 2 legacy of the void', 'StarCraft II: Wings of Liberty', 'none'],
    ['starcraft', 'StarCraft II: Wings of Liberty', 'partial'],
    ['starcraft 2 legacy of the void', 'StarСraft II: Legacy of the Void', 'exact'],
    ['warcraft 3 frozen throne', 'Warcraft 3: The Frozen Throne', 'exact'],
    ['warcraft 3', 'Warcraft 3: The Frozen Throne', 'exact'],
    ['frozen throne', 'Warcraft 3: The Frozen Throne', 'exact'],
    ['warcraft', 'Warcraft 3: The Frozen Throne', 'partial'],
    ['world of warcraft', 'Warcraft 3: The Frozen Throne', 'none'],
    ['mario et luigi', "Mario & Luigi: Bowser's Inside Story + Bowser Jr's Journey", 'partial'],
    ['mario and luigi', "Mario & Luigi: Bowser's Inside Story + Bowser Jr's Journey", 'partial'],
    ['bowsers inside story', "Mario & Luigi: Bowser's Inside Story + Bowser Jr's Journey", 'exact'],
    ["mario & luigi bowser's inside story", "Mario & Luigi: Bowser's Inside Story + Bowser Jr's Journey", 'exact'],
    ['ratchet and clank', 'Ratchet & Clank', 'exact'],
    ['ratchet et clank', 'Ratchet & Clank', 'exact'],
    ['plants versus zombies', 'Plants vs. Zombies', 'exact'],
    ['ocarina of time', 'The Legend of Zelda: Ocarina of Time 3D', 'exact'],
    ['zelda ocarina of time', 'The Legend of Zelda: Ocarina of Time 3D', 'exact'],
    ['zelda', 'The Legend of Zelda: Ocarina of Time 3D', 'partial'],
    ['majoras mask', 'The Legend of Zelda: Ocarina of Time 3D', 'none'],
    ['legend of zelda', 'The Legend of Zelda: Ocarina of Time 3D', 'partial'],
    ['links awakening', "The Legend of Zelda: Link's Awakening", 'exact'],
    ['a link to the past', "The Legend of Zelda: Link's Awakening", 'none'],
    ['a link between worlds', 'The Legend of Zelda: A Link to the Past', 'none'],
    ['okami', 'Ōkami', 'exact'],
    ['ni no kuni', 'Ni no Kuni: Wrath of the White Witch', 'partial'],
    ['ni no kuni wrath of the white witch', 'Ni no Kuni: Wrath of the White Witch', 'exact'],
    ['ni no kuni 2', 'Ni no Kuni: Wrath of the White Witch', 'none'],
    ['nier automata', 'NieR:Automata', 'exact'],
    ['nier', 'NieR:Automata', 'partial'],
    ['nier replicant', 'NieR:Automata', 'none'],
    ['automata', 'NieR:Automata', 'exact'],
    ['sims 4', 'The Sims 4', 'exact'],
    ['les sims 4', 'The Sims 4', 'exact'],
    ['les sims 3', 'The Sims 4', 'none'],
    ['sims', 'The Sims 4', 'partial'],
    ['the elder scrolls v', 'The Elder Scrolls V: Skyrim', 'exact'],
    ['elder scrolls 5', 'The Elder Scrolls V: Skyrim', 'exact'],
    ['tes 5', 'The Elder Scrolls V: Skyrim', 'exact'],
    ['elder scrolls', 'The Elder Scrolls V: Skyrim', 'partial'],
    ['oblivion', 'The Elder Scrolls V: Skyrim', 'none'],
    ['elder scrolls 4', 'The Elder Scrolls V: Skyrim', 'none'],
    ['skyrim special edition', 'The Elder Scrolls V: Skyrim', 'exact'],
    ['skyrim', 'The Elder Scrolls V: Skyrim Legendary Edition', 'exact'],
    ['the witcher 3 wild hunt', 'The Witcher 3 Wild Hunt - Complete Edition', 'exact'],
    ['witcher 3', 'The Witcher 3: Wild Hunt – Blood and Wine', 'exact'],
    ['blood and wine', 'The Witcher 3: Wild Hunt – Blood and Wine', 'exact'],
    ['hearts of stone', 'The Witcher 3: Wild Hunt – Blood and Wine', 'none'],
    ['witcher', 'The Witcher 3: Wild Hunt – Blood and Wine', 'partial'],
    ['cuphead', 'Cuphead: The Delicious Last Course', 'none'],
    ['delicious last course', 'Cuphead: The Delicious Last Course', 'exact'],
    ['splatoon 2', 'Splatoon 2: Octo Expansion', 'exact'],
    ['octo expansion', 'Splatoon 2: Octo Expansion', 'exact'],
    ['splatoon', 'Splatoon 2: Octo Expansion', 'partial'],
    ['splatoon 3', 'Splatoon 2: Octo Expansion', 'none'],
    ['xenoblade chronicles 3', 'Xenoblade Chronicles 3D', 'none'],
    ['xenoblade chronicles', 'Xenoblade Chronicles 3D', 'exact'],
    ['xenoblade chronicles 3d', 'Xenoblade Chronicles 3D', 'exact'],
    ['xenoblade chronicles 2', 'Xenoblade Chronicles 3D', 'none'],
    ['xenoblade', 'Xenoblade Chronicles 3D', 'partial'],
    ['xenoblade chronicles 3', 'Xenoblade Chronicles 3', 'exact'],
    ['xenoblade chronicles 3d', 'Xenoblade Chronicles 3', 'partial'],
    ['battlefield 1942', 'Battlefield 1942', 'exact'],
    ['battlefield 1', 'Battlefield 1942', 'none'],
    ['battlefield', 'Battlefield 1942', 'partial'],
    ['bf1942', 'Battlefield 1942', 'none'],
    ['fifa 23', 'FIFA 23', 'exact'],
    ['fifa 22', 'FIFA 23', 'none'],
    ['fifa', 'FIFA 23', 'partial'],
    ['nba 2k23', 'NBA 2K23', 'exact'],
    ['nba 2k22', 'NBA 2K23', 'none'],
    ['forza horizon 5', 'Forza Horizon 5', 'exact'],
    ['forza horizon 4', 'Forza Horizon 5', 'none'],
    ['forza horizon', 'Forza Horizon 5', 'partial'],
    ['forza', 'Forza Horizon 5', 'partial'],
    ['fallout 76', 'Fallout 76', 'exact'],
    ['fallout 4', 'Fallout 76', 'none'],
    ['fallout', 'Fallout 76', 'partial'],
    ['watch dogs 2', 'Watch Dogs 2', 'exact'],
    ['watch dogs', 'Watch Dogs 2', 'partial'],
    ['watch dogs legion', 'Watch Dogs 2', 'none'],
    ['7 days to die', '7 Days to Die', 'exact'],
    ['days to die', '7 Days to Die', 'partial'],
    ['i am setsuna', 'I Am Setsuna', 'exact'],
    ['v rising', 'V Rising', 'exact'],
    ['rising', 'V Rising', 'partial'],
    ['street fighter x tekken', 'Street Fighter X Tekken', 'exact'],
    ['street fighter 10', 'Street Fighter X Tekken', 'partial'],
    ['kingdom hearts 2', 'Kingdom Hearts II Final Mix', 'exact'],
    ['kh2', 'Kingdom Hearts II Final Mix', 'exact'],
    ['kingdom hearts', 'Kingdom Hearts II Final Mix', 'partial'],
    ['kingdom hearts 3', 'Kingdom Hearts II Final Mix', 'none'],
    ['kingdom hearts 358/2 days', 'Kingdom Hearts 358/2 Days', 'exact'],
    ['kingdom hearts 358 2 days', 'Kingdom Hearts 358/2 Days', 'exact'],
    ['gran turismo 4', 'Gran Turismo 4', 'exact'],
    ['gran turismo 5', 'Gran Turismo 4', 'none'],
    ['gran turismo', 'Gran Turismo 4', 'partial'],
    ['gt4', 'Gran Turismo 4', 'exact'],
    ['ace combat 5', 'Ace Combat 5: The Unsung War', 'exact'],
    ['ace combat zero', 'Ace Combat Zero: The Belkan War', 'exact'],
    ['ace combat 0', 'Ace Combat Zero: The Belkan War', 'exact'],
    ['ace combat', 'Ace Combat Zero: The Belkan War', 'partial'],
    ['ace combat 5', 'Ace Combat Zero: The Belkan War', 'none'],
    ['the orange box', 'The Orange Box', 'exact'],
    ['orange box', 'The Orange Box', 'exact'],
    ['zone of the enders 2', 'Zone of the Enders 2: The Second Runner', 'exact'],
    ['zone of the enders', 'Zone of the Enders 2: The Second Runner', 'partial'],
    ['the second runner', 'Zone of the Enders 2: The Second Runner', 'exact'],
    ['zone of the enders the 2nd runner', 'ZONE OF THE ENDERS: The 2nd Runner - M∀RS', 'exact'],
    ['zone of the enders 2', 'ZONE OF THE ENDERS: The 2nd Runner - M∀RS', 'partial'],
    ['disciples 2', 'Disciples II: Rise of the Elves', 'exact'],
    ['disciples 2 galleans return', 'Disciples II: Rise of the Elves', 'none'],
    ['baten kaitos', 'Baten Kaitos: Eternal Wings and the Lost Ocean', 'partial'],
    ['baten kaitos eternal wings', 'Baten Kaitos: Eternal Wings and the Lost Ocean', 'partial'],
    ['baten kaitos origins', 'Baten Kaitos: Eternal Wings and the Lost Ocean', 'none'],
    ['midnight club 3', 'Midnight Club 3: DUB Edition Remix', 'exact'],
    ['midnight club 3 dub edition', 'Midnight Club 3: DUB Edition Remix', 'exact'],
    ['midnight club', 'Midnight Club 3: DUB Edition Remix', 'partial'],
    ['midnight club 2', 'Midnight Club 3: DUB Edition Remix', 'none'],
    ['phoenix wright ace attorney', 'Phoenix Wright: Ace Attorney Trilogy', 'exact'],
    ['ace attorney', 'Phoenix Wright: Ace Attorney Trilogy', 'exact'],
    ['phoenix wright', 'Phoenix Wright: Ace Attorney Trilogy', 'partial'],
    ['bioshock', 'BioShock: The Collection', 'exact'],
    ['bioshock 2', 'BioShock: The Collection', 'none'],
    ['bioshock infinite', 'BioShock Infinite', 'exact'],
    ['bioshock', 'BioShock Infinite', 'partial'],
    ['bioshock 2', 'BioShock Infinite', 'none'],
    ['mass effect legendary edition', 'Mass Effect: Legendary Edition', 'exact'],
    ['mass effect', 'Mass Effect: Legendary Edition', 'exact'],
    ['mass effect 2', 'Mass Effect: Legendary Edition', 'none'],
    ['mass effect 2', 'Mass Effect 3', 'none'],
    ['mass effect andromeda', 'Mass Effect 3', 'none'],
    ['metal gear rising', 'Metal Gear Rising: Revengeance - Jetstream Sam', 'partial'],
    ['metal gear rising revengeance', 'Metal Gear Rising: Revengeance - Jetstream Sam', 'exact'],
    ['revengeance', 'Metal Gear Rising: Revengeance - Jetstream Sam', 'exact'],
    ['metal gear solid', 'Metal Gear Rising: Revengeance - Jetstream Sam', 'none'],
    ['metal gear', 'Metal Gear Rising: Revengeance - Jetstream Sam', 'partial'],
    ['mgs', 'Metal Gear Solid 2: Sons of Liberty', 'partial'],
    ['mgs 2', 'Metal Gear Solid 2: Sons of Liberty', 'exact'],
    ['mgs 3', 'Metal Gear Solid 2: Sons of Liberty', 'none'],
    ['sons of liberty', 'Metal Gear Solid 2: Sons of Liberty', 'exact'],
    ['snake eater', 'Metal Gear Solid 2: Sons of Liberty', 'none'],
    ['mgs v', 'Metal Gear Solid V: The Phantom Pain', 'exact'],
    ['phantom pain', 'Metal Gear Solid V: The Phantom Pain', 'exact'],
    ['metal gear solid 5 phantom pain', 'Metal Gear Solid V: The Phantom Pain', 'exact'],
    ['metal gear solid 5 ground zeroes', 'Metal Gear Solid V: The Phantom Pain', 'none'],
    ['ground zeroes', 'Metal Gear Solid V: The Phantom Pain', 'none'],
    ['red dead redemption 2', 'Red Dead Redemption 2', 'exact'],
    ['rdr2', 'Red Dead Redemption 2', 'exact'],
    ['rdr 2', 'Red Dead Redemption 2', 'exact'],
    ['red dead redemption', 'Red Dead Redemption 2', 'partial'],
    ['red dead', 'Red Dead Redemption 2', 'partial'],
    ['red dead redemption 2', 'Red Dead Redemption', 'none'],
    ['red dead revolver', 'Red Dead Redemption 2', 'none'],
    ['the last of us remastered', 'The Last Of Us Remastered', 'exact'],
    ['the last of us', 'The Last Of Us Remastered', 'exact'],
    ['last of us', 'The Last Of Us Remastered', 'exact'],
    ['tlou', 'The Last Of Us Remastered', 'exact'],
    ['the last of us 2', 'The Last Of Us Remastered', 'none'],
    ['hollow knight silksong', 'Hollow Knight: Silksong', 'exact'],
    ['silksong', 'Hollow Knight: Silksong', 'exact'],
    ['hollow knight', 'Hollow Knight: Silksong', 'partial'],
    ['hollow knight', 'Hollow Knight', 'exact'],
    ['hollow knight silksong', 'Hollow Knight', 'none'],
    ['elden ring', 'Elden Ring', 'exact'],
    ['eldenring', 'Elden Ring', 'exact'],
    ['elden', 'Elden Ring', 'partial'],
    ['elden ring shadow of the erdtree', 'Elden Ring', 'none'],
    ['elden ring', 'Elden Ring: Shadow of the Erdtree', 'partial'],
    ['shadow of the erdtree', 'Elden Ring: Shadow of the Erdtree', 'exact'],
    ['hades', 'Hades', 'exact'],
    ['hade', 'Hades', 'none'],
    ['hades 2', 'Hades', 'none'],
    ['hades', 'Hades II', 'partial'],
    ['hadès', 'Hades', 'exact'],
    ['ico', 'Ico', 'exact'],
    ['limbo', 'Limbo', 'exact'],
    ['lumo', 'Limbo', 'none'],
    ['inside', 'Inside', 'exact'],
    ['insid', 'Inside', 'none'],
    ['contra', 'Control', 'none'],
    ['control', 'Control', 'exact'],
    ['fe', 'Fez', 'none'],
    ['grid', 'Gris', 'none'],
    ['rome', 'Rime', 'none'],
    ['strays', 'Stray', 'exact'],
    ['dota 2', 'Dota 2', 'exact'],
    ['dota', 'Dota 2', 'partial'],
    ['portal', 'Portal', 'exact'],
    ['portal 2', 'Portal', 'none'],
    ['ori', 'Ori and the Blind Forest', 'partial'],
    ['ori and the will of the wisps', 'Ori and the Blind Forest', 'none'],
    ['ori and the blind forest', 'Ori and the Blind Forest', 'exact'],
    ['blind forest', 'Ori and the Blind Forest', 'partial'],
    ['crash bandicoot', 'Crash Bandicoot 2: Cortex Strikes Back', 'partial'],
    ['crash bandicoot 2', 'Crash Bandicoot 2: Cortex Strikes Back', 'exact'],
    ['crash bandicoot 3', 'Crash Bandicoot 2: Cortex Strikes Back', 'none'],
    ['cortex strikes back', 'Crash Bandicoot 2: Cortex Strikes Back', 'exact'],
    ['crash 2', 'Crash Bandicoot 2: Cortex Strikes Back', 'partial'],
    ['crash', 'Crash Bandicoot 2: Cortex Strikes Back', 'partial'],
    ['mortal kombat 11', 'Mortal Kombat 11', 'exact'],
    ['mk11', 'Mortal Kombat 11', 'exact'],
    ['mortal kombat x', 'Mortal Kombat 11', 'none'],
    ['mortal kombat', 'Mortal Kombat 11', 'partial'],
    ['mortal kombat x', 'Mortal Kombat X', 'exact'],
    ['mortal kombat 10', 'Mortal Kombat X', 'exact'],
    ['tekken 7', 'Tekken 7', 'exact'],
    ['tekken 3', 'Tekken 7', 'none'],
    ['tekken', 'Tekken 7', 'partial'],
    ['call of duty black ops cold war', 'Call of Duty: Black Ops Cold War', 'exact'],
    ['black ops cold war', 'Call of Duty: Black Ops Cold War', 'exact'],
    ['cold war', 'Call of Duty: Black Ops Cold War', 'partial'],
    ['black ops', 'Call of Duty: Black Ops Cold War', 'partial'],
    ['black ops 2', 'Call of Duty: Black Ops Cold War', 'none'],
    ['cod black ops 2', 'Call of Duty: Black Ops II', 'exact'],
    ['black ops ii', 'Call of Duty: Black Ops II', 'exact'],
    ['call of duty black ops 2', 'Call of Duty: Black Ops II', 'exact'],
    ['call of duty', 'Call of Duty: Black Ops II', 'partial'],
    ['cod', 'Call of Duty: Black Ops II', 'partial'],
    ['call of duty modern warfare 2', 'Call of Duty: Modern Warfare 2', 'exact'],
    ['mw2', 'Call of Duty: Modern Warfare 2', 'exact'],
    ['modern warfare 2', 'Call of Duty: Modern Warfare 2', 'exact'],
    ['modern warfare', 'Call of Duty: Modern Warfare 2', 'partial'],
    ['modern warfare 3', 'Call of Duty: Modern Warfare 2', 'none'],
    ['call of duty 4', 'Call of Duty: Modern Warfare 2', 'none'],
    ['modern warfare', 'Call of Duty: Modern Warfare', 'exact'],
    ['call of duty modern warfare', 'Call of Duty: Modern Warfare', 'exact'],
    ['call of duty 4 modern warfare', 'Call of Duty: Modern Warfare', 'none'],
    ['modern warfare 2', 'Call of Duty: Modern Warfare', 'none'],
    ['call of duty modern warfare 2', 'Call of Duty: Modern Warfare II', 'exact'],
    ['garage band', 'Xenoblade Chronicles 3D', 'none'],
    ['', 'Hades', 'none'],
    ['   ', 'Hades', 'none'],
    ['!!!', 'Hades', 'none'],
    ['the', 'The Last of Us', 'none'],
    ['of', 'God of War', 'none'],
    ['the game', 'The Game', 'exact'],
    ['2048', '2048', 'exact'],
    ['1080 snowboarding', '1080° Snowboarding', 'exact'],
    ['1080', '1080° Snowboarding', 'none'],
    ['far 5', 'Far Cry 5', 'partial'],
    ['final 7', 'Final Fantasy VII', 'partial'],
    ['dark 3', 'Dark Souls III', 'none'],
    ['star wars', 'Star Wars Jedi: Fallen Order', 'partial'],
    ['go', 'God of War', 'none'],
    ['bi', 'BioShock Infinite', 'partial'],
    ['ds', 'Dark Souls', 'partial'],
    ['re', 'Resident Evil 4', 'partial'],
    ['ni', 'Ni no Kuni: Wrath of the White Witch', 'none'],
    ['(2018)', 'God of War (2018)', 'none'],
    ['1942', 'Battlefield 1942', 'none'],
    ['final fantasy 16', 'Final Fantasy XVI', 'exact'],
    ['final fantasy 15', 'Final Fantasy XVI', 'none'],
    ['final fantasy', 'Final Fantasy XVI', 'partial'],
    ['cod bo2', 'Call of Duty: Black Ops II', 'exact'],
    ['call of duty xyz', 'Call of Duty: Black Ops II', 'none'],
    ['metroid dread', 'Metroid: Zero Mission', 'none'],
    ['shadow of the colossus', 'Shadow of the Beast', 'none'],
    ['black', 'Call of Duty: Black Ops', 'none'],
    ['death stranding director’s cut', 'Death Stranding Director’s Cut', 'exact'],
    ['death stranding', 'Death Stranding Director’s Cut', 'exact'],
    ['super mario world', 'Super Mario 3D World', 'partial'],
    ['super mario 3d world', 'Super Mario World', 'none'],
    ['super mario 3d world', 'Super Mario 3D World', 'exact'],
    ['mario odyssey', 'Super Mario Odyssey', 'exact'],
    ['metroid', 'Super Metroid', 'partial'],
    ['super metroid', 'Super Metroid', 'exact'],
    ['smash bros', 'Super Smash Bros. Ultimate', 'partial'],
    ['super smash bros ultimate', 'Super Smash Bros. Ultimate', 'exact'],
    ['ssbu', 'Super Smash Bros. Ultimate', 'exact'],
    ['divinity 2', 'Divinity: Original Sin 2', 'partial'],
    ['divinity original sin 2', 'Divinity: Original Sin 2', 'exact'],
    ['original sin 2', 'Divinity: Original Sin 2', 'exact'],
    ['original sin', 'Divinity: Original Sin 2', 'partial'],
    ['divinity original sin', 'Divinity: Original Sin 2', 'partial'],
    ['pokemon 10', 'Pokémon X, Y', 'exact'],
    ['persona 3 fes', 'Persona 3 FES', 'exact'],
    ['persona 3', 'Persona 3 FES', 'exact'],
    ['the witcher 3 wild hunt goty edition', 'The Witcher 3: Wild Hunt', 'exact'],
    ['the witcher 3 wild hunt', 'The Witcher 3: Wild Hunt - Game of the Year Edition', 'exact'],
    ['witcher 3', 'The Witcher 3: Wild Hunt - Game of the Year Edition', 'exact'],
    ['stalker', 'S.T.A.L.K.E.R.: Shadow of Chernobyl', 'partial'],
    ['stalker shadow of chernobyl', 'S.T.A.L.K.E.R.: Shadow of Chernobyl', 'exact'],
    ['fear', 'F.E.A.R.', 'exact'],
    ['tloz botw', 'The Legend of Zelda: Breath of the Wild', 'exact'],
    ['loz botw', 'The Legend of Zelda: Breath of the Wild', 'exact'],
    ['ffvii', 'Final Fantasy VII', 'exact'],
    ['ffviii', 'Final Fantasy VII', 'none'],
    ['mgsv', 'Metal Gear Solid V: The Phantom Pain', 'exact'],
    ['mgs5', 'Metal Gear Solid V: The Phantom Pain', 'exact'],
    ['ac valhalla', "Assassin's Creed Valhalla", 'exact'],
    ['ac odyssey', "Assassin's Creed Valhalla", 'none'],
    ['assassins creed odyssey', "Assassin's Creed Odyssey", 'exact'],
    ['odyssey', "Assassin's Creed Odyssey", 'partial'],
    ['aoe2', 'Age of Empires II: The Age of Kings', 'exact'],
    ['age of empires 2', 'Age of Empires II: The Age of Kings', 'exact'],
    ['age of empires', 'Age of Empires II: The Age of Kings', 'partial'],
    ['age of empires 3', 'Age of Empires II: The Age of Kings', 'none'],
    ['r6 siege', "Tom Clancy's Rainbow Six Siege", 'exact'],
    ['rainbow six siege', "Tom Clancy's Rainbow Six Siege", 'exact'],
    ['rainbow 6 siege', "Tom Clancy's Rainbow Six Siege", 'exact'],
    ['rainbow six', "Tom Clancy's Rainbow Six Siege", 'partial'],
    ['siege', "Tom Clancy's Rainbow Six Siege", 'partial'],
    ['tf2', 'Team Fortress 2', 'exact'],
    ['team fortress', 'Team Fortress 2', 'partial'],
    ['csgo', 'Counter-Strike: Global Offensive', 'exact'],
    ['cs go', 'Counter-Strike: Global Offensive', 'exact'],
    ['counter strike', 'Counter-Strike: Global Offensive', 'partial'],
    ['counterstrike global offensive', 'Counter-Strike: Global Offensive', 'exact'],
    ['global offensive', 'Counter-Strike: Global Offensive', 'exact'],
    ['cs 2', 'Counter-Strike: Global Offensive', 'none'],
    ['wow', 'World of Warcraft', 'exact'],
    ['world of warcraft', 'World of Warcraft: Wrath of the Lich King', 'partial'],
    ['wotlk', 'World of Warcraft: Wrath of the Lich King', 'exact'],
    ['lol', 'League of Legends', 'exact'],
    ['league of legend', 'League of Legends', 'exact'],
    ['pubg', 'PUBG: Battlegrounds', 'partial'],
    ['among us', 'Among Us', 'exact'],
    ['it takes two', 'It Takes Two', 'exact'],
    ['we happy few', 'We Happy Few', 'exact'],
    ['happy few', 'We Happy Few', 'partial'],
    ['la legende de zelda breath of the wild', 'The Legend of Zelda: Breath of the Wild', 'exact'],
    ['la légende de zelda', 'The Legend of Zelda: Breath of the Wild', 'partial'],
    ["l'ombre du mordor", 'Middle-earth: Shadow of Mordor', 'exact', ["La Terre du Milieu : L'Ombre du Mordor"]],
    ["la terre du milieu l'ombre du mordor", 'Middle-earth: Shadow of Mordor', 'exact', ["La Terre du Milieu : L'Ombre du Mordor"]],
    ['shadow of mordor', 'Middle-earth: Shadow of Mordor', 'exact'],
    ['middle earth shadow of war', 'Middle-earth: Shadow of Mordor', 'none'],
    ['les chevaliers de baphomet', 'Broken Sword: The Shadow of the Templars', 'exact', ['Les Chevaliers de Baphomet']],
    ['chevaliers de baphomet', 'Broken Sword: The Shadow of the Templars', 'exact', ['Les Chevaliers de Baphomet']],
    ['broken sword', 'Broken Sword: The Shadow of the Templars', 'partial'],
    ['StarCraft II: Legacy of the Void', 'StarСraft II: Legacy of the Void', 'exact'],
    ['zelda : breath of the wild', 'The Legend of Zelda: Breath of the Wild', 'exact'],
    ['  the   witcher 3  ', 'The Witcher 3: Wild Hunt', 'exact'],
    ['the witcher 3™', 'The Witcher 3: Wild Hunt', 'exact'],
    ['THE WITCHER 3: WILD HUNT', 'The Witcher 3: Wild Hunt', 'exact'],
    ['hslo 3', 'Halo 3', 'exact'],
    ['haol 3', 'Halo 3', 'exact'],
    ['elden rign', 'Elden Ring', 'exact'],
    ['witcher 3 wild hint', 'The Witcher 3: Wild Hunt', 'exact'],
    ['hale', 'Halo', 'none'],
    ['limb', 'Limbo', 'none'],
    ['spor', 'Spore', 'none'],
    ['journe', 'Journey', 'none'],
    ['skyri', 'The Elder Scrolls V: Skyrim', 'none'],
    ['minecraf', 'Minecraft', 'none'],
    ['hadse', 'Hades', 'exact'],
    ['minecarft', 'Minecraft', 'exact'],
    ['porta 2', 'Portal 2', 'exact'],
    ['dark soul', 'Dark Souls', 'exact'],
    ['stardew valey', 'Stardew Valley', 'exact'],
    ['les sables du temps', 'Prince of Persia: The Sands of Time', 'exact', ['Prince of Persia : Les Sables du Temps']],
    ['sables du temps', 'Prince of Persia: The Sands of Time', 'exact', ['Prince of Persia : Les Sables du Temps']],
    ['prince of persia', 'Prince of Persia: The Sands of Time', 'partial', ['Prince of Persia : Les Sables du Temps']],
    ['ombre du mordor', 'Middle-earth: Shadow of Mordor', 'exact', ["La Terre du Milieu : L'Ombre du Mordor"]],
    ['la terre du milieu', 'Middle-earth: Shadow of Mordor', 'partial', ["La Terre du Milieu : L'Ombre du Mordor"]],
    ["l'ombre de la guerre", 'Middle-earth: Shadow of Mordor', 'none', ["La Terre du Milieu : L'Ombre du Mordor"]],
    ['bataille pour la terre du milieu', 'The Lord of the Rings: The Battle for Middle-earth', 'exact', ['Le Seigneur des Anneaux : La Bataille pour la Terre du Milieu']],
    ['le seigneur des anneaux', 'The Lord of the Rings: The Battle for Middle-earth', 'partial', ['Le Seigneur des Anneaux : La Bataille pour la Terre du Milieu']],
    ['legende de zelda breath of the wild', 'The Legend of Zelda: Breath of the Wild', 'exact', ['La Légende de Zelda : Breath of the Wild']],
    ['pokemon version rouge', 'Pokémon Red', 'exact', ['Pokémon Rouge']],
    ['the witcher 3 version', 'The Witcher 3: Wild Hunt', 'exact'],
    ['ｄｏｏｍ', 'DOOM', 'exact'],
    ['ｆｉｎａｌ ｆａｎｔａｓｙ ７', 'Final Fantasy VII', 'exact'],
    ['thiefs end', 'Uncharted 4: A Thief’s End', 'exact'],
    ['mario et luigi', 'Mario & Luigi: Superstar Saga', 'partial'],
    ['mario luigi superstar saga', 'Mario & Luigi: Superstar Saga', 'exact'],
    ['superstar saga', 'Mario & Luigi: Superstar Saga', 'exact'],
    ['ratchet and clank', 'Ratchet & Clank: Rift Apart', 'partial'],
    ['rift apart', 'Ratchet & Clank: Rift Apart', 'exact'],
    ['spider man', "Marvel's Spider-Man", 'exact'],
    ['middle earth', 'Middle-earth: Shadow of Mordor', 'partial'],
    ['ninokuni', 'Ni no Kuni: Wrath of the White Witch', 'partial'],
    ['star wars', 'STAR WARS Jedi: Fallen Order', 'partial'],
    ['doom 2', 'DOOM', 'none'],
    ['far cry 2', 'Far Cry', 'none'],
    ['crash bandicoot 2', 'Crash Bandicoot', 'none'],
    ['yakuza 2', 'Yakuza 0', 'none'],
    ['plants vs zombies 2', 'Plants vs. Zombies', 'none'],
    ['rome 2 total war', 'ROME: Total War', 'none'],
    ['les sims 2', 'The Sims', 'none'],
    ['mulana', 'La-Mulana', 'exact'],
    ['la mulana', 'La-Mulana', 'exact'],
    ['eternal', 'DOOM Eternal', 'partial'],
    ['primal', 'Far Cry Primal', 'partial'],
    ['valhalla', "Assassin's Creed Valhalla", 'partial'],
    ['odyssey', "Assassin's Creed® Odyssey™", 'partial'],
    ['assassins creed odyssey', "Assassin's Creed® Odyssey™", 'exact'],
    ['sword', 'Pokémon Sword', 'partial'],
    ['halo 1', 'Halo: Combat Evolved', 'exact'],
    ['halo', 'Halo: Combat Evolved', 'partial'],
    ['combat evolved', 'Halo: Combat Evolved', 'exact'],
    ['halo 2', 'Halo: Combat Evolved', 'none'],
    ['uncharted 1', "Uncharted: Drake's Fortune", 'exact'],
    ['borderlands 1', 'Borderlands: Game of the Year Edition', 'exact'],
    ['borderlands', 'Borderlands: Game of the Year Edition', 'exact'],
    ['borderlands goty', 'Borderlands: Game of the Year Edition', 'exact'],
    ['borderlands 2', 'Borderlands: Game of the Year Edition', 'none'],
    ['final fantasy seven', 'Final Fantasy VII', 'exact'],
    ['witcher three', 'The Witcher 3: Wild Hunt', 'exact'],
    ['seven days to die', '7 Days to Die', 'exact'],
    ['sam and max season 2', 'Sam & Max: Season Two', 'exact'],
    ['sam and max', 'Sam & Max: Season Two', 'partial'],
    ['final fantasy 6', 'Final Fantasy XVI', 'none'],
    ['final fantasy x-2', 'Final Fantasy X', 'none'],
    ['final fantasy 10', 'Final Fantasy X-2', 'partial'],
    ['kingdom hearts 2', 'Kingdom Hearts HD 2.8 Final Chapter Prologue', 'partial'],
    ['call of duty black ops 3', 'Call of Duty: Black Ops III', 'exact'],
    ['call of duty modern warfare 3', 'Call of Duty: Modern Warfare II', 'none'],
    ['sonic blast', 'Sonic 3D Blast', 'partial'],
    ['sonic 3d blast', 'Sonic 3D Blast', 'exact'],
    ['super mario 3d land', 'Super Mario 3D World', 'none'],
    ['street 6', 'Street Fighter 6', 'partial'],
    ['street fighter 6', 'Street Fighter 6', 'exact'],
    ['call of duty zzz', 'Call of Duty: Black Ops II', 'none'],
    ['cod zzz', 'Call of Duty: Black Ops II', 'none'],
    ['tlou 2', 'The Last of Us Part II', 'exact'],
    ['mega man x', 'Mega Man 10', 'exact'],
    ['pokemon diamant', 'Pokémon Sword', 'none', ['Pokémon Épée']],
    ['pokemon epee 2', 'Pokémon Sword', 'none', ['Pokémon Épée']],
    ['les sims 3', 'The Sims 4', 'none', ['Les Sims 4']],
    ['fifa 23', 'EA Sports FC 24', 'none', ['FIFA 24', 'FC 24']],
    ['fifa 24', 'EA Sports FC 24', 'exact', ['FIFA 24', 'FC 24']],
    ['fc 24', 'EA Sports FC 24', 'exact', ['FIFA 24', 'FC 24']],
    ['nba 2k24', 'NBA 2K23', 'none', ['NBA 2K 23']],
    ['portal 3', 'Portal 2', 'none', ['Portal']],
    ['portal', 'Portal 2', 'partial', ['Portal']],
    ['re', 'Resident Evil 4', 'partial', ['RE4']],
    ['lo', 'League of Legends', 'none', ['LoL']],
    ['tw', 'The Witcher 3: Wild Hunt', 'none', ['TW3']],
    ['tw3', 'The Witcher 3: Wild Hunt', 'exact', ['TW3']],
    ['bot', 'The Legend of Zelda: Breath of the Wild', 'none', ['BotW']],
    ['zelda bot', 'The Legend of Zelda: Breath of the Wild', 'none', ['BotW']],
    ['kh', 'Kingdom Hearts II', 'partial', ['KH2']],
    ['ff', 'Final Fantasy VII', 'partial', ['FF7']],
    ['ds', 'Dark Souls', 'partial', ['DS1']],
    ['cuphead', 'Cuphead: The Delicious Last Course', 'none', ['Cuphead DLC']],
    ['cuphead', 'Cuphead: The Delicious Last Course', 'none', ['Cuphead']],
    ['tdlc', 'Cuphead: The Delicious Last Course', 'exact', ['Cuphead: TDLC']],
    ['gta', 'Grand Theft Auto V', 'partial', ['GTA 5']],
    ['modern', 'Call of Duty 4: Modern Warfare', 'partial', ['Modern Warfare']],
    ['modern warf', 'Call of Duty 4: Modern Warfare', 'none', ['Modern Warfare']],
    ['gta san', 'Grand Theft Auto: San Andreas', 'partial', ['GTA San Andreas']],
    ['pokemon', 'Pokémon Sword', 'partial', ['Pokémon Épée']],
    ['les sims', 'The Sims 4', 'partial', ['Les Sims 4']],
    ['les sims', 'The Sims 4', 'partial', ['Les Sims']],
    ['sims', 'The Sims 4', 'partial', ['Sims']],
    ['zelda', 'The Legend of Zelda: Breath of the Wild', 'partial', ['Zelda BOTW']],
    ['the last of us', 'The Last of Us Part II', 'partial', ['The Last of Us 2']],
    ['the last of us 2', 'The Last of Us Part II', 'exact', ['The Last of Us 2']],
    ['mario kart deluxe', 'Mario Kart 8', 'partial', ['Mario Kart 8 Deluxe']],
    ['p5', 'Persona 5 Royal', 'exact', ['P5R']],
    ['ffviii', 'Final Fantasy VII', 'none', ['Final Fantasy 7', 'FF7', 'FFVII']],
    ['ffvi', 'Final Fantasy VII', 'none', ['FFVII']],
    ['ffxii', 'Final Fantasy VII', 'none', ['FFVII']],
    ['ffvii', 'Final Fantasy VII', 'exact', ['FFVII']],
    ['dsiii', 'Dark Souls II', 'none', ['DSII', 'DS2']],
    ['khiii', 'Kingdom Hearts II', 'none', ['KHII']],
    ['ff viii', 'Final Fantasy VII', 'none', ['FFVII']],
    ['remake', 'Resident Evil 2', 'none', ['Remake', 'RE2 Remake', 'Resident Evil 2 Remake']],
    ['hd', 'Okami HD', 'none', ['HD']],
    ['iv', 'Grand Theft Auto IV', 'none', ['IV']],
    ['edition', 'Okami HD', 'none', ['Édition']],
    ['okami', 'Okami HD', 'exact', ['Ōkami', 'HD', 'Remastered', 'Édition']],
    ['expansion pass', 'The Legend of Zelda: Breath of the Wild', 'partial', ['The Legend of Zelda: Breath of the Wild – Expansion Pass']],
    ['blood and wine', 'The Witcher 3: Wild Hunt', 'partial', ['The Witcher 3: Wild Hunt – Blood and Wine']],
    ['witcher 3 blood and wine', 'The Witcher 3: Wild Hunt', 'exact', ['The Witcher 3: Wild Hunt – Blood and Wine']],
    ['season pass', 'Cyberpunk 2077', 'partial', ['Cyberpunk 2077 - Season Pass']],
    ['chiens et chats', 'The Sims 4', 'partial', ['Les Sims 4: Chiens et Chats']],
    ['shield', 'Pokémon Sword', 'partial', ['Pokémon Sword and Shield', 'Pokémon Épée et Bouclier']],
    ['pokemon shield', 'Pokémon Sword', 'partial', ['Pokémon Sword and Shield', 'Pokémon Épée et Bouclier']],
    ['complete edition', 'The Witcher 3: Wild Hunt', 'none', ['The Witcher 3: Wild Hunt - Complete Edition', 'TW3']],
    ['pokemon eppee', 'Pokémon Sword', 'exact', ['Pokémon Épée', 'Pokémon Épée et Bouclier']],
    ['pokemon eppee', 'Pokémon Sword', 'exact', ['Pokémon Épée et Bouclier', 'Pokémon Épée']],
    ['ombre du mordorr', 'Middle-earth: Shadow of Mordor', 'exact', ["L'Ombre du Mordor", "La Terre du Milieu : L'Ombre du Mordor"]],
    ['lombre du mordor', 'Middle-earth: Shadow of Mordor', 'exact', ["La Terre du Milieu : L'Ombre du Mordor", "L'Ombre du Mordor"]],
    ['l ombre du mordor', 'Middle-earth: Shadow of Mordor', 'exact', ["L'Ombre du Mordor"]],
    ['r4', 'Resident Evil 4', 'partial', ['RE4']],
    ['g5', 'Grand Theft Auto V', 'partial', ['GTA 5']],
    ['k2', 'Kingdom Hearts II', 'partial', ['KH2']],
    ['zelda botx', 'The Legend of Zelda: Breath of the Wild', 'none', ['BotW']],
    ['gta 4', 'Grand Theft Auto V', 'none', ['GTA 4']],
    ['mario kart 7', 'Mario Kart 8', 'none', ['Mario Kart 7']],
    ['re4 remake', 'Resident Evil 4', 'exact', ['RE4']],
    ['ff7 remake', 'Final Fantasy VII', 'exact', ['FF7']],
    ['kh2 final mix', 'Kingdom Hearts II', 'exact', ['KH2']],
    ['p5 royal', 'Persona 5 Royal', 'exact', ['P5R']],
    ['cod mw', 'Call of Duty 4: Modern Warfare', 'exact', ['CoD4', 'Modern Warfare']],
    ['2k23', 'NBA 2K23', 'partial', ['NBA 2K 23']],
    ['re2', 'Resident Evil 2', 'exact', ['RE2 Remake']],
    ['gta vc', 'Grand Theft Auto: Vice City', 'exact', ['gta vc', 'vc']],
]
