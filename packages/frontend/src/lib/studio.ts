/**
 * Identity of the studio that develops and operates The Box.
 *
 * Kept in one place because the same facts surface in four places: the footer
 * credit, the legal notice on the Terms page, the Contact page and the JSON-LD
 * `publisher` node. French law (LCEN art. 6-III) requires the publisher's
 * identity to be reachable from the site, so this is not just a credit line.
 *
 * Source of truth for the values: the studio's own site (schema.org graph on
 * https://pro.battistella.ovh/).
 */
export const STUDIO = {
  name: 'BATTISTELLA',
  legalName: 'BATTISTELLA EI',
  url: 'https://pro.battistella.ovh/',
  /** Bare domain, used as a link label so the URL stays readable inline. */
  domain: 'pro.battistella.ovh',
  logo: 'https://pro.battistella.ovh/icon-512.png',
  founder: 'Damien Battistella',
  email: 'battistella@proton.me',
  city: 'Artigues-près-Bordeaux',
  region: 'Gironde',
  postalCode: '33370',
  country: 'FR',
  siret: '10340616100010',
} as const

/** Stable `@id` so every JSON-LD node points at the same organization. */
export const STUDIO_LD_ID = `${STUDIO.url}#organization`

/** schema.org Organization node for the studio, referenced as publisher/author. */
export const studioOrganizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': STUDIO_LD_ID,
  name: STUDIO.name,
  legalName: STUDIO.legalName,
  url: STUDIO.url,
  logo: STUDIO.logo,
  email: STUDIO.email,
  founder: { '@type': 'Person', name: STUDIO.founder },
  address: {
    '@type': 'PostalAddress',
    addressLocality: STUDIO.city,
    addressRegion: STUDIO.region,
    postalCode: STUDIO.postalCode,
    addressCountry: STUDIO.country,
  },
  identifier: [{ '@type': 'PropertyValue', propertyID: 'SIRET', value: STUDIO.siret }],
} as const satisfies Record<string, unknown>
