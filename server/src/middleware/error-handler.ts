import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, next: NextFunction) {
  console.error('[server] Error:', err.message);
  // If the response already started (e.g. an SSE stream), we can't send a JSON body —
  // hand off to Express's default handler so it tears down the connection.
  if (res.headersSent) return next(err);
  // err.message can embed absolute paths / internal detail (fs, ollama client).
  // Log it server-side but return a generic message to clients in production.
  const message =
    process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Internal server error';
  res.status(500).json({ error: message });
}
