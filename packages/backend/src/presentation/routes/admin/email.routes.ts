import { Router } from 'express'
import { z } from 'zod'
import { resend } from '../../../infrastructure/auth/auth.js'
import { env } from '../../../config/env.js'
import { renderEmailHtml, renderEmailText } from '../../../infrastructure/email/template.js'
import { createRateLimiter } from '../../middleware/rate-limit.middleware.js'
import {
  emailLogRepository,
} from '../../../infrastructure/repositories/index.js'

// Cap even admin-triggered sends so a mistake or compromised admin
// account can't spray mail on Resend's dime. Keyed by user id so two
// admins don't starve each other out.
const testEmailLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  key: (req) => req.userId ?? req.ip ?? 'unknown',
})

const router = Router()

// === Email Settings ===

// Get email configuration status
router.get('/email/config', async (_req, res, next) => {
  try {
    const hasApiKey = !!env.RESEND_API_KEY
    const configured = hasApiKey && !!resend

    res.json({
      success: true,
      data: {
        configured,
        hasApiKey,
        emailFrom: env.EMAIL_FROM,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Send test email
const testEmailSchema = z.object({
  email: z.string().email().optional(),
})

router.post('/email/test', testEmailLimiter, async (req, res, next) => {
  try {
    const user = req.user
    const { email } = testEmailSchema.parse(req.body)

    // Use provided email or fallback to user's email
    const recipientEmail = email || user?.email

    if (!recipientEmail) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_EMAIL', message: 'No email address provided and user email not found' },
      })
      return
    }

    if (!resend) {
      res.status(400).json({
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'Email service is not configured. Please set RESEND_API_KEY.' },
      })
      return
    }

    const subject = 'Test Email - The Box'
    const sentAt = new Date().toISOString()
    const html = renderEmailHtml({
      eyebrow: 'The Box · Admin',
      heading: 'Test e-mail',
      paragraphs: [
        "Cet e-mail de test a été envoyé depuis le panneau d'administration de The Box.",
        'Si tu le reçois, la configuration Resend est opérationnelle.',
      ],
      tip: `Envoyé le ${sentAt}`,
    })
    const text = renderEmailText({
      heading: 'Test e-mail',
      paragraphs: [
        "Cet e-mail de test a été envoyé depuis le panneau d'administration de The Box.",
        'Si tu le reçois, la configuration Resend est opérationnelle.',
      ],
      tip: `Envoyé le ${sentAt}`,
    })
    const { data, error } = await resend.emails.send({
      from: `The Box <${env.EMAIL_FROM}>`,
      to: recipientEmail,
      subject,
      html,
      text,
    })

    if (error) {
      await emailLogRepository.record({
        userId: user?.id ?? null,
        recipient: recipientEmail,
        type: 'admin-test',
        subject,
        status: 'failed',
        errorMessage: error.message,
      })
      res.status(500).json({
        success: false,
        error: {
          code: 'EMAIL_ERROR',
          message: error.message || 'Failed to send email',
          details: error.name || 'unknown_error',
        },
      })
      return
    }

    await emailLogRepository.record({
      userId: user?.id ?? null,
      recipient: recipientEmail,
      type: 'admin-test',
      subject,
      status: 'sent',
      providerMessageId: data?.id ?? null,
    })

    res.json({
      success: true,
      data: { sent: true, to: recipientEmail, emailId: data?.id },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    if (error instanceof Error) {
      res.status(500).json({
        success: false,
        error: { code: 'EMAIL_ERROR', message: error.message },
      })
      return
    }
    next(error)
  }
})

// === Email Log ===

const emailTypeValues = [
  'password-reset',
  'verification',
  'streak-risk',
  'relance',
  'inactive-reminder',
  'referral-announcement',
  'admin-test',
] as const

const emailLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['sent', 'failed', 'skipped']).optional(),
  type: z.enum(emailTypeValues).optional(),
  userId: z.string().min(1).optional(),
  search: z.string().min(1).max(320).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
})

router.get('/email-log', async (req, res, next) => {
  try {
    const params = emailLogQuerySchema.parse(req.query)
    const result = await emailLogRepository.list(params)
    res.json({
      success: true,
      data: {
        entries: result.entries.map((row) => ({
          id: row.id,
          userId: row.user_id,
          recipient: row.recipient,
          type: row.type,
          subject: row.subject,
          status: row.status,
          providerMessageId: row.provider_message_id,
          errorMessage: row.error_message,
          sentAt: row.sent_at instanceof Date ? row.sent_at.toISOString() : String(row.sent_at),
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message },
      })
      return
    }
    next(error)
  }
})


export default router
