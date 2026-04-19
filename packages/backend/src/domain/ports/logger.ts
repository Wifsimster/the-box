/**
 * Domain-facing logger port.
 *
 * Describes the minimal surface that domain services rely on. Matches
 * the pino API so the infrastructure logger is directly assignable.
 */
export interface DomainLogger {
  info(msg: string): void
  info(obj: object, msg?: string): void
  warn(msg: string): void
  warn(obj: object, msg?: string): void
  error(msg: string): void
  error(obj: object, msg?: string): void
  debug(msg: string): void
  debug(obj: object, msg?: string): void
  fatal(msg: string): void
  fatal(obj: object, msg?: string): void
  trace(msg: string): void
  trace(obj: object, msg?: string): void
  child(bindings: Record<string, unknown>): DomainLogger
}
