import fs from 'fs';
import { QUITTUNGEN_DIR, VORLAGEN_DIR } from './config.js';
import { prisma } from './prismaClient.js';

const DEFAULT_EINSTELLUNGEN: Record<string, string> = {
  kassenwart: '',
  gemeinnuetzigerZweck: 'Förderung der Jugend- und Musikkultur',
  finanzamtName: '',
  steuernummer: '',
  freistellungsdatum: '',
  veranlagungszeitraum: '',
};

export async function initializeApp() {
  await fs.promises.mkdir(VORLAGEN_DIR, { recursive: true });
  await fs.promises.mkdir(QUITTUNGEN_DIR, { recursive: true });

  for (const [key, value] of Object.entries(DEFAULT_EINSTELLUNGEN)) {
    await prisma.systemEinstellung.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
}
