/**
 * Domain-facing logger ports.
 *
 * Segregated deliberately (ISP): a service should depend on the smallest
 * logging surface it actually calls, and a test double should only have to
 * implement that surface.
 *
 * `trace` and `fatal` are intentionally absent — no domain service writes at
 * those levels. Pino still satisfies these interfaces structurally (extra
 * members are fine), so the infrastructure logger remains directly
 * assignable; dropping them only shrinks what a fake must provide.
 */

/** Pino-compatible level signature: bare message, or bindings + message. */
export interface LogFn {
  (msg: string): void
  (obj: object, msg?: string): void
}

/**
 * The four levels domain code actually writes at. Depend on this when a
 * service only ever logs — a test double is then four no-op functions.
 */
export interface LogWriter {
  info: LogFn
  warn: LogFn
  error: LogFn
  debug: LogFn
}

/**
 * A `LogWriter` that can also derive a bound child logger. Depend on this
 * only when the service actually calls `.child()` to tag its own scope.
 */
export interface DomainLogger extends LogWriter {
  child(bindings: Record<string, unknown>): DomainLogger
}
