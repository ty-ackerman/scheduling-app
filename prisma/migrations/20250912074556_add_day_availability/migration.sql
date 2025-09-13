-- CreateTable
CREATE TABLE "DayAvailability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "datedBlockId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DayAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DayAvailability_datedBlockId_fkey" FOREIGN KEY ("datedBlockId") REFERENCES "DatedBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DayAvailability_datedBlockId_idx" ON "DayAvailability"("datedBlockId");

-- CreateIndex
CREATE UNIQUE INDEX "DayAvailability_userId_datedBlockId_key" ON "DayAvailability"("userId", "datedBlockId");
