import { Router } from 'express';
import { donationReceiptRouter } from './donationReceipt.js';
import { donorRouter } from './donor.js';
import { emailSettingsRouter } from './emailSettings.js';
import { instructorRouter } from './instructor.js';
import { invoiceRouter } from './invoice.js';
import { invoiceDraftRouter } from './invoiceDraft.js';
import { invoicePaymentRouter } from './invoicePayment.js';
import { invoiceRecipientRouter } from './invoiceRecipient.js';
import { settingsRouter } from './settings.js';
import { templatesRouter } from './templates.js';

export const router = Router();

router.use('/donation-receipt', donationReceiptRouter);
router.use('/invoice', invoiceRouter);
router.use('/invoice-draft', invoiceDraftRouter);
router.use('/invoice-payment', invoicePaymentRouter);
router.use('/invoice-recipient', invoiceRecipientRouter);
router.use('/instructor', instructorRouter);
router.use('/donor', donorRouter);
router.use('/settings', settingsRouter);
router.use('/email-settings', emailSettingsRouter);
router.use('/templates', templatesRouter);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
