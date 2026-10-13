import type { EmailTextValues, InvoiceEmailText } from 'shared';
import {
  MAX_EMAIL_BODY_LENGTH,
  MAX_EMAIL_SUBJECT_LENGTH,
} from '../../../shared/src/invoiceEmailText.js';

export const DEFAULT_EMAIL_SUBJECT = 'Ihre Rechnung {number}';
export const DEFAULT_EMAIL_BODY =
  '{salutation}\n\nanbei erhalten Sie Ihre Rechnung {number}.\n\nMit freundlichen Grüßen';

export type SettingRow = { key: string; value: string };

/** Text columns of an invoice or draft; null means nothing is stored yet. Always select both. */
export interface StoredEmailText {
  emailSubject: string | null;
  emailBody: string | null;
}

function template(settings: SettingRow[], key: string, fallback: string): string {
  return settings.find((row) => row.key === key)?.value || fallback;
}

/**
 * Subject and text for one invoice or draft, built from the templates in the email settings.
 * Every placeholder is filled in with today's values except `{number}`: a draft has no number
 * yet, so it is filled in when the email is sent. The subject always fits one line.
 */
export function buildInvoiceEmailText(
  settings: SettingRow[],
  values: EmailTextValues,
): InvoiceEmailText {
  const replacements: Record<string, string> = {
    salutation: values.emailSalutation,
    name: values.name,
    title: values.title,
    email: values.email,
  };
  // One pass with a function: a value is never read as a placeholder or a "$&" pattern
  const fill = (text: string) =>
    text.replace(/\{(salutation|name|title|email)\}/g, (_match, key: string) => replacements[key]);

  const subject = fill(template(settings, 'emailSubject', DEFAULT_EMAIL_SUBJECT))
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim()
    .slice(0, MAX_EMAIL_SUBJECT_LENGTH);
  return {
    // What the editor demands, so a built text can always be saved
    emailSubject: subject || DEFAULT_EMAIL_SUBJECT,
    emailBody: fill(template(settings, 'emailBody', DEFAULT_EMAIL_BODY)).slice(
      0,
      MAX_EMAIL_BODY_LENGTH,
    ),
  };
}

/** The last step before sending: the invoice number goes in. */
export function fillInvoiceNumber(text: string, number: string): string {
  return text.replaceAll('{number}', () => number);
}

/** The stored text, or what the template gives now for records from before texts were stored. */
export function storedOrBuiltEmailText(
  stored: StoredEmailText,
  settings: SettingRow[],
  values: EmailTextValues,
): InvoiceEmailText {
  if (stored.emailSubject != null && stored.emailBody != null) {
    return { emailSubject: stored.emailSubject, emailBody: stored.emailBody };
  }
  return buildInvoiceEmailText(settings, values);
}
