import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'

const log = repoLogger.child({ repository: 'email-log' })

export type EmailType =
  | 'password-reset'
  | 'verification'
  | 'streak-risk'
  | 'relance'
  | 'inactive-reminder'
  | 'referral-announcement'
  | 'admin-test'
  | 'premium-granted'
  | 'reactivation-chest'

export type EmailStatus = 'sent' | 'failed' | 'skipped'

export interface EmailLogInput {
  userId?: string | null
  recipient: string
  type: EmailType
  subject: string
  status: EmailStatus
  providerMessageId?: string | null
  errorMessage?: string | null
}

export interface EmailLogRow {
  id: number
  user_id: string | null
  recipient: string
  type: EmailType
  subject: string
  status: EmailStatus
  provider_message_id: string | null
  error_message: string | null
  sent_at: Date
}

export interface EmailLogQuery {
  page?: number
  limit?: number
  status?: EmailStatus
  type?: EmailType
  userId?: string
  search?: string // recipient substring match
  dateFrom?: string // ISO timestamp
  dateTo?: string // ISO timestamp
}

export interface EmailLogPage {
  entries: EmailLogRow[]
  total: number
  page: number
  limit: number
}

const ERROR_MESSAGE_MAX = 1024
const SUBJECT_MAX = 512

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

export const emailLogRepository = {
  /**
   * Fire-and-forget log write. The audit log must never block or fail
   * the actual email send, so any DB error is swallowed and only logged.
   */
  async record(entry: EmailLogInput): Promise<void> {
    try {
      await db('email_log').insert({
        user_id: entry.userId ?? null,
        recipient: entry.recipient,
        type: entry.type,
        subject: truncate(entry.subject, SUBJECT_MAX),
        status: entry.status,
        provider_message_id: entry.providerMessageId ?? null,
        error_message: entry.errorMessage
          ? truncate(entry.errorMessage, ERROR_MESSAGE_MAX)
          : null,
      })
    } catch (error) {
      log.warn({ error: String(error), type: entry.type }, 'email-log write failed')
    }
  },

  async list(query: EmailLogQuery): Promise<EmailLogPage> {
    const page = Math.max(1, query.page ?? 1)
    const limit = Math.min(100, Math.max(1, query.limit ?? 25))
    const offset = (page - 1) * limit

    const base = db('email_log')
    if (query.status) base.where('status', query.status)
    if (query.type) base.where('type', query.type)
    if (query.userId) base.where('user_id', query.userId)
    if (query.search) base.where('recipient', 'ilike', `%${query.search}%`)
    if (query.dateFrom) base.where('sent_at', '>=', query.dateFrom)
    if (query.dateTo) base.where('sent_at', '<=', query.dateTo)

    const countRow = await base.clone().count<{ count: string }[]>('* as count').first()
    const total = Number(countRow?.count ?? 0)

    const entries = await base
      .clone()
      .orderBy('sent_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select<EmailLogRow[]>(
        'id',
        'user_id',
        'recipient',
        'type',
        'subject',
        'status',
        'provider_message_id',
        'error_message',
        'sent_at'
      )

    return { entries, total, page, limit }
  },
}
