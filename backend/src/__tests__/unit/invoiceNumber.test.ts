import { describe, expect, it, vi } from 'vitest';
import { generateInvoiceNumber } from '../../services/invoiceNumber';

function makeMockPrisma(lastInvoice: { runningNumber: number } | null) {
  return {
    invoice: {
      findFirst: vi.fn().mockResolvedValue(lastInvoice),
    },
  };
}

describe('generateInvoiceNumber', () => {
  it('starts at 1 when no invoices exist for the year', async () => {
    const prisma = makeMockPrisma(null);
    const result = await generateInvoiceNumber(prisma as never);
    const year = new Date().getFullYear();

    expect(result.runningNumber).toBe(1);
    expect(result.year).toBe(year);
    expect(result.number).toBe(`1 / ${year}`);
  });

  it('increments from the last invoice', async () => {
    const prisma = makeMockPrisma({ runningNumber: 5 });
    const result = await generateInvoiceNumber(prisma as never);
    const year = new Date().getFullYear();

    expect(result.runningNumber).toBe(6);
    expect(result.number).toBe(`6 / ${year}`);
  });

  it('passes the current year to prisma when searching', async () => {
    const prisma = makeMockPrisma(null);
    await generateInvoiceNumber(prisma as never);
    const year = new Date().getFullYear();

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { year },
      }),
    );
  });
});
