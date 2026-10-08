-- CreateIndex
CREATE UNIQUE INDEX "DonationReceiptRevision_donationReceiptId_revisionNumber_key" ON "DonationReceiptRevision"("donationReceiptId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRevision_invoiceId_revisionNumber_key" ON "InvoiceRevision"("invoiceId", "revisionNumber");
