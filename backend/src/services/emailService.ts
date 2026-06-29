import nodemailer from 'nodemailer';
import type { PrismaClient } from '../../prisma/generated/client.js';
import { toAbsolutePath } from '../config.js';

export function getSetting(rows: { key: string; value: string }[], key: string): string {
  return rows.find((r) => r.key === key)?.value ?? '';
}

export function replaceVariables(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

export async function sendInvoiceEmail(
  prisma: PrismaClient,
  revisionId: number,
  options?: { forceTestAddress?: boolean },
): Promise<{ success: boolean; error?: string }> {
  const revision = await prisma.invoiceRevision.findUnique({
    where: { id: revisionId },
    include: { invoice: true },
  });

  if (!revision) {
    return { success: false, error: 'Revision not found' };
  }

  if (revision.pdfStatus !== 'OK' || !revision.filePath) {
    return { success: false, error: 'No PDF available for this revision' };
  }

  if (revision.invoice.status === 'STORNIERT') {
    return { success: false, error: 'Canceled invoices cannot be sent by email' };
  }

  const settings = await prisma.systemSetting.findMany();

  const smtpHost = getSetting(settings, 'smtpHost');
  const smtpPort = parseInt(getSetting(settings, 'smtpPort') || '587', 10);
  const smtpUser = getSetting(settings, 'smtpUser');
  const smtpPassword = getSetting(settings, 'smtpPassword');
  const smtpSecure = getSetting(settings, 'smtpSecure') === 'true';
  const emailSubject = getSetting(settings, 'emailSubject') || 'Ihre Rechnung {number}';
  const emailBody =
    getSetting(settings, 'emailBody') ||
    '{salutation}\n\nanbei erhalten Sie Ihre Rechnung {number}.\n\nMit freundlichen Grüßen';
  const testAddress = getSetting(settings, 'emailTestAddress');

  if (!smtpHost || !smtpUser || !smtpPassword) {
    return { success: false, error: 'SMTP settings are not configured' };
  }

  const vars: Record<string, string> = {
    salutation: revision.emailSalutation,
    name: revision.name,
    number: revision.invoice.number,
    title: revision.title,
    email: revision.email,
  };

  let to = revision.email;
  let body = replaceVariables(emailBody, vars);
  const subject = replaceVariables(emailSubject, vars);
  const forceTestAddress = options?.forceTestAddress === true;

  if (forceTestAddress) {
    if (!testAddress) {
      return { success: false, error: 'Test email address is not configured' };
    }
    body = `[TEST SEND — Original recipient: ${revision.name} <${revision.email}>]\n\n${body}`;
    to = testAddress;
  } else {
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev && testAddress) {
      body = `[DEV OVERRIDE — Original recipient: ${revision.name} <${revision.email}>]\n\n${body}`;
      to = testAddress;
    }
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });

  try {
    const absolutePath = toAbsolutePath(revision.filePath);
    await transporter.sendMail({
      from: smtpUser,
      to,
      subject,
      text: body,
      attachments: [
        {
          filename: `${revision.invoice.number.replace(/\s*\/\s*/g, '-')}.pdf`,
          path: absolutePath,
        },
      ],
    });

    if (forceTestAddress) {
      return { success: true };
    }

    await prisma.invoiceRevision.update({
      where: { id: revisionId },
      data: { emailStatus: 'SENT', emailError: null },
    });

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (forceTestAddress) {
      return { success: false, error: errorMessage };
    }

    await prisma.invoiceRevision.update({
      where: { id: revisionId },
      data: { emailStatus: 'FAILED', emailError: errorMessage },
    });

    return { success: false, error: errorMessage };
  }
}

export async function sendTestEmail(
  prisma: PrismaClient,
): Promise<{ success: boolean; error?: string }> {
  const settings = await prisma.systemSetting.findMany();

  const smtpHost = getSetting(settings, 'smtpHost');
  const smtpPort = parseInt(getSetting(settings, 'smtpPort') || '587', 10);
  const smtpUser = getSetting(settings, 'smtpUser');
  const smtpPassword = getSetting(settings, 'smtpPassword');
  const smtpSecure = getSetting(settings, 'smtpSecure') === 'true';
  const testAddress = getSetting(settings, 'emailTestAddress');

  if (!smtpHost || !smtpUser || !smtpPassword) {
    return { success: false, error: 'SMTP settings are not configured' };
  }

  if (!testAddress) {
    return { success: false, error: 'Test email address is not configured' };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });

  try {
    await transporter.sendMail({
      from: smtpUser,
      to: testAddress,
      subject: 'MV Dashboard — Test Email',
      text: 'This is a test email from the MV Dashboard email configuration.\n\nIf you receive this, your SMTP settings are correct.',
    });

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMessage };
  }
}
