import { Router } from 'express';
import { einstellungenRouter } from './einstellungen.js';
import { rechnungRouter } from './rechnung.js';
import { spendenQuittungRouter } from './spendenQuittung.js';
import { spenderRouter } from './spender.js';
import { vorlagenRouter } from './vorlagen.js';

export const router = Router();

router.use('/spenden-quittung', spendenQuittungRouter);
router.use('/rechnung', rechnungRouter);
router.use('/spender', spenderRouter);
router.use('/einstellungen', einstellungenRouter);
router.use('/vorlagen', vorlagenRouter);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
