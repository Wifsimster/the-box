import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createDescribeGuessHandler, describeGuessGate } from './describe-guess.handler.js'
import {
  DescribeGuessError,
  type DescribeEvaluation,
  type DescribeGuessService,
  type SubmitDescriptionInput,
} from '../../domain/services/describe-guess.service.js'
import { isDescribeGuessEnabled } from '../../config/env.js'

const EVALUATION: DescribeEvaluation = {
  candidateGameIds: [1, 2, 3],
  chosenGameId: 1,
  probability: 0.97,
  accepted: true,
  titlePrefilterHit: false,
  model: 'claude-haiku-5-5',
  latencyMs: 1200,
  inputTokens: 1000,
  outputTokens: 50,
  error: null,
}

const BODY = {
  tierSessionId: 'ts1',
  screenshotId: 77,
  position: 3,
  description: 'un plombier qui saute de planete en planete',
  locale: 'fr',
}

describe('isDescribeGuessEnabled', () => {
  it('needs both the flag and an API key', () => {
    assert.equal(isDescribeGuessEnabled({ DESCRIBE_GUESS_ENABLED: 'false', ANTHROPIC_API_KEY: '' }), false)
    assert.equal(isDescribeGuessEnabled({ DESCRIBE_GUESS_ENABLED: 'true', ANTHROPIC_API_KEY: '' }), false)
    assert.equal(isDescribeGuessEnabled({ DESCRIBE_GUESS_ENABLED: 'true', ANTHROPIC_API_KEY: '   ' }), false)
    assert.equal(isDescribeGuessEnabled({ DESCRIBE_GUESS_ENABLED: 'false', ANTHROPIC_API_KEY: 'k' }), false)
    assert.equal(isDescribeGuessEnabled({ DESCRIBE_GUESS_ENABLED: '1', ANTHROPIC_API_KEY: 'k' }), false)
    assert.equal(isDescribeGuessEnabled({ DESCRIBE_GUESS_ENABLED: 'true', ANTHROPIC_API_KEY: 'k' }), true)
  })
})

describe('POST /describe', () => {
  let server: Server
  let baseUrl: string
  let enabled = false
  let service: DescribeGuessService | null = null
  let authCalls = 0
  const submits: SubmitDescriptionInput[] = []

  before(async () => {
    const app = express()
    app.use(express.json())
    app.post(
      '/describe',
      describeGuessGate(() => enabled),
      // Stand-in for authMiddleware: counts calls so the test proves the gate
      // answers before any session lookup.
      (req, _res, next) => {
        authCalls++
        req.userId = 'u1'
        req.isGuest = req.header('x-guest') === '1'
        next()
      },
      createDescribeGuessHandler(() => service)
    )
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve())
    })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  after(() => {
    server.close()
  })

  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}/describe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

  it('404s before auth when the feature is off', async () => {
    enabled = false
    service = {
      evaluate: async () => EVALUATION,
      submit: async () => {
        throw new Error('must not be called')
      },
    }
    authCalls = 0
    const res = await post(BODY)
    assert.equal(res.status, 404)
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'NOT_FOUND')
    assert.equal(authCalls, 0)
  })

  it('404s when the gate passes but no service is wired', async () => {
    enabled = true
    service = null
    const res = await post(BODY)
    assert.equal(res.status, 404)
  })

  it('answers the same acknowledgement whatever the verdict, without leaking it', async () => {
    enabled = true
    service = {
      evaluate: async () => EVALUATION,
      submit: async (input) => {
        submits.push(input)
        return EVALUATION
      },
    }
    const res = await post(BODY, { 'x-guest': '1' })
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(json, { success: true, data: { recorded: true } })
    assert.equal(submits.at(-1)!.isGuest, true)
    assert.equal(submits.at(-1)!.userId, 'u1')
    assert.equal(submits.at(-1)!.locale, 'fr')
  })

  it('falls back to fr for an unknown locale', async () => {
    enabled = true
    await post({ ...BODY, locale: 'de' })
    assert.equal(submits.at(-1)!.locale, 'fr')
  })

  it('400s on a malformed body', async () => {
    enabled = true
    const res = await post({ ...BODY, position: 'three' })
    assert.equal(res.status, 400)
  })

  it('maps rule violations to their status and code', async () => {
    enabled = true
    service = {
      evaluate: async () => EVALUATION,
      submit: async () => {
        throw new DescribeGuessError('ALREADY_DESCRIBED', 'already', 409)
      },
    }
    const res = await post(BODY)
    assert.equal(res.status, 409)
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'ALREADY_DESCRIBED')
  })
})
