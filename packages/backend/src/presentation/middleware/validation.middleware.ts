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
    // handlers consume the typed value. Express 5 exposes `req.query` (and on
    // some setups `req.params`) as getter-only accessors on the prototype, so
    // a plain assignment throws "Cannot set property query ... which has only
    // a getter". Define an own data property instead — it shadows the getter
    // and lets downstream `req[source]` reads see the coerced value.
    Object.defineProperty(req, source, {
      value: result.data,
      writable: true,
      enumerable: true,
      configurable: true,
    })
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
