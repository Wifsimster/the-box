import type { DomainLogger } from './logger.js'

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
