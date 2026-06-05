import type { PrismaClient } from '../../prisma/generated/client.js';

export async function generiereRechnungsNummer(
  prisma: PrismaClient,
): Promise<{ nummer: string; jahr: number; laufendeNummer: number }> {
  const jahr = new Date().getFullYear();

  const letzteRechnung = await prisma.rechnung.findFirst({
    where: { jahr },
    orderBy: { laufendeNummer: 'desc' },
  });

  const laufendeNummer = letzteRechnung ? letzteRechnung.laufendeNummer + 1 : 1;
  const nummer = `${laufendeNummer} / ${jahr}`;

  return { nummer, jahr, laufendeNummer };
}
