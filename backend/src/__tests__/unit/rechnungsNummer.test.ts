import { describe, expect, it, vi } from 'vitest';
import { generiereRechnungsNummer } from '../../services/rechnungsNummer';

function makeMockPrisma(lastRechnung: { laufendeNummer: number } | null) {
  return {
    rechnung: {
      findFirst: vi.fn().mockResolvedValue(lastRechnung),
    },
  } as never;
}

describe('generiereRechnungsNummer', () => {
  it('starts at 1 when no rechnungen exist for the year', async () => {
    const prisma = makeMockPrisma(null);
    const result = await generiereRechnungsNummer(prisma);
    const year = new Date().getFullYear();

    expect(result.laufendeNummer).toBe(1);
    expect(result.jahr).toBe(year);
    expect(result.nummer).toBe(`1 / ${year}`);
  });

  it('increments from the last rechnung', async () => {
    const prisma = makeMockPrisma({ laufendeNummer: 5 });
    const result = await generiereRechnungsNummer(prisma);
    const year = new Date().getFullYear();

    expect(result.laufendeNummer).toBe(6);
    expect(result.nummer).toBe(`6 / ${year}`);
  });

  it('passes the current year to prisma when searching', async () => {
    const prisma = makeMockPrisma(null);
    await generiereRechnungsNummer(prisma);
    const year = new Date().getFullYear();

    expect(prisma.rechnung.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jahr: year },
      }),
    );
  });
});
