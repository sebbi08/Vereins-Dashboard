CREATE TABLE "VorlagePreview" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "typ" TEXT NOT NULL,
  "dateiPfad" TEXT,
  "erstelltAm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "VorlagePreview_typ_key" ON "VorlagePreview"("typ");
