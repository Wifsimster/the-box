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
