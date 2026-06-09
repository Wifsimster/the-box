/**
 * Display-name safety gate for outbound notifications.
 *
 * The "beat the leader" nudge interpolates a *user-chosen* display name into an
 * email / push sent to many other players. Broadcasting an unmoderated string
 * under our brand is a trust-and-safety risk (slurs, impersonation), so the
 * leader's name is only featured when it passes this gate — otherwise the
 * caller falls back to score-only generic copy.
 *
 * Pure and dependency-free so it is trivially unit-testable. The matching is a
 * deliberately blunt substring check over an accent-stripped, lowercased form:
 * over-blocking is acceptable here (we just drop to generic copy), whereas a
 * single slur reaching thousands of inboxes is not.
 */

// Lowercased, diacritic-stripped substrings that disqualify a name. Kept
// representative rather than exhaustive — the fallback is safe generic copy,
// and the list can grow without touching callers.
const BLOCKED_SUBSTRINGS: readonly string[] = [
  // English profanity / slurs
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'fag',
  'rape', 'rapist', 'nazi', 'hitler', 'asshole', 'whore', 'slut', 'pedo',
  'pedophile', 'retard',
  // French profanity / slurs (accent-stripped forms)
  'merde', 'putain', 'salope', 'connard', 'connasse', 'encule', 'enfoire',
  'pute', 'batard', 'nique', 'pede', 'tapette', 'negre', 'bougnoule',
  // Brand / authority impersonation
  'admin', 'administrator', 'moderator', 'modo', 'thebox', 'the box',
  'official', 'officiel', 'support', 'staff', 'systeme', 'system',
]

const MAX_REASONABLE_LENGTH = 40

function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .toLowerCase()
}

/**
 * Returns true when `name` is safe to feature verbatim in an outbound
 * notification. Empty / whitespace-only names, names containing a URL, and
 * names hitting the blocklist are rejected.
 */
export function isDisplayNameSafe(name: string | null | undefined): boolean {
  if (!name) return false
  const trimmed = name.trim()
  if (trimmed.length === 0) return false
  if (trimmed.length > MAX_REASONABLE_LENGTH) return false

  const normalized = normalize(trimmed)

  // No links — a name like "win at evil.example" must never be broadcast.
  if (normalized.includes('http') || normalized.includes('www.') || normalized.includes('.com')) {
    return false
  }

  return !BLOCKED_SUBSTRINGS.some((bad) => normalized.includes(bad))
}
