-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DonationReceiptRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "donationReceiptId" INTEGER NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AKTIV',
    "name" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "letterSalutation" TEXT NOT NULL,
    "addressSalutation" TEXT,
    "donationAmountCents" INTEGER NOT NULL,
    "donationDate" DATETIME NOT NULL,
    "withCoverLetter" BOOLEAN NOT NULL,
    "treasurer" TEXT NOT NULL,
    "charitablePurpose" TEXT NOT NULL,
    "taxOfficeName" TEXT NOT NULL,
    "taxNumber" TEXT NOT NULL,
    "exemptionDate" TEXT NOT NULL,
    "assessmentPeriod" TEXT NOT NULL,
    "coverLetterTemplateId" INTEGER,
    "receiptTemplateId" INTEGER NOT NULL,
    "pdfStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "pdfError" TEXT,
    "pdfTechError" TEXT,
    "filePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DonationReceiptRevision_donationReceiptId_fkey" FOREIGN KEY ("donationReceiptId") REFERENCES "DonationReceipt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DonationReceiptRevision_coverLetterTemplateId_fkey" FOREIGN KEY ("coverLetterTemplateId") REFERENCES "Template" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DonationReceiptRevision_receiptTemplateId_fkey" FOREIGN KEY ("receiptTemplateId") REFERENCES "Template" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DonationReceiptRevision" ("addressSalutation", "assessmentPeriod", "charitablePurpose", "city", "coverLetterTemplateId", "createdAt", "donationAmountCents", "donationDate", "donationReceiptId", "exemptionDate", "filePath", "id", "letterSalutation", "name", "pdfError", "pdfStatus", "pdfTechError", "receiptTemplateId", "revisionNumber", "status", "street", "taxNumber", "taxOfficeName", "treasurer", "withCoverLetter") SELECT "addressSalutation", "assessmentPeriod", "charitablePurpose", "city", "coverLetterTemplateId", "createdAt", "donationAmountCents", "donationDate", "donationReceiptId", "exemptionDate", "filePath", "id", "letterSalutation", "name", "pdfError", "pdfStatus", "pdfTechError", "receiptTemplateId", "revisionNumber", "status", "street", "taxNumber", "taxOfficeName", "treasurer", "withCoverLetter" FROM "DonationReceiptRevision";
DROP TABLE "DonationReceiptRevision";
ALTER TABLE "new_DonationReceiptRevision" RENAME TO "DonationReceiptRevision";
CREATE TABLE "new_Donor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "letterSalutation" TEXT NOT NULL,
    "addressSalutation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Donor" ("addressSalutation", "city", "createdAt", "id", "letterSalutation", "name", "street", "updatedAt") SELECT "addressSalutation", "city", "createdAt", "id", "letterSalutation", "name", "street", "updatedAt" FROM "Donor";
DROP TABLE "Donor";
ALTER TABLE "new_Donor" RENAME TO "Donor";
CREATE TABLE "new_InvoiceRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AKTIV',
    "salutation" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "positions" TEXT NOT NULL,
    "vat" INTEGER NOT NULL,
    "directDebit" BOOLEAN NOT NULL,
    "email" TEXT NOT NULL,
    "emailSalutation" TEXT NOT NULL,
    "templateId" INTEGER NOT NULL,
    "pdfStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "pdfError" TEXT,
    "pdfTechError" TEXT,
    "filePath" TEXT,
    "emailStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',
    "emailError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceRevision_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvoiceRevision_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InvoiceRevision" ("city", "createdAt", "directDebit", "email", "emailSalutation", "filePath", "id", "invoiceDate", "invoiceId", "name", "pdfError", "pdfStatus", "pdfTechError", "positions", "revisionNumber", "salutation", "status", "street", "templateId", "title", "vat") SELECT "city", "createdAt", "directDebit", "email", "emailSalutation", "filePath", "id", "invoiceDate", "invoiceId", "name", "pdfError", "pdfStatus", "pdfTechError", "positions", "revisionNumber", "salutation", "status", "street", "templateId", "title", "vat" FROM "InvoiceRevision";
DROP TABLE "InvoiceRevision";
ALTER TABLE "new_InvoiceRevision" RENAME TO "InvoiceRevision";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- RedefineIndex
DROP INDEX "SpendenQuittung_nummer_key";
CREATE UNIQUE INDEX "DonationReceipt_number_key" ON "DonationReceipt"("number");

-- RedefineIndex
DROP INDEX "Rechnung_nummer_key";
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- RedefineIndex
DROP INDEX "SystemEinstellung_key_key";
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");
