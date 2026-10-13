-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "emailBody" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "emailSubject" TEXT;

-- AlterTable
ALTER TABLE "InvoiceDraft" ADD COLUMN "emailBody" TEXT;
ALTER TABLE "InvoiceDraft" ADD COLUMN "emailSubject" TEXT;
