const BLOCKED_SUBSTRINGS: readonly string[] = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'fag',
  'rape', 'rapist', 'nazi', 'hitler', 'asshole', 'whore', 'slut', 'pedo',
  'pedophile', 'retard',
  'merde', 'putain', 'salope', 'connard', 'connasse', 'encule', 'enfoire',
  'pute', 'batard', 'nique', 'pede', 'tapette', 'negre', 'bougnoule',
  'admin', 'administrator', 'moderator', 'modo', 'thebox', 'the box',
  'official', 'officiel', 'support', 'staff', 'systeme', 'system',
]

const MAX_REASONABLE_LENGTH = 40

function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function isDisplayNameSafe(name: string | null | undefined): boolean {
  if (!name) return false
  const trimmed = name.trim()
  if (trimmed.length === 0) return false
  if (trimmed.length > MAX_REASONABLE_LENGTH) return false

  const normalized = normalize(trimmed)

  if (normalized.includes('http') || normalized.includes('www.') || normalized.includes('.com')) {
    return false
  }

  return !BLOCKED_SUBSTRINGS.some((bad) => normalized.includes(bad))
}
