import { Router } from "express";
import type { QuittungEingaben, SpendenQuittungListItem } from "shared";
import { prisma } from "../prismaClient";
import { generiereQuittungPdf } from "../services/pdfGenerierung";
import { generiereQuittungsNummer } from "../services/quittungsNummer";

export const spendenQuittungRouter = Router();

function revisionZuDto(rev: {
  id: number;
  revisionNummer: number;
  status: string;
  anrede: string;
  name: string;
  strasse: string;
  ort: string;
  spendenbetragCents: number;
  spendendatum: Date;
  mitAnschreiben: boolean;
  zahlungsweg: string;
  kassenwart: string;
  gemeinnuetzigerZweck: string;
  finanzamtName: string;
  steuernummer: string;
  freistellungsdatum: string;
  veranlagungszeitraum: string;
  dateiPfad: string | null;
  erstelltAm: Date;
}) {
  return {
    id: rev.id,
    revisionNummer: rev.revisionNummer,
    status: rev.status,
    eingaben: {
      anrede: rev.anrede,
      name: rev.name,
      strasse: rev.strasse,
      ort: rev.ort,
      spendenbetragCents: rev.spendenbetragCents,
      spendendatum: rev.spendendatum.toISOString(),
      mitAnschreiben: rev.mitAnschreiben,
      zahlungsweg: rev.zahlungsweg,
      kassenwart: rev.kassenwart,
      gemeinnuetzigerZweck: rev.gemeinnuetzigerZweck,
      finanzamtName: rev.finanzamtName,
      steuernummer: rev.steuernummer,
      freistellungsdatum: rev.freistellungsdatum,
      veranlagungszeitraum: rev.veranlagungszeitraum,
    },
    dateiPfad: rev.dateiPfad,
    erstelltAm: rev.erstelltAm.toISOString(),
  };
}

// GET /api/spenden-quittung
spendenQuittungRouter.get("/", async (req, res) => {
  const search = String(req.query.search ?? "");
  const vonDatum = req.query.vonDatum
    ? new Date(String(req.query.vonDatum))
    : undefined;
  const bisDatum = req.query.bisDatum
    ? new Date(String(req.query.bisDatum))
    : undefined;
  const mitStorniert = req.query.mitStorniert === "true";

  const quittungen = await prisma.spendenQuittung.findMany({
    where: {
      ...(mitStorniert ? {} : { status: "AKTIV" }),
      ...(vonDatum || bisDatum
        ? { spendendatum: { gte: vonDatum, lte: bisDatum } }
        : {}),
      ...(search
        ? {
            OR: [
              { nummer: { contains: search } },
              { spender: { name: { contains: search } } },
            ],
          }
        : {}),
    },
    include: {
      spender: true,
      revisionen: {
        where: { status: "AKTIV" },
        orderBy: { revisionNummer: "desc" },
        take: 1,
      },
    },
    orderBy: { spendendatum: "desc" },
  });

  const list: SpendenQuittungListItem[] = quittungen.map((q) => ({
    id: q.id,
    nummer: q.nummer,
    status: q.status as "AKTIV" | "STORNIERT",
    spenderName: q.spender.name,
    spendenbetragCents: q.revisionen[0]?.spendenbetragCents ?? 0,
    spendendatum: q.spendendatum.toISOString(),
    createdAt: q.createdAt.toISOString(),
    aktiveRevisionNummer: q.revisionen[0]?.revisionNummer ?? null,
  }));

  res.json(list);
});

// GET /api/spenden-quittung/revision/:revisionId/download
spendenQuittungRouter.get(
  "/revision/:revisionId/download",
  async (req, res) => {
    const id = parseInt(req.params.revisionId);
    if (isNaN(id)) {
      res.status(400).json({ error: "Ungültige Revisions-ID" });
      return;
    }

    const revision = await prisma.spendenQuittungRevision.findUnique({
      where: { id },
      include: { quittung: true },
    });

    if (!revision) {
      res.status(404).json({ error: "Revision nicht gefunden" });
      return;
    }

    if (!revision.dateiPfad) {
      res.status(404).json({ error: "Datei nicht vorhanden" });
      return;
    }

    const dateiName = `${revision.quittung.nummer}-R${revision.revisionNummer}.pdf`;
    res.download(revision.dateiPfad, dateiName);
  },
);

// GET /api/spenden-quittung/:id
spendenQuittungRouter.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }

  const quittung = await prisma.spendenQuittung.findUnique({
    where: { id },
    include: {
      spender: true,
      revisionen: { orderBy: { revisionNummer: "desc" } },
    },
  });

  if (!quittung) {
    res.status(404).json({ error: "Quittung nicht gefunden" });
    return;
  }

  const aktiveRevision = quittung.revisionen.find((r) => r.status === "AKTIV");

  res.json({
    id: quittung.id,
    nummer: quittung.nummer,
    status: quittung.status,
    spender: quittung.spender,
    spendendatum: quittung.spendendatum.toISOString(),
    createdAt: quittung.createdAt.toISOString(),
    aktiveRevision: aktiveRevision ? revisionZuDto(aktiveRevision) : null,
    revisionen: quittung.revisionen.map(revisionZuDto),
  });
});

// POST /api/spenden-quittung
spendenQuittungRouter.post("/", async (req, res) => {
  const body = req.body as {
    spenderId?: number;
    spenderDaten?: {
      anrede: string;
      name: string;
      strasse: string;
      ort: string;
    };
    eingaben: QuittungEingaben;
  };

  const quittungsVorlage = await prisma.vorlage.findFirst({
    where: { typ: "QUITTUNG", aktiv: true },
  });
  if (!quittungsVorlage) {
    res.status(400).json({ error: "Keine aktive Quittungsvorlage vorhanden" });
    return;
  }

  const anschreibenVorlage = body.eingaben.mitAnschreiben
    ? await prisma.vorlage.findFirst({
        where: { typ: "ANSCHREIBEN", aktiv: true },
      })
    : null;

  if (body.eingaben.mitAnschreiben && !anschreibenVorlage) {
    res
      .status(400)
      .json({ error: "Keine aktive Anschreibenvorlage vorhanden" });
    return;
  }

  let spenderId = body.spenderId;
  if (!spenderId && body.spenderDaten) {
    const spender = await prisma.spender.create({ data: body.spenderDaten });
    spenderId = spender.id;
  }
  if (!spenderId) {
    res.status(400).json({ error: "Kein Spender angegeben" });
    return;
  }

  const { nummer, jahr, laufendeNummer } =
    await generiereQuittungsNummer(prisma);
  const spendendatum = new Date(body.eingaben.spendendatum);

  const { quittung, revision } = await prisma.$transaction(async (tx) => {
    const q = await tx.spendenQuittung.create({
      data: {
        nummer,
        jahr,
        laufendeNummer,
        spenderId: spenderId!,
        spendendatum,
      },
    });

    const r = await tx.spendenQuittungRevision.create({
      data: {
        quittungId: q.id,
        revisionNummer: 1,
        anrede: body.eingaben.anrede,
        name: body.eingaben.name,
        strasse: body.eingaben.strasse,
        ort: body.eingaben.ort,
        spendenbetragCents: body.eingaben.spendenbetragCents,
        spendendatum,
        mitAnschreiben: body.eingaben.mitAnschreiben,
        zahlungsweg: body.eingaben.zahlungsweg,
        kassenwart: body.eingaben.kassenwart,
        gemeinnuetzigerZweck: body.eingaben.gemeinnuetzigerZweck,
        finanzamtName: body.eingaben.finanzamtName,
        steuernummer: body.eingaben.steuernummer,
        freistellungsdatum: body.eingaben.freistellungsdatum,
        veranlagungszeitraum: body.eingaben.veranlagungszeitraum,
        anschreibenVorlageId: anschreibenVorlage?.id ?? null,
        quittungsVorlageId: quittungsVorlage.id,
      },
    });

    return { quittung: q, revision: r };
  });

  const dateiPfad = await generiereQuittungPdf(prisma, revision.id);
  await prisma.spendenQuittungRevision.update({
    where: { id: revision.id },
    data: { dateiPfad },
  });

  res
    .status(201)
    .json({ quittungId: quittung.id, revisionId: revision.id, dateiPfad });
});

// POST /api/spenden-quittung/:id/revision
spendenQuittungRouter.post("/:id/revision", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }

  const quittung = await prisma.spendenQuittung.findUnique({ where: { id } });
  if (!quittung) {
    res.status(404).json({ error: "Quittung nicht gefunden" });
    return;
  }
  if (quittung.status === "STORNIERT") {
    res
      .status(400)
      .json({ error: "Stornierte Quittungen können nicht revidiert werden" });
    return;
  }

  const body = req.body as { eingaben: QuittungEingaben };

  const quittungsVorlage = await prisma.vorlage.findFirst({
    where: { typ: "QUITTUNG", aktiv: true },
  });
  if (!quittungsVorlage) {
    res.status(400).json({ error: "Keine aktive Quittungsvorlage vorhanden" });
    return;
  }

  const anschreibenVorlage = body.eingaben.mitAnschreiben
    ? await prisma.vorlage.findFirst({
        where: { typ: "ANSCHREIBEN", aktiv: true },
      })
    : null;

  const letzteRevision = await prisma.spendenQuittungRevision.findFirst({
    where: { quittungId: id },
    orderBy: { revisionNummer: "desc" },
  });
  const neueRevisionNummer = (letzteRevision?.revisionNummer ?? 0) + 1;
  const spendendatum = new Date(body.eingaben.spendendatum);

  const neueRevision = await prisma.$transaction(async (tx) => {
    await tx.spendenQuittungRevision.updateMany({
      where: { quittungId: id, status: "AKTIV" },
      data: { status: "ERSETZT" },
    });
    await tx.spendenQuittung.update({ where: { id }, data: { spendendatum } });

    return tx.spendenQuittungRevision.create({
      data: {
        quittungId: id,
        revisionNummer: neueRevisionNummer,
        anrede: body.eingaben.anrede,
        name: body.eingaben.name,
        strasse: body.eingaben.strasse,
        ort: body.eingaben.ort,
        spendenbetragCents: body.eingaben.spendenbetragCents,
        spendendatum,
        mitAnschreiben: body.eingaben.mitAnschreiben,
        zahlungsweg: body.eingaben.zahlungsweg,
        kassenwart: body.eingaben.kassenwart,
        gemeinnuetzigerZweck: body.eingaben.gemeinnuetzigerZweck,
        finanzamtName: body.eingaben.finanzamtName,
        steuernummer: body.eingaben.steuernummer,
        freistellungsdatum: body.eingaben.freistellungsdatum,
        veranlagungszeitraum: body.eingaben.veranlagungszeitraum,
        anschreibenVorlageId: anschreibenVorlage?.id ?? null,
        quittungsVorlageId: quittungsVorlage.id,
      },
    });
  });

  const dateiPfad = await generiereQuittungPdf(prisma, neueRevision.id);
  await prisma.spendenQuittungRevision.update({
    where: { id: neueRevision.id },
    data: { dateiPfad },
  });

  res.status(201).json({ revisionId: neueRevision.id, dateiPfad });
});

// PATCH /api/spenden-quittung/:id/stornieren
spendenQuittungRouter.patch("/:id/stornieren", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }

  const quittung = await prisma.spendenQuittung.findUnique({ where: { id } });
  if (!quittung) {
    res.status(404).json({ error: "Quittung nicht gefunden" });
    return;
  }

  await prisma.spendenQuittung.update({
    where: { id },
    data: { status: "STORNIERT" },
  });

  res.json({ message: "Quittung storniert" });
});
