#!/usr/bin/env node
// control-thebox — drive a throwaway local The Box instance the way a player does.
// Agent-facing: JSON on stdout, one object per invocation, exit 0 on success.
// Run `control-thebox --help` or `control-thebox <command> --help`.

import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..', '..')
const RUN_DIR = path.join(REPO, '.verify-run')
const STATE_FILE = path.join(RUN_DIR, 'state.json')
const EVIDENCE_ROOT = process.env.THEBOX_EVIDENCE_DIR || path.join(REPO, '.verify-evidence')
const FIXTURE_DIR = path.join(REPO, 'uploads', 'verify-fixtures')

const PORTS = { backend: 3000, frontend: 5173, cdp: 9333, postgres: 55432, redis: 56379 }
const PG = 'thebox-verify-pg'
const REDIS = 'thebox-verify-redis'
const LABEL = 'thebox-verify=1'
const DB_URL = `postgresql://thebox:thebox_verify@127.0.0.1:${PORTS.postgres}/thebox`
const BASE = `http://localhost:${PORTS.frontend}`
const USERS = {
  user: { email: 'e2e_user@test.local', password: 'test123' },
  admin: { email: 'e2e_admin@test.local', password: 'test123' },
}

// ---------- output ----------
function out(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n')
}
class CliError extends Error {
  constructor(message, fix, extra = {}) {
    super(message)
    this.fix = fix
    this.extra = extra
  }
}
function fail(message, fix, extra) {
  throw new CliError(message, fix, extra)
}

// ---------- args ----------
function parseArgs(argv) {
  const pos = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=')
      if (v !== undefined) flags[k] = v
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i]
      else flags[k] = true
    } else pos.push(a)
  }
  return { pos, flags }
}

// ---------- state ----------
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return null
  }
}
function writeState(s) {
  fs.mkdirSync(RUN_DIR, { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
}
function requireState() {
  const s = readState()
  if (!s) fail('No running verification instance.', 'Run `control-thebox launch` first (or `control-thebox doctor` to see what is up).')
  return s
}
function evidenceDir(state) {
  const dir = path.join(EVIDENCE_ROOT, state?.runId || 'adhoc')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' })
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('error', () => resolve(false))
  })
}
function alive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}
function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
}
function docker(...args) {
  return sh('docker', args)
}
function containerRunning(name) {
  try { return docker('inspect', '-f', '{{.State.Running}}', name) === 'true' } catch { return false }
}
function psql(sql) {
  return sh('docker', ['exec', PG, 'psql', '-U', 'thebox', '-d', 'thebox', '-At', '-c', sql])
}
function psqlJson(sql) {
  const raw = psql(`select coalesce(json_agg(t), '[]'::json) from (${sql}) t`)
  return JSON.parse(raw || '[]')
}
async function httpJson(url, opts) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text.slice(0, 500) }
  return { status: res.status, body }
}
async function waitFor(fn, { timeoutMs, label }) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeoutMs) {
    try { if (await fn()) return Date.now() - start } catch (e) { last = e }
    await sleep(500)
  }
  fail(`Timed out after ${timeoutMs}ms waiting for ${label}.`, `Check the logs in ${path.join(RUN_DIR, 'logs')} and run \`control-thebox doctor\`.`, { lastError: last?.message })
}
function spawnDetached(name, cmd, args, { cwd, env }) {
  const logDir = path.join(RUN_DIR, 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  const log = fs.openSync(path.join(logDir, `${name}.log`), 'a')
  const child = spawn(cmd, args, { cwd, env, detached: true, stdio: ['ignore', log, log] })
  child.unref()
  return child.pid
}
function loadPlaywright() {
  const req = createRequire(path.join(REPO, 'packages', 'frontend', 'package.json'))
  try { return req('@playwright/test') } catch {
    fail('Cannot load @playwright/test from the repo.', 'Run `npm ci` at the repo root, then `npx playwright install chromium` in packages/frontend.')
  }
}
async function connect() {
  const state = requireState()
  const { chromium } = loadPlaywright()
  let browser
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORTS.cdp}`)
  } catch (e) {
    fail('Browser daemon is not reachable on the CDP port.', 'Run `control-thebox doctor`; if browser is down, run `control-thebox teardown` then `control-thebox launch`.', { error: e.message })
  }
  const ctx = browser.contexts()[0]
  const page = ctx.pages()[0] || (await ctx.newPage())
  return { browser, ctx, page, state }
}
function shotPath(state, name) {
  const safe = String(name || 'shot').replace(/[^a-z0-9._-]+/gi, '-')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(evidenceDir(state), `${stamp}_${safe}.png`)
}
async function dismissModals(page) {
  // Daily-login reward modal and other Radix dialogs show after login. Claim
  // (harmless on fake data) or close, then Escape as a last resort.
  for (const loc of [
    page.getByRole('button', { name: /claim/i }).first(),
    page.getByRole('dialog').getByRole('button', { name: /close|fermer/i }).first(),
  ]) {
    if (await loc.isVisible().catch(() => false)) {
      await loc.click({ timeout: 3000 }).catch(() => {})
      await sleep(500)
    }
  }
  await page.keyboard.press('Escape').catch(() => {})
}

// ---------- fixture images ----------
// The e2e seed points screenshots at placeholder URLs the image route refuses
// (415). We render one local PNG per fake screenshot with Playwright and
// repoint the rows at /uploads/verify-fixtures/. Removed by teardown.
async function makeFixtureImages() {
  const rows = psqlJson(`select s.id, g.name from screenshots s join games g on g.id = s.game_id where g.name like 'E2E Test Game%' order by s.id`)
  if (!rows.length) fail('No E2E screenshots in the database after seeding.', 'Check .verify-run/logs/seed.log; the e2e seed must create "E2E Test Game" rows.')
  fs.mkdirSync(FIXTURE_DIR, { recursive: true })
  const { chromium } = loadPlaywright()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const hues = { 'E2E Test Game 1': 265, 'E2E Test Game 2': 190, 'E2E Test Game 3': 20 }
  for (const r of rows) {
    const h = hues[r.name] ?? 120
    await page.setContent(`<body style="margin:0;width:1280px;height:720px;display:grid;place-items:center;font:600 56px sans-serif;color:#fff;background:linear-gradient(135deg,hsl(${h} 70% 30%),hsl(${(h + 60) % 360} 70% 15%))"><div>FAKE SCREENSHOT #${r.id}<div style="font-size:24px;opacity:.7;text-align:center">verification fixture</div></div></body>`)
    await page.screenshot({ path: path.join(FIXTURE_DIR, `shot-${r.id}.png`) })
  }
  await browser.close()
  psql(`update screenshots set image_url = '/uploads/verify-fixtures/shot-' || id || '.png', thumbnail_url = '/uploads/verify-fixtures/shot-' || id || '.png' where id in (${rows.map((r) => r.id).join(',')})`)
  return rows.length
}

// ---------- commands ----------
const COMMANDS = {}

COMMANDS.launch = {
  summary: 'Start throwaway Postgres+Redis, migrate+seed fake data, backend, frontend and the browser daemon.',
  help: `control-thebox launch [--dry-run]

Starts one isolated verification instance:
  - docker containers ${PG} (127.0.0.1:${PORTS.postgres}, tmpfs, label ${LABEL}) and ${REDIS} (127.0.0.1:${PORTS.redis})
  - knex migrations + the repo's e2e seed (fake users e2e_user/e2e_admin, 3 fake games, today's challenge)
  - fixture PNGs under uploads/verify-fixtures/ (verification scaffolding)
  - backend (tsx, :${PORTS.backend}) and Vite (:${PORTS.frontend}, strictPort), logs in .verify-run/logs/
  - a headless Chromium daemon (CDP :${PORTS.cdp}) that records console + network to JSONL
No production data, no real Stripe/Resend keys (they are forced empty).
Refuses to start if any of those ports is already taken: one instance at a time.

--dry-run   print the plan (ports, containers, commands) and touch nothing.`,
  async run(flags) {
    const plan = {
      ports: PORTS,
      containers: [PG, REDIS],
      steps: ['docker run postgres:16-alpine (tmpfs)', 'docker run redis:7-alpine', 'npm run build -w @the-box/types', 'npm run db:migrate -w @the-box/backend', 'npm run e2e:seed -w @the-box/backend', 'render fixture PNGs', 'tsx src/index.ts', 'vite --port 5173 --strictPort', 'browser daemon'],
      evidenceRoot: EVIDENCE_ROOT,
    }
    if (flags['dry-run']) return { ok: true, dryRun: true, plan }
    if (readState()) fail('A verification instance is already recorded in .verify-run/state.json.', 'Run `control-thebox doctor` to inspect it, or `control-thebox teardown` before launching again.')
    const busy = []
    for (const [k, p] of Object.entries(PORTS)) if (await portInUse(p)) busy.push(`${k}:${p}`)
    if (busy.length) fail(`Ports already in use: ${busy.join(', ')}.`, 'Another app (or a leaked run) owns them. Do not kill it blindly: check `ss -ltnp`, stop your own leftover with `control-thebox teardown`, or ask the lead.', { busy })
    for (const c of [PG, REDIS]) {
      try { docker('inspect', c); fail(`Container ${c} already exists.`, `Run \`control-thebox teardown\` (it removes only containers labelled ${LABEL}).`) } catch (e) { if (e instanceof CliError) throw e }
    }

    const runId = new Date().toISOString().replace(/[:.]/g, '-')
    const state = { runId, startedAt: new Date().toISOString(), pids: {}, containers: [], gitSha: sh('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD']) }
    writeState(state)
    const timings = {}
    let t = Date.now()

    docker('run', '-d', '--name', PG, '--label', LABEL, '-p', `127.0.0.1:${PORTS.postgres}:5432`, '--tmpfs', '/var/lib/postgresql/data',
      '-e', 'POSTGRES_USER=thebox', '-e', 'POSTGRES_PASSWORD=thebox_verify', '-e', 'POSTGRES_DB=thebox', 'postgres:16-alpine')
    state.containers.push(PG); writeState(state)
    docker('run', '-d', '--name', REDIS, '--label', LABEL, '-p', `127.0.0.1:${PORTS.redis}:6379`, 'redis:7-alpine')
    state.containers.push(REDIS); writeState(state)
    await waitFor(() => { psql('select 1'); return true }, { timeoutMs: 60000, label: 'postgres' })
    timings.containers = Date.now() - t; t = Date.now()

    const env = {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(PORTS.backend),
      DATABASE_URL: DB_URL,
      REDIS_URL: `redis://127.0.0.1:${PORTS.redis}`,
      BETTER_AUTH_SECRET: crypto.randomBytes(32).toString('base64'),
      API_URL: `http://localhost:${PORTS.backend}`,
      FRONTEND_URL: BASE,
      CORS_ORIGIN: BASE,
      LOG_LEVEL: 'info',
      // Never real third parties during verification.
      STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', RESEND_API_KEY: '', RAWG_API_KEY: '',
      RELANCE_EMAIL_ENABLED: 'false', INACTIVE_USER_REMINDER_ENABLED: 'false',
      VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', KOE_IDENTITY_SECRET: '',
      VITE_API_URL: '', VITE_USE_MOCK_API: 'false', VITE_GOATCOUNTER_URL: '', VITE_KOE_PROJECT_KEY: '', VITE_KOE_API_URL: '',
    }
    const logDir = path.join(RUN_DIR, 'logs'); fs.mkdirSync(logDir, { recursive: true })
    // Backend and frontend import @the-box/types from its dist/: build it first.
    for (const [name, script, ws] of [['types', 'build', '@the-box/types'], ['migrate', 'db:migrate', '@the-box/backend'], ['seed', 'e2e:seed', '@the-box/backend']]) {
      try {
        const o = sh('npm', ['run', script, '-w', ws], { cwd: REPO, env, maxBuffer: 64 << 20 })
        fs.writeFileSync(path.join(logDir, `${name}.log`), o)
      } catch (e) {
        fs.writeFileSync(path.join(logDir, `${name}.log`), `${e.stdout}\n${e.stderr}`)
        fail(`${script} failed.`, `Read ${path.join(logDir, name + '.log')}, fix the cause, then \`control-thebox teardown\` and launch again.`)
      }
    }
    timings.migrateSeed = Date.now() - t; t = Date.now()
    const fixtures = await makeFixtureImages()
    timings.fixtures = Date.now() - t; t = Date.now()

    const bin = (n) => path.join(REPO, 'node_modules', '.bin', n)
    state.pids.backend = spawnDetached('backend', bin('tsx'), ['src/index.ts'], { cwd: path.join(REPO, 'packages', 'backend'), env })
    writeState(state)
    await waitFor(async () => (await fetch(`http://127.0.0.1:${PORTS.backend}/health`)).ok, { timeoutMs: 120000, label: 'backend /health' })
    timings.backend = Date.now() - t; t = Date.now()

    state.pids.frontend = spawnDetached('frontend', bin('vite'), ['--port', String(PORTS.frontend), '--strictPort', '--host', 'localhost'], { cwd: path.join(REPO, 'packages', 'frontend'), env })
    writeState(state)
    await waitFor(async () => (await fetch(BASE)).ok, { timeoutMs: 120000, label: 'vite dev server' })
    timings.frontend = Date.now() - t; t = Date.now()

    state.pids.browser = spawnDetached('browserd', process.execPath, [fileURLToPath(import.meta.url), '__browserd'], { cwd: REPO, env: process.env })
    writeState(state)
    await waitFor(() => portInUse(PORTS.cdp), { timeoutMs: 60000, label: 'browser daemon CDP port' })
    timings.browser = Date.now() - t
    state.readyAt = new Date().toISOString()
    writeState(state)
    return { ok: true, runId, base: BASE, pids: state.pids, containers: state.containers, fixtures, timingsMs: timings, evidenceDir: evidenceDir(state), next: 'control-thebox doctor' }
  },
}

COMMANDS.doctor = {
  summary: 'Read-only health check: is this instance ours, up, seeded and drivable?',
  help: `control-thebox doctor

Read-only. Checks: state file, recorded pids alive, containers running, backend /healthz (db+redis),
Vite answering, browser daemon CDP port, Playwright Chromium installed, seeded fake users present,
today's challenge present, today's preview screenshot served as an image, git sha of the checkout. Exit 0 only when every check passes.
Run it first whenever anything looks off.`,
  async run() {
    const state = readState()
    const checks = {}
    checks.stateFile = !!state
    checks.pids = Object.fromEntries(Object.entries(state?.pids || {}).map(([k, p]) => [k, alive(p)]))
    checks.containers = Object.fromEntries([PG, REDIS].map((c) => [c, containerRunning(c)]))
    try { const h = await httpJson(`http://127.0.0.1:${PORTS.backend}/healthz`); checks.backendHealthz = h.body } catch { checks.backendHealthz = false }
    try { checks.frontend = (await fetch(BASE)).ok } catch { checks.frontend = false }
    checks.browserCdp = await portInUse(PORTS.cdp)
    try { const { chromium } = loadPlaywright(); checks.playwrightChromium = fs.existsSync(chromium.executablePath()) } catch { checks.playwrightChromium = false }
    if (checks.containers[PG]) {
      try {
        checks.seededUsers = psql(`select count(*) from "user" where email like 'e2e_%@test.local'`) === '2'
        checks.todayChallenge = psql(`select count(*) from daily_challenges where challenge_date = current_date`) === '1'
      } catch (e) { checks.db = e.message }
    }
    checks.gitSha = sh('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'])
    // Fetch today's public preview image: proves the upload route streams a real screenshot file.
    try {
      const r = await fetch(`http://127.0.0.1:${PORTS.backend}/api/game/preview/image`)
      checks.screenshotsServable = r.ok && (r.headers.get('content-type') || '').startsWith('image/')
    } catch { checks.screenshotsServable = false }
    const backendOk = !!(checks.backendHealthz?.checks?.db && checks.backendHealthz?.checks?.redis)
    const ok = !!state && Object.values(checks.pids).every(Boolean) && Object.values(checks.containers).every(Boolean)
      && backendOk && checks.frontend && checks.browserCdp && checks.seededUsers && checks.todayChallenge && checks.playwrightChromium
      && checks.screenshotsServable
    const hints = []
    if (!state) hints.push('No instance recorded: run `control-thebox launch`.')
    if (state && !Object.values(checks.pids).every(Boolean)) hints.push('A recorded process died: read .verify-run/logs/*.log, then `control-thebox teardown` and launch again.')
    if (!checks.playwrightChromium) hints.push('Run `npx playwright install chromium` in packages/frontend.')
    if (state && checks.containers[PG] && !checks.todayChallenge) hints.push('No challenge for today (UTC date rolled over?): run `npm run e2e:seed -w @the-box/backend` with DATABASE_URL from this tool, or relaunch.')
    if (backendOk && !checks.screenshotsServable) hints.push('GET /api/game/preview/image did not return an image: check uploads/verify-fixtures/ exists and read .verify-run/logs/backend.log.')
    if (!ok) process.exitCode = 1
    return { ok: !!ok, runId: state?.runId, checks, hints }
  },
}

COMMANDS.teardown = {
  summary: 'Stop what launch started (by recorded pid / labelled container); keep evidence.',
  help: `control-thebox teardown [--dry-run]

Kills the process groups recorded in .verify-run/state.json (never by name), removes the
${PG}/${REDIS} containers only if they carry label ${LABEL}, deletes uploads/verify-fixtures/
and .verify-run/. Before deleting, copies logs and console/network JSONL into the evidence
dir. Evidence under ${EVIDENCE_ROOT} is never deleted.

--dry-run   list what would be stopped/removed and do nothing.`,
  async run(flags) {
    const state = readState()
    const plan = { kill: state?.pids || {}, containers: [], remove: [FIXTURE_DIR, RUN_DIR].filter((p) => fs.existsSync(p)), keep: EVIDENCE_ROOT }
    for (const c of [PG, REDIS]) {
      try { if (docker('inspect', '-f', '{{index .Config.Labels "thebox-verify"}}', c) === '1') plan.containers.push(c) } catch {}
    }
    if (flags['dry-run']) return { ok: true, dryRun: true, plan }
    let saved = null
    if (state && fs.existsSync(RUN_DIR)) {
      saved = path.join(evidenceDir(state), 'run-logs')
      fs.mkdirSync(saved, { recursive: true })
      for (const f of ['console.jsonl', 'network.jsonl']) if (fs.existsSync(path.join(RUN_DIR, f))) fs.copyFileSync(path.join(RUN_DIR, f), path.join(saved, f))
      if (fs.existsSync(path.join(RUN_DIR, 'logs'))) fs.cpSync(path.join(RUN_DIR, 'logs'), path.join(saved, 'logs'), { recursive: true })
    }
    const killed = {}
    for (const [name, pid] of Object.entries(state?.pids || {})) {
      try { process.kill(-pid, 'SIGTERM'); killed[name] = 'SIGTERM' } catch { killed[name] = 'not running' }
    }
    await sleep(1500)
    for (const [name, pid] of Object.entries(state?.pids || {})) {
      if (alive(pid)) { try { process.kill(-pid, 'SIGKILL'); killed[name] = 'SIGKILL' } catch {} }
    }
    for (const c of plan.containers) docker('rm', '-f', c)
    fs.rmSync(FIXTURE_DIR, { recursive: true, force: true })
    fs.rmSync(RUN_DIR, { recursive: true, force: true })
    const portsStillOpen = []
    for (const [k, p] of Object.entries(PORTS)) if (await portInUse(p)) portsStillOpen.push(`${k}:${p}`)
    return { ok: portsStillOpen.length === 0, killed, removedContainers: plan.containers, savedLogs: saved, evidenceKept: state ? evidenceDir(state) : EVIDENCE_ROOT, portsStillOpen }
  },
}

COMMANDS.info = {
  summary: 'Print the recorded run (ids, pids, urls, evidence dir).',
  help: 'control-thebox info\n\nRead-only: prints .verify-run/state.json plus fake credentials and the evidence dir.',
  async run() {
    const s = requireState()
    return { ok: true, ...s, base: BASE, users: USERS, evidenceDir: evidenceDir(s) }
  },
}

COMMANDS.login = {
  summary: 'Log the shared browser in through the real /en/login form.',
  help: `control-thebox login [--as user|admin]

Fills /en/login with a seeded fake account (e2e_user@test.local or e2e_admin@test.local,
password test123), submits, dismisses the daily-login reward modal. Side effect: creates a
session row and may claim today's login reward on the throwaway DB.
--dry-run   print the account and selectors without submitting.`,
  async run(flags) {
    const who = USERS[flags.as || 'user']
    if (!who) fail(`Unknown account "${flags.as}".`, 'Use --as user or --as admin.')
    if (flags['dry-run']) return { ok: true, dryRun: true, account: who.email, url: `${BASE}/en/login` }
    const { browser, page } = await connect()
    await page.goto(`${BASE}/en/login`)
    await page.locator('form').waitFor()
    await page.getByPlaceholder(/you@example.com|email|username/i).fill(who.email)
    await page.locator('input[type="password"]').first().fill(who.password)
    const resp = page.waitForResponse((r) => r.url().includes('/api/auth/sign-in'), { timeout: 15000 }).catch(() => null)
    await page.getByRole('button', { name: /^(log ?in|sign in)$/i }).click()
    const r = await resp
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 }).catch(() => {})
    await dismissModals(page)
    const url = page.url()
    await browser.close()
    if (url.includes('/login')) fail('Login did not leave /en/login.', 'Check `control-thebox network-log --filter /api/auth` and backend logs; rerun the e2e seed if the users are missing.', { signInStatus: r?.status() })
    return { ok: true, account: who.email, signInStatus: r?.status(), url }
  },
}

COMMANDS.goto = {
  summary: 'Navigate the shared page to a path (e.g. /en/leaderboard).',
  help: 'control-thebox goto <path>\n\nNavigates and waits for network idle. Example: control-thebox goto /en/profile',
  async run(_f, pos) {
    if (!pos[0]) fail('Missing path.', 'Example: control-thebox goto /en/leaderboard')
    const { browser, page } = await connect()
    const r = await page.goto(BASE + (pos[0].startsWith('/') ? pos[0] : '/' + pos[0]), { waitUntil: 'networkidle' }).catch(() => null)
    const res = { ok: true, url: page.url(), status: r?.status(), title: await page.title() }
    await browser.close()
    return res
  },
}

COMMANDS.screenshot = {
  summary: 'Save a PNG of the current page into the evidence dir.',
  help: 'control-thebox screenshot [--name <label>] [--full-page]\n\nWrites <evidence>/<timestamp>_<label>.png and prints its path.',
  async run(flags) {
    const { browser, page, state } = await connect()
    const file = shotPath(state, flags.name)
    await page.screenshot({ path: file, fullPage: !!flags['full-page'] })
    const url = page.url()
    await browser.close()
    return { ok: true, file, url }
  },
}

COMMANDS.snapshot = {
  summary: 'ARIA snapshot of the current page (what a screen reader / agent sees).',
  help: 'control-thebox snapshot [--name <label>] [--selector <css>]\n\nPrints the ARIA tree (YAML) of body or --selector (a CSS selector such as `header` or `main`, not an ARIA role; fails after 5 s when nothing matches), and saves it as <evidence>/<ts>_<label>.aria.yml.',
  async run(flags) {
    const { browser, page, state } = await connect()
    const yml = await page.locator(flags.selector || 'body').first().ariaSnapshot({ timeout: 5000 })
      .catch(async () => { await browser.close(); fail(`No element matches the CSS selector "${flags.selector || 'body'}".`, '--selector takes CSS, not an ARIA role: use `header`, `main` or `nav`, or omit it for the whole page.') })
    const file = shotPath(state, (flags.name || 'snapshot')).replace(/\.png$/, '.aria.yml')
    fs.writeFileSync(file, yml)
    const url = page.url()
    await browser.close()
    return { ok: true, url, file, aria: yml }
  },
}

COMMANDS.click = {
  summary: 'Click by role+name (preferred), label, or text.',
  help: 'control-thebox click (--role <role> --name <regex> | --text <regex> | --label <regex>) [--dry-run]\n\nExample: control-thebox click --role button --name "^Skip$"',
  async run(flags) {
    const { browser, page } = await connect()
    const loc = flags.role ? page.getByRole(flags.role, { name: new RegExp(flags.name || '.', 'i') })
      : flags.label ? page.getByLabel(new RegExp(flags.label, 'i'))
      : flags.text ? page.getByText(new RegExp(flags.text, 'i')) : null
    if (!loc) { await browser.close(); fail('No locator given.', 'Pass --role button --name "Skip" (preferred), --label or --text.') }
    const count = await loc.count()
    if (count === 0) { await browser.close(); fail('Locator matched nothing.', 'Run `control-thebox snapshot` and copy the role/name from the ARIA tree.') }
    if (flags['dry-run']) { await browser.close(); return { ok: true, dryRun: true, matches: count } }
    await loc.first().click()
    await sleep(500)
    const url = page.url()
    await browser.close()
    return { ok: true, matches: count, url }
  },
}

COMMANDS.key = {
  summary: 'Press a key on the focused element (Enter, Escape, Tab...).',
  help: 'control-thebox key <Key>\n\nExample: control-thebox key Escape',
  async run(_f, pos) {
    if (!pos[0]) fail('Missing key.', 'Example: control-thebox key Enter')
    const { browser, page } = await connect()
    await page.keyboard.press(pos[0])
    await browser.close()
    return { ok: true, key: pos[0] }
  },
}

// ---------- passkeys ----------
// A CDP virtual authenticator lives only as long as the CDP session that
// created it, and every CLI call opens and closes its own session. So each
// passkey command creates the authenticator, does its flow, then exports the
// credentials (fake, throwaway keys) to .verify-run/passkey-credentials.json;
// `passkey signin` imports them into a fresh authenticator.
const PASSKEY_FILE = path.join(RUN_DIR, 'passkey-credentials.json')
const AUTHENTICATOR = { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }

async function virtualAuthenticator(ctx, page) {
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('WebAuthn.enable', { enableUI: false })
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: AUTHENTICATOR })
  return { cdp, authenticatorId }
}
function passkeyRows(email) {
  return psqlJson(`select p.id, p.name, p."credentialID" as "credentialId", p.counter, p."deviceType", p."backedUp", p."createdAt" from passkey p join "user" u on u.id = p."userId" where u.email = '${email.replace(/'/g, "''")}' order by p."createdAt"`)
}
async function isLoggedIn(page) {
  const r = await page.evaluate(() => fetch('/api/auth/get-session', { credentials: 'include' }).then((x) => x.json()).catch(() => null))
  return r?.user ? r.user.email : null
}
async function logoutThroughMenu(page) {
  // Same path as a player: user menu in the header → "Logout".
  await page.goto(`${BASE}/en`, { waitUntil: 'networkidle' })
  await dismissModals(page)
  const email = await isLoggedIn(page)
  if (!email) return null
  const username = email.split('@')[0]
  await page.getByRole('button', { name: new RegExp(`^${username}$`, 'i') }).first().click()
  await page.getByRole('menuitem', { name: /^logout$/i }).click()
  await waitFor(async () => !(await isLoggedIn(page)), { timeoutMs: 10000, label: 'logout' })
  return email
}

COMMANDS.passkey = {
  summary: 'Passkeys through a CDP virtual authenticator: passkey add | passkey signin | passkey list.',
  help: `control-thebox passkey add [--name <device name>] [--dry-run]
control-thebox passkey signin [--dry-run]
control-thebox passkey list

Headless Chromium has no authenticator; this attaches a CDP virtual one
(WebAuthn.addVirtualAuthenticator: ctap2, internal, resident key, user verified).

add     Logged-in user (run \`login\` first). Opens /en/profile?tab=security, clicks
        "Add a passkey", types the name (default "Verify virtual key"), clicks Continue,
        waits for the "Passkey registered." toast, then reads the passkey row back from the
        DB. Exports the authenticator's credentials to .verify-run/passkey-credentials.json.
        Side effect: one passkey row for the fake user.
signin  Logs out through the user menu if a session exists, opens /en/login, imports the
        saved credentials into a fresh authenticator, clicks "Sign in with a passkey", and
        checks that the page left /login and /api/auth/get-session names the user.
        Side effect: a new session row; the credential's sign counter goes up.
list    Read-only: saved credential ids and the passkey rows in the DB.
--dry-run   add/signin: report the steps and preconditions without touching the browser.`,
  async run(flags, pos) {
    const sub = pos[0]
    const state = requireState()
    if (sub === 'list') {
      const saved = fs.existsSync(PASSKEY_FILE) ? JSON.parse(fs.readFileSync(PASSKEY_FILE, 'utf8')) : null
      return { ok: true, saved: saved && { email: saved.email, credentialIds: saved.credentials.map((c) => c.credentialId) }, dbRows: psqlJson(`select p.name, u.email, p."credentialID" as "credentialId", p.counter from passkey p join "user" u on u.id = p."userId" order by p."createdAt"`) }
    }
    if (sub === 'add') {
      const name = typeof flags.name === 'string' ? flags.name : 'Verify virtual key'
      if (flags['dry-run']) return { ok: true, dryRun: true, steps: ['virtual authenticator', 'goto /en/profile?tab=security', 'click "Add a passkey"', `fill "${name}"`, 'click "Continue"', 'wait for "Passkey registered."', 'read passkey rows', `export to ${PASSKEY_FILE}`] }
      const { browser, ctx, page } = await connect()
      try {
        const { cdp, authenticatorId } = await virtualAuthenticator(ctx, page)
        await page.goto(`${BASE}/en/profile?tab=security`, { waitUntil: 'networkidle' })
        await dismissModals(page)
        const email = await isLoggedIn(page)
        if (!email) fail('Not logged in.', 'Run `control-thebox login` first; adding a passkey needs a session.')
        const before = passkeyRows(email).length
        await page.getByRole('button', { name: /^add a passkey$/i }).first().click()
        const dialog = page.getByRole('dialog')
        await dialog.getByLabel(/device name/i).fill(name)
        await page.screenshot({ path: shotPath(state, 'passkey-add-dialog') })
        const verify = page.waitForResponse((r) => r.url().includes('/api/auth/passkey/verify-registration'), { timeout: 15000 }).catch(() => null)
        await dialog.getByRole('button', { name: /^continue$/i }).click()
        const vr = await verify
        const toast = await page.getByText(/^passkey registered\.?$/i).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
        const file = shotPath(state, 'passkey-added')
        await page.screenshot({ path: file })
        const rows = passkeyRows(email)
        const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId })
        fs.writeFileSync(PASSKEY_FILE, JSON.stringify({ email, credentials }, null, 2))
        const ok = vr?.status() === 200 && toast && rows.length === before + 1
        if (!ok) process.exitCode = 1
        return { ok, account: email, verifyRegistrationStatus: vr?.status() ?? null, toastShown: toast, dbRowsBefore: before, dbRows: rows, authenticatorCredentials: credentials.map((c) => ({ credentialId: c.credentialId, rpId: c.rpId, isResidentCredential: c.isResidentCredential, signCount: c.signCount })), file, ...(ok ? {} : { fix: 'Check `control-thebox network-log --filter /api/auth/passkey` and `control-thebox console --level error`; rpID must be the hostname of API_URL.' }) }
      } finally {
        await browser.close()
      }
    }
    if (sub === 'signin') {
      if (!fs.existsSync(PASSKEY_FILE)) fail('No saved passkey credentials.', 'Run `control-thebox login` then `control-thebox passkey add` first.')
      const saved = JSON.parse(fs.readFileSync(PASSKEY_FILE, 'utf8'))
      if (flags['dry-run']) return { ok: true, dryRun: true, account: saved.email, credentials: saved.credentials.length, steps: ['logout through the user menu if logged in', 'goto /en/login', 'virtual authenticator + import credentials', 'click "Sign in with a passkey"', 'check /api/auth/get-session'] }
      const { browser, ctx, page } = await connect()
      try {
        const loggedOut = await logoutThroughMenu(page)
        await page.goto(`${BASE}/en/login`, { waitUntil: 'networkidle' })
        const { cdp, authenticatorId } = await virtualAuthenticator(ctx, page)
        for (const c of saved.credentials) await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: c })
        const counterBefore = passkeyRows(saved.email).map((r) => r.counter)
        await page.screenshot({ path: shotPath(state, 'passkey-signin-before') })
        const verify = page.waitForResponse((r) => r.url().includes('/api/auth/passkey/verify-authentication'), { timeout: 15000 }).catch(() => null)
        await page.getByRole('button', { name: /^sign in with a passkey$/i }).click()
        const vr = await verify
        await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 }).catch(() => {})
        // The URL changes before the login card unmounts; wait for it so the screenshot shows the landing page.
        await page.getByRole('button', { name: /^sign in with a passkey$/i }).waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
        await page.waitForLoadState('networkidle').catch(() => {})
        await dismissModals(page)
        const sessionEmail = await isLoggedIn(page)
        const file = shotPath(state, 'passkey-signin-after')
        await page.screenshot({ path: file })
        const counterAfter = passkeyRows(saved.email).map((r) => r.counter)
        // The server rejects a sign counter that does not increase (cloned-authenticator check),
        // so save the bumped counter for the next signin.
        const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId })
        fs.writeFileSync(PASSKEY_FILE, JSON.stringify({ email: saved.email, credentials }, null, 2))
        const url = page.url()
        const ok = vr?.status() === 200 && sessionEmail === saved.email && !url.includes('/login')
        if (!ok) process.exitCode = 1
        return { ok, loggedOutFirst: loggedOut, verifyAuthenticationStatus: vr?.status() ?? null, sessionEmail, url, dbCounterBefore: counterBefore, dbCounterAfter: counterAfter, file, ...(ok ? {} : { fix: 'Check `control-thebox network-log --filter /api/auth/passkey` and `control-thebox console --level error`.' }) }
      } finally {
        await browser.close()
      }
    }
    fail(`Unknown passkey subcommand "${sub ?? ''}".`, 'Use `passkey add`, `passkey signin` or `passkey list` (see `control-thebox passkey --help`).')
  },
}

const ORACLE_SQL =`select ts.position, g.name from daily_challenges dc join tiers t on t.daily_challenge_id = dc.id join tier_screenshots ts on ts.tier_id = t.id join screenshots s on s.id = ts.screenshot_id join games g on g.id = s.game_id where dc.challenge_date = current_date and t.tier_number = 1 order by ts.position`
const WRONG_ANSWER = 'Definitely Not A Game'

function pickAnswer(flags, position) {
  if (flags.answer) return flags.answer
  if (flags.wrong) return WRONG_ANSWER
  const rows = psqlJson(ORACLE_SQL)
  const answer = rows.find((r) => r.position === position)?.name
  if (!answer) fail(`No oracle answer for position ${position}.`, 'Run `control-thebox doctor` (todayChallenge) and `control-thebox snapshot` to check the current position.', { rows })
  return answer
}

// Opens /en/play and returns the guess input, or a dry-run report when the
// intro is showing (clicking Start inserts a game_sessions row).
async function openPlay(page, flags) {
  await page.goto(`${BASE}/en/play`, { waitUntil: 'networkidle' })
  if (page.url().includes('/login')) fail('Not logged in: /en/play redirected to login.', 'Run `control-thebox login` first.')
  await dismissModals(page)
  const start = page.getByRole('button', { name: /^(start|play|commencer|jouer)/i }).first()
  if (await start.isVisible().catch(() => false)) {
    if (flags['dry-run']) return { dryRun: { ok: true, dryRun: true, wouldClickStart: true, position: 1, answer: pickAnswer(flags, 1) } }
    await start.click()
    await sleep(2000)
    await dismissModals(page)
  }
  const input = page.getByRole('textbox', { name: /game name|nom du jeu/i }).or(page.getByPlaceholder(/game name/i)).first()
  await input.waitFor({ timeout: 15000 }).catch(() => fail('Guess input not visible on /en/play.', 'Take `control-thebox screenshot --name play-state`; today\'s session may already be finished (relaunch for a fresh DB).'))
  return { input }
}

async function currentPosition(page) {
  const text = await page.locator('[aria-current="true"]').first().textContent().catch(() => '')
  return parseInt(text || '0', 10) || null
}

// Reloading /en/play while a result card was pending resumes on the already
// solved position with an enabled input (submitting there returns 409
// POSITION_ALREADY_SOLVED). Do what a player would: leave the card, then pick
// the next open dot. Returns a note when it had to move.
async function ensureOpenPosition(page) {
  const next = page.getByRole('button', { name: /next round|manche suivante/i }).first()
  if (await next.isVisible().catch(() => false)) { await next.click().catch(() => {}); await sleep(800) }
  const label = (await page.locator('[aria-current="true"]').first().getAttribute('aria-label').catch(() => '')) || ''
  if (!/:\s*correct/i.test(label)) return null
  const open = page.getByRole('group', { name: /screenshot progress/i }).getByRole('button', { name: /not visited|in progress/i }).first()
  if (!(await open.isVisible().catch(() => false))) return { resumedOnSolved: label, moved: false }
  await open.click()
  await sleep(1000)
  return { resumedOnSolved: label, moved: true }
}

async function guessOnce(page, state, input, flags) {
  const resumeNote = await ensureOpenPosition(page)
  // The input is disabled while the carousel moves to the next position.
  const enabledIn = await waitFor(() => input.isEnabled(), { timeoutMs: 15000, label: 'the guess input to become enabled (position timed out or game finished?)' })
  const position = await currentPosition(page)
  const answer = pickAnswer(flags, position)
  const before = shotPath(state, `play-before-pos${position}`)
  await page.screenshot({ path: before })
  await input.fill(answer)
  const respP = page.waitForResponse((r) => r.url().includes('/api/game/guess') && r.request().method() === 'POST', { timeout: 15000 })
  await page.getByRole('button', { name: /submit guess|valider la proposition/i }).first().click()
  const resp = await respP
  const body = await resp.json().catch(() => null)
  await sleep(1500)
  const after = shotPath(state, `play-after-pos${position}`)
  await page.screenshot({ path: after })
  const persisted = psqlJson(`select g.id, g.position, g.guessed_text, g.is_correct, g.score_earned, g.created_at from guesses g join tier_sessions ts on ts.id = g.tier_session_id join game_sessions gs on gs.id = ts.game_session_id join "user" u on u.id = gs.user_id where u.email = 'e2e_user@test.local' order by g.id desc limit 1`)
  const result = { ok: resp.ok(), position, answer, inputWaitMs: enabledIn, ...(resumeNote ? { resumeNote } : {}), response: { status: resp.status(), body }, persistedGuess: persisted[0] || null, evidence: { before, after } }
  fs.writeFileSync(after.replace(/\.png$/, '.json'), JSON.stringify(result, null, 2))
  return result
}

COMMANDS.play = {
  summary: 'Daily game: submit one guess (play guess) or play to completion (play finish) through the real UI.',
  help: `control-thebox play guess (--correct | --wrong | --answer <text>) [--dry-run]
control-thebox play finish [--dry-run]

Drives the classic daily game as the logged-in user (run \`login\` first):
  1. goto /en/play, click Start/Play if the intro shows, dismiss modals
  2. read the current position from the progress dot with aria-current="true"
  3. --correct looks up the true game name for that position in the throwaway DB
     (test oracle only; the guess itself goes through the UI); --wrong types "${WRONG_ANSWER}"
  4. fill the "Game name..." input, click "Submit guess", capture the POST /api/game/guess response
  5. screenshot before + after (plus a .json next to the after shot), read back the persisted guesses row
finish repeats a correct guess until the API answers isCompleted=true (max 10), then reads the
game_sessions row. Needed before the leaderboard can show the player (it lists completed sessions only).
--dry-run   report position + answer without submitting; never clicks Start (that inserts a session).`,
  async run(flags, pos) {
    const action = pos[0]
    if (action !== 'guess' && action !== 'finish') fail('Unknown play action.', 'Use: control-thebox play guess --correct, or control-thebox play finish')
    if (action === 'guess' && !flags.correct && !flags.wrong && !flags.answer) fail('Say which guess to make.', 'Pass --correct, --wrong or --answer "<text>".')
    const guessFlags = action === 'finish' ? { correct: true } : flags
    const { browser, page, state } = await connect()
    try {
      const opened = await openPlay(page, { ...guessFlags, 'dry-run': flags['dry-run'] })
      if (opened.dryRun) return opened.dryRun
      if (flags['dry-run']) {
        const position = await currentPosition(page)
        return { ok: true, dryRun: true, position, answer: pickAnswer(guessFlags, position) }
      }
      if (action === 'guess') {
        const result = await guessOnce(page, state, opened.input, guessFlags)
        if (!result.ok) process.exitCode = 1
        return result
      }
      const steps = []
      for (let i = 0; i < 10; i++) {
        const r = await guessOnce(page, state, opened.input, guessFlags)
        steps.push({ position: r.position, status: r.response.status, isCorrect: r.response.body?.data?.isCorrect, totalScore: r.response.body?.data?.totalScore })
        if (!r.ok) fail(`Guess at position ${r.position} failed with HTTP ${r.response.status}.`, 'Run `control-thebox network-log --filter /api/game --status-min 400` and read the backend log.', { steps, response: r.response })
        if (r.response.body?.data?.isCompleted) break
        // A correct guess opens the result card ("Next Round (4s)", auto-advances); click it like a player.
        const next = page.getByRole('button', { name: /next round|manche suivante/i }).first()
        if (await next.isVisible().catch(() => false)) await next.click().catch(() => {})
        await sleep(800)
      }
      await sleep(2000)
      await dismissModals(page)
      const file = shotPath(state, 'play-finished')
      await page.screenshot({ path: file, fullPage: true })
      const session = psqlJson(`select gs.id, gs.is_completed, gs.total_score, gs.completed_at from game_sessions gs join "user" u on u.id = gs.user_id where u.email = 'e2e_user@test.local' order by gs.started_at desc limit 1`)[0] || null
      const result = { ok: !!session?.is_completed, steps, session, finalUrl: page.url(), file }
      if (!result.ok) process.exitCode = 1
      return result
    } finally {
      await browser.close()
    }
  },
}

COMMANDS.leaderboard = {
  summary: "Open /en/leaderboard, screenshot it, and compare with GET /api/leaderboard/today.",
  help: `control-thebox leaderboard [--name <label>]

Navigates the shared page to /en/leaderboard, screenshots it, fetches /api/leaderboard/today
through the same origin, and reports whether every API username is visible on the page.
The leaderboard is REST-only today (no socket.io push; see features/leaderboard.md).`,
  async run(flags) {
    const { browser, page, state } = await connect()
    try {
      await page.goto(`${BASE}/en/leaderboard`, { waitUntil: 'networkidle' })
      await sleep(1000)
      await dismissModals(page)
      const api = await page.evaluate(async () => { const r = await fetch('/api/leaderboard/today'); return { status: r.status, body: await r.json() } })
      const entries = api.body?.data?.entries || api.body?.data?.leaderboard || api.body?.data || []
      const text = await page.locator('main').innerText().catch(() => '')
      const names = (Array.isArray(entries) ? entries : []).map((e) => e.username || e.displayName || e.display_name).filter(Boolean)
      const file = shotPath(state, flags.name || 'leaderboard')
      await page.screenshot({ path: file, fullPage: true })
      return { ok: api.status === 200, api: { status: api.status, entries: names.length, sample: (Array.isArray(entries) ? entries : []).slice(0, 5) }, visibleOnPage: Object.fromEntries(names.map((n) => [n, text.includes(n)])), file }
    } finally {
      await browser.close()
    }
  },
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
}
COMMANDS.console = {
  summary: 'Browser console messages recorded by the daemon (all pages, since launch).',
  help: 'control-thebox console [--level error|warning|log] [--last N] [--grep <regex>]\n\nReads .verify-run/console.jsonl (copied into evidence on teardown).',
  async run(flags) {
    requireState()
    let rows = readJsonl(path.join(RUN_DIR, 'console.jsonl'))
    if (flags.level) rows = rows.filter((r) => r.type === flags.level)
    if (flags.grep) rows = rows.filter((r) => new RegExp(flags.grep, 'i').test(r.text))
    const last = parseInt(flags.last || '50', 10)
    return { ok: true, total: rows.length, messages: rows.slice(-last) }
  },
}
COMMANDS['network-log'] = {
  summary: 'HTTP requests recorded by the daemon (method, url, status, timing).',
  help: 'control-thebox network-log [--filter <substring>] [--status-min 400] [--last N]\n\nReads .verify-run/network.jsonl. Example: control-thebox network-log --filter /api/ --status-min 400',
  async run(flags) {
    requireState()
    let rows = readJsonl(path.join(RUN_DIR, 'network.jsonl'))
    if (flags.filter) rows = rows.filter((r) => r.url.includes(flags.filter))
    if (flags['status-min']) rows = rows.filter((r) => (r.status || 0) >= parseInt(flags['status-min'], 10))
    const last = parseInt(flags.last || '50', 10)
    return { ok: true, total: rows.length, requests: rows.slice(-last) }
  },
}

// Internal: the long-lived browser owner, spawned by launch.
async function browserd() {
  const { chromium } = loadPlaywright()
  const consentFile = path.join(REPO, 'packages', 'frontend', 'e2e', 'consent-storage-state.json')
  const consent = JSON.parse(fs.readFileSync(consentFile, 'utf8')).origins[0].localStorage[0]
  const ctx = await chromium.launchPersistentContext(path.join(RUN_DIR, 'browser-profile'), {
    headless: true,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    args: [`--remote-debugging-port=${PORTS.cdp}`],
  })
  // Same GDPR-consent pre-seed the repo's Playwright config uses, so the banner never covers the UI.
  await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v) } catch {} }, [consent.name, consent.value])
  const con = fs.createWriteStream(path.join(RUN_DIR, 'console.jsonl'), { flags: 'a' })
  const netw = fs.createWriteStream(path.join(RUN_DIR, 'network.jsonl'), { flags: 'a' })
  const attach = (page) => {
    page.on('console', (m) => con.write(JSON.stringify({ ts: new Date().toISOString(), type: m.type(), text: m.text(), url: page.url() }) + '\n'))
    page.on('pageerror', (e) => con.write(JSON.stringify({ ts: new Date().toISOString(), type: 'pageerror', text: e.message, url: page.url() }) + '\n'))
    page.on('requestfinished', async (req) => {
      const res = await req.response().catch(() => null)
      netw.write(JSON.stringify({ ts: new Date().toISOString(), method: req.method(), url: req.url(), status: res?.status() ?? null, ms: Math.round(req.timing().responseEnd) }) + '\n')
    })
    page.on('requestfailed', (req) => netw.write(JSON.stringify({ ts: new Date().toISOString(), method: req.method(), url: req.url(), status: null, failure: req.failure()?.errorText }) + '\n'))
    // socket.io runs over WebSocket (/notifications achievement toasts, admin jobs, panorama party):
    // log the upgrade and each frame (truncated) so `network-log --filter socket.io` can prove pushes.
    page.on('websocket', (ws) => {
      const log = (dir, payload) => netw.write(JSON.stringify({ ts: new Date().toISOString(), method: 'WS', dir, url: ws.url(), status: 101, frame: String(payload).slice(0, 300) }) + '\n')
      log('open', '')
      ws.on('framereceived', (f) => log('in', f.payload))
      ws.on('framesent', (f) => log('out', f.payload))
    })
  }
  ctx.pages().forEach(attach)
  ctx.on('page', attach)
  if (!ctx.pages().length) await ctx.newPage()
  const stop = async () => { await ctx.close().catch(() => {}); process.exit(0) }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  setInterval(() => {}, 1 << 30)
}

function usage() {
  const lines = Object.entries(COMMANDS).map(([k, c]) => `  ${k.padEnd(12)} ${c.summary}`)
  return `control-thebox — drive a throwaway local The Box instance like a player.

Usage: control-thebox <command> [flags]      (JSON on stdout; exit 1 on failure)

Health:       doctor, info, teardown
Lifecycle:    launch
Navigation:   goto, login
Interaction:  click, key, play guess, passkey
Inspection:   screenshot, snapshot, leaderboard
Streaming:    console, network-log

${lines.join('\n')}

Typical run:
  control-thebox launch && control-thebox doctor
  control-thebox login && control-thebox play guess --correct
  control-thebox leaderboard && control-thebox teardown

Evidence goes to ${EVIDENCE_ROOT}/<runId>/ and survives teardown.
\`control-thebox <command> --help\` for details. Commands with side effects accept --dry-run.`
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === '__browserd') return browserd()
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') { process.stdout.write(usage() + '\n'); return }
  const c = COMMANDS[cmd]
  if (!c) {
    out({ ok: false, error: `Unknown command "${cmd}".`, fix: `Run \`control-thebox --help\`. Commands: ${Object.keys(COMMANDS).join(', ')}` })
    process.exitCode = 1
    return
  }
  const { pos, flags } = parseArgs(rest)
  if (flags.help || flags.h) { process.stdout.write(c.help + '\n'); return }
  try {
    out(await c.run(flags, pos))
  } catch (e) {
    out({ ok: false, command: cmd, error: e.message, fix: e.fix || 'Run `control-thebox doctor` and read .verify-run/logs/.', ...(e.extra || {}) })
    // A command that failed after connect() still holds its CDP connection open; exit
    // once stdout is flushed so the CLI never hangs (the browser daemon keeps running).
    process.stdout.write('', () => process.exit(1))
  }
}
main()
