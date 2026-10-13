import type { InvoiceContent } from './index.js';

/** Subject and text of the email an invoice is sent with. `{number}` is filled in on sending. */
export interface InvoiceEmailText {
  emailSubject: string;
  emailBody: string;
}

/** The values the template placeholders are replaced with when the text is built. */
export type EmailTextValues = Pick<InvoiceContent, 'emailSalutation' | 'name' | 'title' | 'email'>;

export const MAX_EMAIL_SUBJECT_LENGTH = 200;
export const MAX_EMAIL_BODY_LENGTH = 10_000;
