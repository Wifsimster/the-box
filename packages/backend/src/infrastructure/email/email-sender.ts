import { resend } from '../auth/auth.js'
import { env } from '../../config/env.js'
import { authLogger } from '../logger/logger.js'
import {
  emailLogRepository,
  type EmailType,
} from '../repositories/email-log.repository.js'

const log = authLogger.child({ component: 'email-sender' })

export interface SendEmailInput {
  type: EmailType
  to: string
  subject: string
  html: string
  text?: string
  userId?: string | null
}

export interface SendEmailResult {
  status: 'sent' | 'failed' | 'skipped'
  providerMessageId?: string
  errorMessage?: string
}

/**
 * Single chokepoint for every transactional / marketing email the app
 * sends. Wraps Resend, applies the standard `From:` header, and writes
 * a row to `email_log` for every attempt — sent, failed, or skipped
 * (the dev-mode no-Resend-key case).
 *
 * Callers must provide an `EmailType` so the audit log stays
 * filterable; one-off ad-hoc sends should pick `'admin-test'` rather
 * than inventing a free-form string.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const baseLogEntry = {
    userId: input.userId ?? null,
    recipient: input.to,
    type: input.type,
    subject: input.subject,
  }

  if (!resend) {
    log.info({ type: input.type, to: input.to }, '[DEV] email skipped — RESEND_API_KEY not configured')
    await emailLogRepository.record({
      ...baseLogEntry,
      status: 'skipped',
      errorMessage: 'RESEND_API_KEY not configured',
    })
    return { status: 'skipped', errorMessage: 'RESEND_API_KEY not configured' }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `The Box <${env.EMAIL_FROM}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    })

    if (error) {
      log.warn({ type: input.type, to: input.to, err: error.message }, 'email send failed')
      await emailLogRepository.record({
        ...baseLogEntry,
        status: 'failed',
        errorMessage: error.message,
      })
      return { status: 'failed', errorMessage: error.message }
    }

    await emailLogRepository.record({
      ...baseLogEntry,
      status: 'sent',
      providerMessageId: data?.id ?? null,
    })
    return { status: 'sent', providerMessageId: data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error({ type: input.type, to: input.to, err: message }, 'email send threw')
    await emailLogRepository.record({
      ...baseLogEntry,
      status: 'failed',
      errorMessage: message,
    })
    return { status: 'failed', errorMessage: message }
  }
}
