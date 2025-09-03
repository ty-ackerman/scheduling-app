-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "blockId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assignment_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Assignment_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Assignment_weekId_idx" ON "Assignment"("weekId");

-- CreateIndex
CREATE INDEX "Assignment_assignedUserId_idx" ON "Assignment"("assignedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_weekId_dayIndex_blockId_role_key" ON "Assignment"("weekId", "dayIndex", "blockId", "role");
