import { PrismaClient } from "@prisma/client";

export async function generiereQuittungsNummer(
  prisma: PrismaClient,
): Promise<{ nummer: string; jahr: number; laufendeNummer: number }> {
  const jahr = new Date().getFullYear();

  const letzteQuittung = await prisma.spendenQuittung.findFirst({
    where: { jahr },
    orderBy: { laufendeNummer: "desc" },
  });

  const laufendeNummer = letzteQuittung ? letzteQuittung.laufendeNummer + 1 : 1;
  const nummer = `SQ-${jahr}-${String(laufendeNummer).padStart(4, "0")}`;

  return { nummer, jahr, laufendeNummer };
}
