import { Request, Response, NextFunction, RequestHandler } from 'express'
import { ZodError, ZodType } from 'zod'

type Source = 'body' | 'query' | 'params'

function buildValidator(source: Source): <T>(schema: ZodType<T>) => RequestHandler {
  return (schema) => (req, res, next) => {
    const result = schema.safeParse(req[source])
    if (!result.success) {
      const issue = result.error.issues[0]
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: issue?.message ?? 'Invalid request payload',
          path: issue?.path,
        },
      })
      return
    }
    // Replace the raw input with the parsed (coerced) data so downstream
    // handlers consume the typed value.
    ;(req as unknown as Record<Source, unknown>)[source] = result.data
    next()
  }
}

export const validateBody = buildValidator('body')
export const validateQuery = buildValidator('query')
export const validateParams = buildValidator('params')

export function zodErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (error instanceof ZodError) {
    const issue = error.issues[0]
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: issue?.message ?? 'Invalid request payload',
        path: issue?.path,
      },
    })
    return
  }
  next(error)
}
