-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Availability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Availability_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Availability" ("available", "blockId", "dayIndex", "id", "userId", "weekId") SELECT "available", "blockId", "dayIndex", "id", "userId", "weekId" FROM "Availability";
DROP TABLE "Availability";
ALTER TABLE "new_Availability" RENAME TO "Availability";
CREATE INDEX "Availability_weekId_idx" ON "Availability"("weekId");
CREATE INDEX "Availability_userId_idx" ON "Availability"("userId");
CREATE UNIQUE INDEX "Availability_userId_weekId_blockId_dayIndex_key" ON "Availability"("userId", "weekId", "blockId", "dayIndex");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("email", "id", "name", "role") SELECT "email", "id", "name", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "new_Week" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startMonday" DATETIME NOT NULL,
    "lockAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Week" ("id", "startMonday") SELECT "id", "startMonday" FROM "Week";
DROP TABLE "Week";
ALTER TABLE "new_Week" RENAME TO "Week";
CREATE UNIQUE INDEX "Week_startMonday_key" ON "Week"("startMonday");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
