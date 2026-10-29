import { createBillingService } from '../domain/services/billing.service.js'
import { serviceLogger } from '../infrastructure/logger/logger.js'
import { userRepository } from '../infrastructure/repositories/user.repository.js'
import {
  subscriptionRepository,
  ENTITLED_STATUSES,
} from '../infrastructure/repositories/subscription.repository.js'
import { getStripe } from '../infrastructure/stripe/stripe.client.js'
import {
  tierFromPriceId,
  snapshotResolvedCatalog,
} from '../infrastructure/stripe/billing-catalog.resolver.js'

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
