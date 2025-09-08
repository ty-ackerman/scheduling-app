/*
  Warnings:

  - You are about to drop the `Assignment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Week` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `available` on the `Availability` table. All the data in the column will be lost.
  - You are about to drop the column `dayIndex` on the `Availability` table. All the data in the column will be lost.
  - You are about to drop the column `weekId` on the `Availability` table. All the data in the column will be lost.
  - You are about to drop the column `endTime` on the `Block` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `Block` table. All the data in the column will be lost.
  - You are about to alter the column `day` on the `Block` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.
  - Added the required column `monthId` to the `Availability` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Availability` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endMin` to the `Block` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startMin` to the `Block` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Assignment_weekId_dayIndex_blockId_role_key";

-- DropIndex
DROP INDEX "Assignment_assignedUserId_idx";

-- DropIndex
DROP INDEX "Assignment_weekId_idx";

-- DropIndex
DROP INDEX "Week_startMonday_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Assignment";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Week";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Month" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Availability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "monthId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "everyWeek" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Availability_monthId_fkey" FOREIGN KEY ("monthId") REFERENCES "Month" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Availability_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Availability" ("blockId", "id", "userId") SELECT "blockId", "id", "userId" FROM "Availability";
DROP TABLE "Availability";
ALTER TABLE "new_Availability" RENAME TO "Availability";
CREATE INDEX "Availability_monthId_idx" ON "Availability"("monthId");
CREATE INDEX "Availability_blockId_idx" ON "Availability"("blockId");
CREATE UNIQUE INDEX "Availability_userId_monthId_blockId_key" ON "Availability"("userId", "monthId", "blockId");
CREATE TABLE "new_Block" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "label" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "isClass" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Block" ("createdAt", "day", "id", "label", "updatedAt") SELECT "createdAt", "day", "id", "label", "updatedAt" FROM "Block";
DROP TABLE "Block";
ALTER TABLE "new_Block" RENAME TO "Block";
CREATE INDEX "Block_day_startMin_idx" ON "Block"("day", "startMin");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "location" TEXT NOT NULL DEFAULT 'COLLEGE_WEST',
    "rolesJson" JSONB NOT NULL DEFAULT []
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "updatedAt") SELECT "createdAt", "email", "id", "name", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Month_year_month_key" ON "Month"("year", "month");
