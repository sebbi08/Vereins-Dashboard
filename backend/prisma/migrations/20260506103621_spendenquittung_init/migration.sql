-- CreateTable
CREATE TABLE "Spender" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "anrede" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strasse" TEXT NOT NULL,
    "ort" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Vorlage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "typ" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "dateiName" TEXT NOT NULL,
    "dateiPfad" TEXT NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT false,
    "hochgeladenAm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SpendenQuittung" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nummer" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "laufendeNummer" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AKTIV',
    "spenderId" INTEGER NOT NULL,
    "spendendatum" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpendenQuittung_spenderId_fkey" FOREIGN KEY ("spenderId") REFERENCES "Spender" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpendenQuittungRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quittungId" INTEGER NOT NULL,
    "revisionNummer" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AKTIV',
    "anrede" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strasse" TEXT NOT NULL,
    "ort" TEXT NOT NULL,
    "spendenbetragCents" INTEGER NOT NULL,
    "spendendatum" DATETIME NOT NULL,
    "mitAnschreiben" BOOLEAN NOT NULL,
    "zahlungsweg" TEXT NOT NULL DEFAULT 'BANK',
    "kassenwart" TEXT NOT NULL,
    "gemeinnuetzigerZweck" TEXT NOT NULL,
    "finanzamtName" TEXT NOT NULL,
    "steuernummer" TEXT NOT NULL,
    "freistellungsdatum" TEXT NOT NULL,
    "veranlagungszeitraum" TEXT NOT NULL,
    "anschreibenVorlageId" INTEGER,
    "quittungsVorlageId" INTEGER NOT NULL,
    "dateiPfad" TEXT,
    "erstelltAm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpendenQuittungRevision_quittungId_fkey" FOREIGN KEY ("quittungId") REFERENCES "SpendenQuittung" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpendenQuittungRevision_anschreibenVorlageId_fkey" FOREIGN KEY ("anschreibenVorlageId") REFERENCES "Vorlage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SpendenQuittungRevision_quittungsVorlageId_fkey" FOREIGN KEY ("quittungsVorlageId") REFERENCES "Vorlage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemEinstellung" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SpendenQuittung_nummer_key" ON "SpendenQuittung"("nummer");

-- CreateIndex
CREATE UNIQUE INDEX "SystemEinstellung_key_key" ON "SystemEinstellung"("key");
