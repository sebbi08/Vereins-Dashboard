-- CreateTable
CREATE TABLE "Rechnungsempfaenger" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "strasse" TEXT NOT NULL,
    "ort" TEXT NOT NULL,
    "email" TEXT,
    "anrede" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Rechnung" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nummer" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "laufendeNummer" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AKTIV',
    "empfaengerId" INTEGER NOT NULL,
    "rechnungsdatum" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Rechnung_empfaengerId_fkey" FOREIGN KEY ("empfaengerId") REFERENCES "Rechnungsempfaenger" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RechnungRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rechnungId" INTEGER NOT NULL,
    "revisionNummer" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AKTIV',
    "anrede" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strasse" TEXT NOT NULL,
    "ort" TEXT NOT NULL,
    "rechnungsdatum" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "positionen" TEXT NOT NULL,
    "ust" INTEGER NOT NULL,
    "einzug" BOOLEAN NOT NULL,
    "email" TEXT NOT NULL,
    "mailAnrede" TEXT NOT NULL,
    "vorlageId" INTEGER NOT NULL,
    "pdfStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "pdfFehler" TEXT,
    "pdfTechFehler" TEXT,
    "dateiPfad" TEXT,
    "erstelltAm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RechnungRevision_rechnungId_fkey" FOREIGN KEY ("rechnungId") REFERENCES "Rechnung" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RechnungRevision_vorlageId_fkey" FOREIGN KEY ("vorlageId") REFERENCES "Vorlage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Rechnung_nummer_key" ON "Rechnung"("nummer");
