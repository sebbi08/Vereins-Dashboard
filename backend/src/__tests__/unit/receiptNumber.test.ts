import { describe, expect, it, vi } from 'vitest';
import { generateReceiptNumber } from '../../services/receiptNumber';

function makeMockPrisma(lastReceipt: { runningNumber: number } | null) {
  return {
    donationReceipt: {
      findFirst: vi.fn().mockResolvedValue(lastReceipt),
    },
  };
}

describe('generateReceiptNumber', () => {
  it('starts at 0001 when no receipts exist for the year', async () => {
    const prisma = makeMockPrisma(null);
    const result = await generateReceiptNumber(prisma as never);
    const year = new Date().getFullYear();

    expect(result.runningNumber).toBe(1);
    expect(result.year).toBe(year);
    expect(result.number).toBe(`SQ-${year}-0001`);
  });

  it('increments the running number from the last receipt', async () => {
    const prisma = makeMockPrisma({ runningNumber: 5 });
    const result = await generateReceiptNumber(prisma as never);
    const year = new Date().getFullYear();

    expect(result.runningNumber).toBe(6);
    expect(result.number).toBe(`SQ-${year}-0006`);
  });

  it('pads the running number to four digits', async () => {
    const prisma = makeMockPrisma({ runningNumber: 99 });
    const result = await generateReceiptNumber(prisma as never);
    const year = new Date().getFullYear();

    expect(result.number).toBe(`SQ-${year}-0100`);
  });

  it('passes the current year to prisma when searching', async () => {
    const prisma = makeMockPrisma(null);
    await generateReceiptNumber(prisma as never);
    const year = new Date().getFullYear();

    expect(prisma.donationReceipt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { year },
      }),
    );
  });
});
