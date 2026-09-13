// Brand strings — see docs/brand.md for the contract these serve.
//
// @the-box/types holds the canonical copy (the backend's OG cards read it
// directly), but that package compiles to CommonJS while declaring an ESM
// entry, so Rollup cannot re-export its values through the app bundle. These
// are declared here instead, and `brand.test.ts` asserts they stay identical
// to the constants in @the-box/types, to index.html and to the PWA manifest.
//
// This module deliberately imports nothing: it is read by a Node test, and
// anything pulling in `i18n` would touch `window` at load time.
//
// Never inline a tagline anywhere else.

export type BrandLang = 'fr' | 'en'

export const SITE_NAME = 'The Box'

/** The promise. Hero, OG card, PWA manifest, social copy. */
export const SITE_TAGLINE: Record<BrandLang, string> = {
  fr: 'Une capture. Un jeu à deviner.',
  en: 'One screenshot. One guess.',
}

/**
 * The category line. Page titles, meta descriptions, JSON-LD.
 * The name is deliberately short and opaque; this line carries the keywords
 * so discoverability never costs us the brand.
 */
export const SITE_CATEGORY: Record<BrandLang, string> = {
  fr: 'The Box — le jeu quotidien du screenshot',
  en: 'The Box — the daily video-game screenshot game',
}
