/**
 * Pricing sync check.
 *
 * Resolves every entry in BILLING_CATALOG via its `lookupKey` and asserts
 * Stripe agrees on:
 *   - exactly one active Price exists for the lookup_key
 *   - currency matches
 *   - unit_amount matches (in cents)
 *   - recurring.interval matches (or null for one-time)
 *   - parent product is active
 *
 * Exits non-zero on any mismatch so the release pipeline can gate on it.
 *
 * Usage:
 *   npm run stripe:check                 # uses STRIPE_SECRET_KEY from .env
 *   npm run stripe:check -- --live       # explicit guard against running
 *                                          test-mode keys when you meant prod
 */
import Stripe from 'stripe'
import { BILLING_CATALOG, type BillingCatalogEntry } from '../src/config/billing.js'
import { env } from '../src/config/env.js'

interface CheckFailure {
  tier: string
  reason: string
}

const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

function fail(failures: CheckFailure[], tier: string, reason: string): void {
  failures.push({ tier, reason })
}

function checkEntry(
  entry: BillingCatalogEntry,
  prices: readonly Stripe.Price[],
  failures: CheckFailure[],
): void {
  const matches = prices.filter((p) => p.lookup_key === entry.lookupKey)
  if (matches.length === 0) {
    fail(failures, entry.tier, `no active Stripe price found for lookup_key "${entry.lookupKey}"`)
    return
  }
  if (matches.length > 1) {
    fail(
      failures,
      entry.tier,
      `${matches.length} active Stripe prices share lookup_key "${entry.lookupKey}" (${matches.map((p) => p.id).join(', ')}); archive duplicates`,
    )
    return
  }

  const price = matches[0]!

  if (price.currency !== entry.currency) {
    fail(failures, entry.tier, `currency mismatch: expected ${entry.currency}, Stripe has ${price.currency}`)
  }

  if (price.unit_amount !== entry.unitAmount) {
    fail(
      failures,
      entry.tier,
      `unit_amount mismatch: expected ${entry.unitAmount} cents (${(entry.unitAmount / 100).toFixed(2)} ${entry.currency.toUpperCase()}), Stripe has ${price.unit_amount}`,
    )
  }

  const stripeInterval = price.recurring?.interval ?? null
  if (stripeInterval !== entry.interval) {
    fail(
      failures,
      entry.tier,
      `interval mismatch: expected ${entry.interval ?? 'one-time'}, Stripe has ${stripeInterval ?? 'one-time'}`,
    )
  }

  const product = typeof price.product === 'object' && price.product !== null && !('deleted' in price.product) ? price.product : null
  if (!product || !product.active) {
    fail(failures, entry.tier, `parent product is missing or inactive`)
  }

  if (failures.find((f) => f.tier === entry.tier)) return

  console.log(
    `${GREEN}✓${RESET} ${entry.tier.padEnd(20)} ${DIM}${entry.lookupKey} → ${price.id}${RESET} ${(entry.unitAmount / 100).toFixed(2)} ${entry.currency.toUpperCase()} ${entry.interval ? `/ ${entry.interval}` : '(one-time)'}`,
  )
}

async function main(): Promise<void> {
  if (!env.STRIPE_SECRET_KEY) {
    console.error(`${RED}STRIPE_SECRET_KEY is not set.${RESET} Add it to .env or export it before running this script.`)
    process.exit(2)
  }

  const isLive = env.STRIPE_SECRET_KEY.startsWith('sk_live_')
  const flagLive = process.argv.includes('--live')
  if (isLive && !flagLive) {
    console.error(`${RED}Refusing to run against LIVE Stripe keys without --live flag.${RESET}`)
    process.exit(2)
  }
  if (flagLive && !isLive) {
    console.error(`${YELLOW}--live flag passed but STRIPE_SECRET_KEY is a test key. Continuing in test mode.${RESET}`)
  }

  console.log(`Checking ${BILLING_CATALOG.length} prices against Stripe (${isLive ? 'LIVE' : 'test'} mode)...\n`)

  const stripe = new Stripe(env.STRIPE_SECRET_KEY)
  const failures: CheckFailure[] = []

  let prices: Stripe.Price[]
  try {
    const lookupKeys = BILLING_CATALOG.map((e) => e.lookupKey)
    const result = await stripe.prices.list({
      lookup_keys: lookupKeys,
      active: true,
      expand: ['data.product'],
      limit: 100,
    })
    prices = result.data
  } catch (err) {
    console.error(`${RED}stripe.prices.list failed:${RESET}`, err instanceof Error ? err.message : err)
    process.exit(1)
  }

  for (const entry of BILLING_CATALOG) {
    checkEntry(entry, prices, failures)
  }

  if (failures.length > 0) {
    console.log(`\n${RED}✗ ${failures.length} mismatch${failures.length === 1 ? '' : 'es'}:${RESET}`)
    for (const f of failures) {
      console.log(`  ${RED}•${RESET} ${f.tier}: ${f.reason}`)
    }
    process.exit(1)
  }

  console.log(`\n${GREEN}All prices in sync.${RESET}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(`${RED}Unexpected error:${RESET}`, err)
  process.exit(1)
})
