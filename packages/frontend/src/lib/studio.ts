export const STUDIO = {
  name: 'BATTISTELLA',
  legalName: 'BATTISTELLA EI',
  url: 'https://pro.battistella.ovh/',
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

export const STUDIO_LD_ID = `${STUDIO.url}#organization`

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
