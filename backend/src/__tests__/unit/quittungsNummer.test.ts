import { describe, expect, it, vi } from 'vitest';
import { generiereQuittungsNummer } from '../../services/quittungsNummer';

function makeMockPrisma(lastQuittung: { laufendeNummer: number } | null) {
  return {
    spendenQuittung: {
      findFirst: vi.fn().mockResolvedValue(lastQuittung),
    },
  } as never;
}

describe('generiereQuittungsNummer', () => {
  it('starts at 0001 when no quittungen exist for the year', async () => {
    const prisma = makeMockPrisma(null);
    const result = await generiereQuittungsNummer(prisma);
    const year = new Date().getFullYear();

    expect(result.laufendeNummer).toBe(1);
    expect(result.jahr).toBe(year);
    expect(result.nummer).toBe(`SQ-${year}-0001`);
  });

  it('increments the running number from the last quittung', async () => {
    const prisma = makeMockPrisma({ laufendeNummer: 5 });
    const result = await generiereQuittungsNummer(prisma);
    const year = new Date().getFullYear();

    expect(result.laufendeNummer).toBe(6);
    expect(result.nummer).toBe(`SQ-${year}-0006`);
  });

  it('pads the running number to four digits', async () => {
    const prisma = makeMockPrisma({ laufendeNummer: 99 });
    const result = await generiereQuittungsNummer(prisma);
    const year = new Date().getFullYear();

    expect(result.nummer).toBe(`SQ-${year}-0100`);
  });

  it('passes the current year to prisma when searching', async () => {
    const prisma = makeMockPrisma(null);
    await generiereQuittungsNummer(prisma);
    const year = new Date().getFullYear();

    expect(prisma.spendenQuittung.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jahr: year },
      }),
    );
  });
});
