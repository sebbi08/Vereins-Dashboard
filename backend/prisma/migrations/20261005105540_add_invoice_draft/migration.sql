-- CreateTable
CREATE TABLE "InvoiceDraft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recipientId" INTEGER NOT NULL,
    "salutation" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "positions" TEXT NOT NULL,
    "vat" INTEGER NOT NULL,
    "directDebit" BOOLEAN NOT NULL,
    "email" TEXT NOT NULL,
    "emailSalutation" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvoiceDraft_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "InvoiceRecipient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
