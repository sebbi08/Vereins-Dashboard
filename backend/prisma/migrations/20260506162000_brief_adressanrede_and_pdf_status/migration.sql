-- Hard cut: remove legacy salutation fields and introduce BriefAnrede/AdressAnrede.
-- Also persist PDF generation state and errors on revisions.

ALTER TABLE "Spender" ADD COLUMN "briefAnrede" TEXT NOT NULL DEFAULT 'Sehr geehrte Damen und Herren';
ALTER TABLE "Spender" ADD COLUMN "adressAnrede" TEXT;

ALTER TABLE "SpendenQuittungRevision" ADD COLUMN "briefAnrede" TEXT NOT NULL DEFAULT 'Sehr geehrte Damen und Herren';
ALTER TABLE "SpendenQuittungRevision" ADD COLUMN "adressAnrede" TEXT;
ALTER TABLE "SpendenQuittungRevision" ADD COLUMN "pdfStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "SpendenQuittungRevision" ADD COLUMN "pdfFehler" TEXT;
ALTER TABLE "SpendenQuittungRevision" ADD COLUMN "pdfTechFehler" TEXT;

ALTER TABLE "Spender" DROP COLUMN "anrede";
ALTER TABLE "SpendenQuittungRevision" DROP COLUMN "anrede";
ALTER TABLE "SpendenQuittungRevision" DROP COLUMN "anschreibenAnredeFreitext";
