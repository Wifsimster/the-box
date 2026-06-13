// Composition module for the billing service.
//
// Kept separate from the main composition root (index.ts) on purpose: the
// billing webhook route is unit-tested and imports the production
// billingService for its default router. index.ts eagerly constructs the
// BullMQ queues (which open a Redis connection and keep the event loop
// alive), so a tested module must not transitively import it. This module
// wires billing from billing-only infrastructure — no queues — so it stays
// safe to import from a test. The barrel re-exports the singleton built here.
import { createBillingService } from './billing.service.js'
import { serviceLogger } from '../../infrastructure/logger/logger.js'
import { userRepository } from '../../infrastructure/repositories/user.repository.js'
import {
  subscriptionRepository,
  ENTITLED_STATUSES,
} from '../../infrastructure/repositories/subscription.repository.js'
import { getStripe } from '../../infrastructure/stripe/stripe.client.js'
import {
  tierFromPriceId,
  snapshotResolvedCatalog,
} from '../../infrastructure/stripe/billing-catalog.resolver.js'

// Stripe premium / lifetime-supporter entitlements. The service stays pure;
// the concrete repositories, the entitled-status set, the Stripe customer
// API, and the lookup_key catalog resolver are bound here. The Stripe SDK is
// adapted to the narrow BillingStripeGateway so the domain never imports it.
export const billingService = createBillingService({
  logger: serviceLogger,
  userRepository,
  subscriptionRepository,
  entitledStatuses: ENTITLED_STATUSES,
  stripe: {
    async createCustomer({ email, name, userId }) {
      const customer = await getStripe().customers.create({
        email,
        name,
        metadata: { userId },
      })
      return { id: customer.id }
    },
    async retrieveCustomer(customerId) {
      const customer = await getStripe().customers.retrieve(customerId)
      if (customer.deleted) return { deleted: true, userId: null }
      return { deleted: false, userId: customer.metadata?.['userId'] ?? null }
    },
  },
  catalog: { tierFromPriceId, snapshotResolvedCatalog },
})
