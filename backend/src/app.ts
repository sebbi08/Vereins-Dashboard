import express from 'express';
import { errorHandler } from './errorHandler.js';
import { e2eResetEnabled, e2eResetRouter } from './routes/e2eReset.js';
import { router } from './routes/index.js';
import { sameOriginGuard } from './sameOriginGuard.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    // No framing by other sites (clickjacking on "Send" or "Cancel"); no MIME sniffing.
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(sameOriginGuard);
  // A year of bank bookings exceeds the default 100 kB; a parsed body is skipped by the next parser
  app.use('/api/invoice-payment/match', express.json({ limit: '2mb' }));
  app.use(express.json());
  if (e2eResetEnabled()) app.use('/api/e2e', e2eResetRouter);
  app.use('/api', router);
  app.use(errorHandler);
  return app;
}
