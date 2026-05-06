import fs from "fs";
import path from "path";
import { CONTEXT_DIR, QUITTUNGEN_DIR, VORLAGEN_DIR } from "./config";
import { prisma } from "./prismaClient";

const DEFAULT_EINSTELLUNGEN: Record<string, string> = {
  kassenwart: "",
  gemeinnuetzigerZweck: "Förderung der Jugend- und Musikkultur",
  finanzamtName: "",
  steuernummer: "",
  freistellungsdatum: "",
  veranlagungszeitraum: "",
};

async function initDefaultVorlage(
  typ: "ANSCHREIBEN" | "QUITTUNG",
  quelldateiName: string,
  dateiName: string,
) {
  const existing = await prisma.vorlage.findFirst({
    where: { typ, aktiv: true },
  });
  if (existing) return;

  const quellPfad = path.join(CONTEXT_DIR, quelldateiName);
  const exists = await fs.promises
    .stat(quellPfad)
    .then(() => true)
    .catch(() => false);
  if (!exists) return;

  const zielPfad = path.join(
    VORLAGEN_DIR,
    `${typ.toLowerCase()}_v1_${dateiName}`,
  );
  await fs.promises.copyFile(quellPfad, zielPfad);

  await prisma.vorlage.create({
    data: {
      typ,
      version: 1,
      dateiName: dateiName,
      dateiPfad: zielPfad,
      aktiv: true,
    },
  });
}

export async function initializeApp() {
  await fs.promises.mkdir(VORLAGEN_DIR, { recursive: true });
  await fs.promises.mkdir(QUITTUNGEN_DIR, { recursive: true });

  await initDefaultVorlage(
    "ANSCHREIBEN",
    "Briefkopf spende.docx",
    "Briefkopf_spende.docx",
  );
  await initDefaultVorlage(
    "QUITTUNG",
    "geldspende_verein.pdf",
    "geldspende_verein.pdf",
  );

  for (const [key, value] of Object.entries(DEFAULT_EINSTELLUNGEN)) {
    await prisma.systemEinstellung.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
}
