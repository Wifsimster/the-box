export interface LogFn {
  (msg: string): void
  (obj: object, msg?: string): void
}

export interface LogWriter {
  info: LogFn
  warn: LogFn
  error: LogFn
  debug: LogFn
}

export interface DomainLogger extends LogWriter {
  child(bindings: Record<string, unknown>): DomainLogger
}
