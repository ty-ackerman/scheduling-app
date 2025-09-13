/*
  Warnings:

  - You are about to drop the column `createdAt` on the `DatedBlock` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `DatedBlock` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DatedBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monthId" TEXT NOT NULL,
    "dateISO" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "label" TEXT,
    "isClass" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DatedBlock_monthId_fkey" FOREIGN KEY ("monthId") REFERENCES "Month" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DatedBlock" ("dateISO", "endMin", "id", "isClass", "label", "locked", "monthId", "startMin") SELECT "dateISO", "endMin", "id", "isClass", "label", "locked", "monthId", "startMin" FROM "DatedBlock";
DROP TABLE "DatedBlock";
ALTER TABLE "new_DatedBlock" RENAME TO "DatedBlock";
CREATE INDEX "DatedBlock_monthId_dateISO_startMin_idx" ON "DatedBlock"("monthId", "dateISO", "startMin");
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
INSERT INTO "new_User" ("createdAt", "email", "id", "image", "location", "name", "rolesJson", "updatedAt") SELECT "createdAt", "email", "id", "image", "location", "name", "rolesJson", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
