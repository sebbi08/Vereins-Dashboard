import type { ErrorRequestHandler } from 'express';
import { Prisma } from '../prisma/generated/client.js';

interface HttpLikeError {
  status?: number;
  statusCode?: number;
  expose?: boolean;
  type?: string;
  message?: string;
}

/**
 * Final error handler for every route. Express 5 forwards rejected handler
 * promises here, so a thrown error answers the request instead of killing the
 * process. Prisma "record not found" becomes 404, client errors such as invalid
 * JSON keep their status, and everything else is logged and answered with a
 * generic 500 that leaks no internals.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const http = err as HttpLikeError;
  const status = http.status ?? http.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const message =
      http.type === 'entity.parse.failed'
        ? 'Invalid JSON body'
        : http.expose && http.message
          ? http.message
          : 'Bad request';
    res.status(status).json({ error: message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
