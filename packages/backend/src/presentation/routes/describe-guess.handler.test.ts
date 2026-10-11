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
import {
  isDescribeGuessActive,
  readDescribeGuessConfig,
  type SettingReader,
} from '../../domain/services/describe-guess.service.js'

const EVALUATION: DescribeEvaluation = {
  candidateGameIds: [1, 2, 3],
  chosenGameId: 1,
  probability: 0.97,
  accepted: true,
  threshold: 0.8,
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

describe('describe-guess gating from settings', () => {
  const reader = (values: Record<string, boolean | string | number | null>): SettingReader =>
    async (key) => (key in values ? values[key]! : null)

  it('needs both enabled and an API key', async () => {
    const cases: Array<[Record<string, boolean | string | null>, boolean]> = [
      [{}, false],
      [{ 'describeGuess.enabled': true }, false],
      [{ 'describeGuess.enabled': true, 'describeGuess.anthropicApiKey': '   ' }, false],
      [{ 'describeGuess.enabled': false, 'describeGuess.anthropicApiKey': 'sk-ant-xxxxxxxxxxxx' }, false],
      [{ 'describeGuess.enabled': true, 'describeGuess.anthropicApiKey': 'sk-ant-xxxxxxxxxxxx' }, true],
    ]
    for (const [values, expected] of cases) {
      assert.equal(isDescribeGuessActive(await readDescribeGuessConfig(reader(values))), expected, JSON.stringify(values))
    }
  })

  it('reads model and threshold, with defaults', async () => {
    const defaults = await readDescribeGuessConfig(reader({}))
    assert.equal(defaults.model, 'claude-haiku-5-5')
    assert.equal(defaults.threshold, 0.8)
    const custom = await readDescribeGuessConfig(
      reader({ 'describeGuess.model': 'claude-haiku-4-5', 'describeGuess.threshold': 0.9 })
    )
    assert.equal(custom.model, 'claude-haiku-4-5')
    assert.equal(custom.threshold, 0.9)
  })
})

describe('POST /describe', () => {
  let server: Server
  let baseUrl: string
  let enabled = false
  let gateThrows = false
  let service: DescribeGuessService | null = null
  let authCalls = 0
  const submits: SubmitDescriptionInput[] = []

  before(async () => {
    const app = express()
    app.use(express.json())
    app.post(
      '/describe',
      describeGuessGate(async () => {
        if (gateThrows) throw new Error('settings store down')
        return enabled
      }),
      // Stand-in for authMiddleware: counts calls so the test proves the gate
      // answers before any session lookup.
      (req, _res, next) => {
        authCalls++
        req.userId = 'u1'
        req.isGuest = req.header('x-guest') === '1'
        next()
      },
      createDescribeGuessHandler(async () => service)
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

  it('fails closed (404) when the settings cannot be read', async () => {
    enabled = true
    gateThrows = true
    authCalls = 0
    const res = await post(BODY)
    gateThrows = false
    assert.equal(res.status, 404)
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
