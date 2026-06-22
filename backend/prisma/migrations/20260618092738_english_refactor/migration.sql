/*
  English refactoring — renames tables and columns without data loss.
  Uses ALTER TABLE RENAME for all operations.
*/

-- ── Table renames ─────────────────────────────────────────────────────────

ALTER TABLE "Spender"                  RENAME TO "Donor";
ALTER TABLE "Vorlage"                  RENAME TO "Template";
ALTER TABLE "SpendenQuittung"          RENAME TO "DonationReceipt";
ALTER TABLE "SpendenQuittungRevision"  RENAME TO "DonationReceiptRevision";
ALTER TABLE "SystemEinstellung"        RENAME TO "SystemSetting";
ALTER TABLE "Rechnungsempfaenger"      RENAME TO "InvoiceRecipient";
ALTER TABLE "Rechnung"                 RENAME TO "Invoice";
ALTER TABLE "RechnungRevision"         RENAME TO "InvoiceRevision";

-- ── Donor columns ─────────────────────────────────────────────────────────

ALTER TABLE "Donor" RENAME COLUMN "strasse"       TO "street";
ALTER TABLE "Donor" RENAME COLUMN "ort"           TO "city";
ALTER TABLE "Donor" RENAME COLUMN "briefAnrede"   TO "letterSalutation";
ALTER TABLE "Donor" RENAME COLUMN "adressAnrede"  TO "addressSalutation";

-- ── Template columns ──────────────────────────────────────────────────────

ALTER TABLE "Template" RENAME COLUMN "typ"           TO "type";
ALTER TABLE "Template" RENAME COLUMN "dateiName"     TO "fileName";
ALTER TABLE "Template" RENAME COLUMN "dateiPfad"     TO "filePath";
ALTER TABLE "Template" RENAME COLUMN "aktiv"         TO "active";
ALTER TABLE "Template" RENAME COLUMN "hochgeladenAm" TO "uploadedAt";

-- ── DonationReceipt columns ───────────────────────────────────────────────

ALTER TABLE "DonationReceipt" RENAME COLUMN "nummer"         TO "number";
ALTER TABLE "DonationReceipt" RENAME COLUMN "jahr"           TO "year";
ALTER TABLE "DonationReceipt" RENAME COLUMN "laufendeNummer" TO "runningNumber";
ALTER TABLE "DonationReceipt" RENAME COLUMN "spenderId"      TO "donorId";
ALTER TABLE "DonationReceipt" RENAME COLUMN "spendendatum"   TO "donationDate";

-- ── DonationReceiptRevision columns ───────────────────────────────────────

ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "quittungId"           TO "donationReceiptId";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "revisionNummer"       TO "revisionNumber";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "strasse"              TO "street";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "ort"                  TO "city";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "briefAnrede"          TO "letterSalutation";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "adressAnrede"         TO "addressSalutation";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "spendenbetragCents"   TO "donationAmountCents";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "spendendatum"         TO "donationDate";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "mitAnschreiben"       TO "withCoverLetter";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "kassenwart"           TO "treasurer";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "gemeinnuetzigerZweck" TO "charitablePurpose";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "finanzamtName"        TO "taxOfficeName";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "steuernummer"         TO "taxNumber";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "freistellungsdatum"   TO "exemptionDate";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "veranlagungszeitraum" TO "assessmentPeriod";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "anschreibenVorlageId" TO "coverLetterTemplateId";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "quittungsVorlageId"   TO "receiptTemplateId";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "pdfFehler"            TO "pdfError";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "pdfTechFehler"        TO "pdfTechError";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "dateiPfad"            TO "filePath";
ALTER TABLE "DonationReceiptRevision" RENAME COLUMN "erstelltAm"           TO "createdAt";

-- ── InvoiceRecipient columns ──────────────────────────────────────────────

ALTER TABLE "InvoiceRecipient" RENAME COLUMN "strasse" TO "street";
ALTER TABLE "InvoiceRecipient" RENAME COLUMN "ort"     TO "city";
ALTER TABLE "InvoiceRecipient" RENAME COLUMN "anrede"  TO "salutation";

-- ── Invoice columns ───────────────────────────────────────────────────────

ALTER TABLE "Invoice" RENAME COLUMN "nummer"         TO "number";
ALTER TABLE "Invoice" RENAME COLUMN "jahr"           TO "year";
ALTER TABLE "Invoice" RENAME COLUMN "laufendeNummer" TO "runningNumber";
ALTER TABLE "Invoice" RENAME COLUMN "empfaengerId"   TO "recipientId";
ALTER TABLE "Invoice" RENAME COLUMN "rechnungsdatum" TO "invoiceDate";

-- ── InvoiceRevision columns ───────────────────────────────────────────────

ALTER TABLE "InvoiceRevision" RENAME COLUMN "rechnungId"      TO "invoiceId";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "revisionNummer"  TO "revisionNumber";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "anrede"          TO "salutation";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "strasse"         TO "street";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "ort"             TO "city";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "rechnungsdatum"  TO "invoiceDate";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "positionen"      TO "positions";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "ust"             TO "vat";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "einzug"          TO "directDebit";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "mailAnrede"      TO "emailSalutation";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "vorlageId"       TO "templateId";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "pdfFehler"       TO "pdfError";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "pdfTechFehler"   TO "pdfTechError";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "dateiPfad"       TO "filePath";
ALTER TABLE "InvoiceRevision" RENAME COLUMN "erstelltAm"      TO "createdAt";

-- ── Fix foreign key references after renames ──────────────────────────────
-- SQLite handles FK references automatically across table/column renames,
-- so no explicit FK updates are needed.
