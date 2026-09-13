/**
 * Shared logger test double.
 *
 * Before the `DomainLogger` port was segregated, fourteen test files each
 * hand-rolled a seven-method fake, two of whose methods (`trace`, `fatal`)
 * no production code ever calls. One helper now covers all of them.
 */
import type { DomainLogger } from './logger.js'

/** A logger that swallows everything. Use when output is irrelevant. */
export const silentLogger: DomainLogger = {
  child: () => silentLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

export interface RecordedLog {
  level: 'debug' | 'info' | 'warn' | 'error'
  args: unknown[]
}

/**
 * A logger that records what was written, for the rare test that asserts on
 * a log line. `child()` returns a logger writing into the same buffer, so a
 * service's scoped logger is captured too.
 */
export function createRecordingLogger(): DomainLogger & { records: RecordedLog[] } {
  const records: RecordedLog[] = []
  const write =
    (level: RecordedLog['level']) =>
    (...args: unknown[]) => {
      records.push({ level, args })
    }

  const logger: DomainLogger & { records: RecordedLog[] } = {
    records,
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    child: () => logger,
  }
  return logger
}
