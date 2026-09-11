import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { ProfileError, validationError } from '../../../shared/schemas/errors.js';

export function errorHandler(err: Error, _req: Request, res: Response, next: NextFunction) {
  console.error('[server] Error:', err.message);
  // If the response already started (e.g. an SSE stream), we can't send a JSON body —
  // hand off to Express's default handler so it tears down the connection.
  if (res.headersSent) return next(err);
  const structured = err instanceof ZodError ? validationError(err) : err;
  if (structured instanceof ProfileError) {
    const { code, message, issues, retryable, status } = structured;
    return res.status(status).json({ error: message, code, message, issues, retryable, requestId: randomUUID() });
  }
  // err.message can embed absolute paths / internal detail (fs, ollama client).
  // Log it server-side but return a generic message to clients in production.
  const message =
    process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Internal server error';
  res.status(500).json({ error: message, code: 'INTERNAL_ERROR', message, retryable: true, requestId: randomUUID() });
}
