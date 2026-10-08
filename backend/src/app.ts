import express from 'express';
import { errorHandler } from './errorHandler.js';
import { e2eResetEnabled, e2eResetRouter } from './routes/e2eReset.js';
import { router } from './routes/index.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  if (e2eResetEnabled()) app.use('/api/e2e', e2eResetRouter);
  app.use('/api', router);
  app.use(errorHandler);
  return app;
}
