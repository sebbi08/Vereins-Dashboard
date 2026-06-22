import type { PrismaClient } from '../../prisma/generated/client.js';

export async function generateReceiptNumber(
  prisma: PrismaClient,
): Promise<{ number: string; year: number; runningNumber: number }> {
  const year = new Date().getFullYear();

  const lastReceipt = await prisma.donationReceipt.findFirst({
    where: { year },
    orderBy: { runningNumber: 'desc' },
  });

  const runningNumber = lastReceipt ? lastReceipt.runningNumber + 1 : 1;
  const number = `SQ-${year}-${String(runningNumber).padStart(4, '0')}`;

  return { number, year, runningNumber };
}
