// In-process plaintext-secret cache for webhook signing.
//
// We never persist the plaintext signing secret — only its SHA-256 hash
// goes to the DB so a database compromise doesn't enable HMAC forgery.
// That means the plaintext lives in memory in exactly one place: this
// cache. The registration route writes here when minting a new webhook;
// the delivery worker reads here when minting a signature.
//
// Trade-off: after a process restart the cache is empty until the owner
// rotates the webhook. Deliveries in that window go out with
// `X-TheBox-Signature: unsigned` and receivers reject them. Surfaced
// in the dashboard so operators can re-roll. M3 plan: envelope-encrypted
// secrets at rest so the restart hole closes.

class WebhookSecretCache {
  private readonly store = new Map<number, string>()
  set(webhookId: number, secret: string): void {
    this.store.set(webhookId, secret)
  }
  get(webhookId: number): string | undefined {
    return this.store.get(webhookId)
  }
  delete(webhookId: number): void {
    this.store.delete(webhookId)
  }
}

export const webhookSecretCache = new WebhookSecretCache()
