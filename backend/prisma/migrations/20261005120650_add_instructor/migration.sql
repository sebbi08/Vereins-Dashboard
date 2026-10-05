-- CreateTable
CREATE TABLE "Instructor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recipientId" INTEGER NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "months" INTEGER NOT NULL,
    "timeBlocks" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Instructor_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "InvoiceRecipient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Instructor_recipientId_key" ON "Instructor"("recipientId");
