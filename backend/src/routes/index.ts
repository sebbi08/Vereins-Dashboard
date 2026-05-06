import { Router } from 'express';
import { einstellungenRouter } from './einstellungen';
import { rechnungRouter } from './rechnung';
import { spendenQuittungRouter } from './spendenQuittung';
import { spenderRouter } from './spender';
import { vorlagenRouter } from './vorlagen';

export const router = Router();

router.use('/spenden-quittung', spendenQuittungRouter);
router.use('/rechnung', rechnungRouter);
router.use('/spender', spenderRouter);
router.use('/einstellungen', einstellungenRouter);
router.use('/vorlagen', vorlagenRouter);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
