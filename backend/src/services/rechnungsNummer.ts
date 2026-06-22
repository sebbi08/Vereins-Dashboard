import type { PrismaClient } from '../../prisma/generated/client.js';

export async function generateInvoiceNumber(
  prisma: PrismaClient,
): Promise<{ number: string; year: number; runningNumber: number }> {
  const year = new Date().getFullYear();

  const lastInvoice = await prisma.invoice.findFirst({
    where: { year },
    orderBy: { runningNumber: 'desc' },
  });

  const runningNumber = lastInvoice ? lastInvoice.runningNumber + 1 : 1;
  const number = `${runningNumber} / ${year}`;

  return { number, year, runningNumber };
}
