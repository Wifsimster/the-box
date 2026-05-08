// Print a VAPID keypair for Web Push. Drop the output into your .env:
//   VAPID_PUBLIC_KEY=...
//   VAPID_PRIVATE_KEY=...
//   VAPID_SUBJECT=mailto:you@example.com
//
// Usage: npm run vapid:generate -w @the-box/backend
import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()
process.stdout.write(
  [
    `VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `VAPID_PRIVATE_KEY=${keys.privateKey}`,
    'VAPID_SUBJECT=mailto:no-reply@the-box.battistella.ovh',
    '',
  ].join('\n'),
)
