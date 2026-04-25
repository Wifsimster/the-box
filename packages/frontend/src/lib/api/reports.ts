import type { ScreenshotReportReason } from '@the-box/types'

export class ReportApiError extends Error {
    constructor(
        public code: string,
        message: string,
        public status?: number,
    ) {
        super(message)
        this.name = 'ReportApiError'
    }
}

interface ApiEnvelope<T> {
    success: boolean
    data: T
    error?: { code: string; message?: string }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, {
        credentials: 'include',
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
        },
    })
    const json = (await res.json()) as ApiEnvelope<T>
    if (!res.ok || !json.success) {
        throw new ReportApiError(
            json.error?.code ?? 'REPORT_REQUEST_FAILED',
            json.error?.message ?? `Request to ${path} failed`,
            res.status,
        )
    }
    return json.data
}

// Wire shape of POST /api/screenshot-reports — exactly one target must be set.
export type SubmitReportInput =
    | {
          screenshotId: number
          geoScreenshotCandidateId?: never
          reason: ScreenshotReportReason
          details?: string
      }
    | {
          geoScreenshotCandidateId: number
          screenshotId?: never
          reason: ScreenshotReportReason
          details?: string
      }

export interface SubmitReportResult {
    received: boolean
    deactivated: boolean
    reportCount: number
}

export const reportsApi = {
    submit(input: SubmitReportInput): Promise<SubmitReportResult> {
        return request<SubmitReportResult>('/api/screenshot-reports', {
            method: 'POST',
            body: JSON.stringify(input),
        })
    },
}
