import type { InvoiceContent, InvoiceLineItem } from 'shared';
import type { Prisma } from '../../prisma/generated/client.js';
import { generateInvoiceNumber } from './invoiceNumber.js';

export class RecipientError extends Error {}

export interface RecipientData {
  name: string;
  street: string;
  city: string;
  email?: string;
  salutation?: string;
}

export interface RecipientSelection {
  recipientId?: number;
  recipientData?: RecipientData;
}

export function validateRequiredFields(inputs: InvoiceContent): string | null {
  if (!inputs.name.trim()) return 'Name is required';
  if (!inputs.street.trim()) return 'Street is required';
  if (!inputs.city.trim()) return 'City is required';
  if (!inputs.title.trim()) return 'Title is required';
  if (!inputs.lineItems || inputs.lineItems.length === 0) {
    return 'At least one line item is required';
  }
  for (let i = 0; i < inputs.lineItems.length; i++) {
    if (!inputs.lineItems[i].text.trim()) {
      return `Line item ${i + 1}: Text is required`;
    }
    if (inputs.lineItems[i].priceInCents <= 0) {
      return `Line item ${i + 1}: Price must be greater than 0`;
    }
  }
  if (inputs.vat !== 7 && inputs.vat !== 19) {
    return 'VAT must be 7% or 19%';
  }
  return null;
}

export function calculateGross(positionsJson: string, vat: number): number {
  const lineItems: InvoiceLineItem[] = JSON.parse(positionsJson);
  const net = lineItems.reduce((sum, p) => sum + p.priceInCents, 0);
  const tax = Math.round(net * (vat / 100));
  return net + tax;
}

/**
 * Updates the selected recipient in place from the form inputs, or creates a
 * new one from recipientData. Returns the recipient id.
 */
export async function saveRecipient(
  tx: Prisma.TransactionClient,
  selection: RecipientSelection,
  inputs: InvoiceContent,
): Promise<number> {
  if (selection.recipientId) {
    const existing = await tx.invoiceRecipient.findUnique({
      where: { id: selection.recipientId },
    });
    if (!existing) {
      throw new RecipientError('Recipient not found');
    }

    await tx.invoiceRecipient.update({
      where: { id: selection.recipientId },
      data: {
        name: inputs.name,
        street: inputs.street,
        city: inputs.city,
        email: inputs.email || null,
        salutation: inputs.salutation || null,
      },
    });
    return selection.recipientId;
  }

  if (!selection.recipientData) {
    throw new RecipientError('No recipient specified');
  }

  const created = await tx.invoiceRecipient.create({
    data: {
      name: selection.recipientData.name,
      street: selection.recipientData.street,
      city: selection.recipientData.city,
      email: selection.recipientData.email || null,
      salutation: selection.recipientData.salutation || null,
    },
  });
  return created.id;
}

export async function createInvoiceWithFirstRevision(
  tx: Prisma.TransactionClient,
  params: { recipientId: number; inputs: InvoiceContent; invoiceDate: Date; templateId: number },
) {
  const { recipientId, inputs, invoiceDate, templateId } = params;
  const { number, year, runningNumber } = await generateInvoiceNumber(tx);

  const invoice = await tx.invoice.create({
    data: { number, year, runningNumber, recipientId, invoiceDate },
  });

  const revision = await tx.invoiceRevision.create({
    data: {
      invoiceId: invoice.id,
      revisionNumber: 1,
      salutation: inputs.salutation,
      name: inputs.name,
      street: inputs.street,
      city: inputs.city,
      invoiceDate,
      title: inputs.title,
      positions: JSON.stringify(inputs.lineItems),
      vat: inputs.vat,
      directDebit: inputs.directDebit,
      email: inputs.email,
      emailSalutation: inputs.emailSalutation,
      templateId,
      pdfStatus: 'PENDING',
    },
  });

  return { invoice, revision };
}
