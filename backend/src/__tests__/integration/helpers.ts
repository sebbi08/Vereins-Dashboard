import { afterEach } from 'vitest';
import { prisma } from '../../prismaClient';

/**
 * Cleans all database tables between integration tests, preserving default
 * system settings that are seeded by initializeApp().
 */
export async function cleanDatabase() {
  await prisma.rechnungRevision.deleteMany();
  await prisma.rechnung.deleteMany();
  await prisma.rechnungsempfaenger.deleteMany();
  await prisma.spendenQuittungRevision.deleteMany();
  await prisma.spendenQuittung.deleteMany();
  await prisma.vorlage.deleteMany();
  await prisma.spender.deleteMany();
  await prisma.systemEinstellung.deleteMany();
}

export function useCleanDatabase() {
  afterEach(async () => {
    await cleanDatabase();
  });
}
